import { NextRequest } from "next/server";
import { findModel, type ProviderId } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Endpoint = { url: string; key?: string; extraHeaders?: Record<string, string> };

/**
 * Every provider below speaks the OpenAI chat-completions dialect, so one
 * streaming pipeline covers all of them.
 */
function resolveEndpoint(
  provider: ProviderId,
  userKeys: Record<string, string | undefined>,
): Endpoint | { error: string } {
  const pick = (envName: string, provKey?: string) =>
    (provKey && provKey.trim()) || process.env[envName] || "";

  switch (provider) {
    case "pollinations":
      return {
        url: "https://text.pollinations.ai/openai",
        key: process.env.POLLINATIONS_TOKEN || undefined,
      };
    case "groq": {
      const key = pick("GROQ_API_KEY", userKeys.groq);
      if (!key) return { error: "Groq API key missing. Add a free key in Settings." };
      return { url: "https://api.groq.com/openai/v1/chat/completions", key };
    }
    case "openrouter": {
      const key = pick("OPENROUTER_API_KEY", userKeys.openrouter);
      if (!key) return { error: "OpenRouter API key missing. Add a free key in Settings." };
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        key,
        extraHeaders: { "X-Title": "RV AI Studio" },
      };
    }
    case "gemini": {
      const key = pick("GEMINI_API_KEY", userKeys.gemini);
      if (!key) return { error: "Gemini API key missing. Add a free key in Settings." };
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        key,
      };
    }
  }
}

function errorStream(message: string) {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(message));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}

export async function POST(req: NextRequest) {
  let body: {
    messages?: { role: string; content: unknown }[];
    modelId?: string;
    system?: string;
    keys?: Record<string, string>;
  };

  try {
    body = await req.json();
  } catch {
    return errorStream("⚠️ Could not read the request.");
  }

  const model = findModel(body.modelId || "");
  const endpoint = resolveEndpoint(model.provider, body.keys ?? {});
  if ("error" in endpoint) return errorStream(`⚠️ ${endpoint.error}`);

  const system =
    body.system?.trim() ||
    "You are RV AI, a capable, friendly assistant. Answer in the same language the user writes in (including Hindi or Hinglish). Use GitHub-flavoured markdown. For code, always use fenced blocks with a language tag. Be concise but complete.";

  const payload = {
    model: model.model,
    stream: true,
    messages: [{ role: "system", content: system }, ...(body.messages ?? [])],
  };

  let upstream: Response;
  try {
    upstream = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(endpoint.key ? { Authorization: `Bearer ${endpoint.key}` } : {}),
        ...(endpoint.extraHeaders ?? {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return errorStream("⚠️ Network error reaching the model provider. Please retry.");
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    const short = detail.slice(0, 400);
    return errorStream(
      `⚠️ ${model.label} returned ${upstream.status}. ${
        upstream.status === 429
          ? "Free-tier rate limit hit — wait a moment or switch model."
          : short
      }`,
    );
  }

  // Convert the upstream SSE stream into plain text deltas for the client.
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta =
                json.choices?.[0]?.delta?.content ??
                json.choices?.[0]?.message?.content ??
                "";
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              /* partial chunk, ignore */
            }
          }
        }
      } catch {
        controller.enqueue(encoder.encode("\n\n⚠️ Stream interrupted."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
