import { findModel, type ModelDef } from "./models";
import { buildChain, RATE_LIMIT_HINT } from "./fallback";

type Args = {
  modelId: string;
  system: string;
  keys: Record<string, string | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  signal: AbortSignal;
  /** called when a provider fails and we move to the next one */
  onFallback?: (from: string, to: string) => void;
};

async function openOne(
  model: ModelDef,
  args: Args,
): Promise<ReadableStream<Uint8Array> | null> {
  if (model.provider === "pollinations") {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: args.signal,
      body: JSON.stringify({
        model: model.model,
        stream: true,
        messages: [{ role: "system", content: args.system }, ...args.messages],
      }),
    }).catch(() => null);

    if (res?.ok && res.body) return sseToText(res.body);
    if (res && !res.ok) return null; // rate limited — let the chain continue
    // network/CORS blocked: fall through to the server route
  }

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: args.signal,
    body: JSON.stringify({
      modelId: model.id,
      system: args.system,
      keys: args.keys,
      messages: args.messages,
    }),
  });
  if (!res.ok || !res.body) return null;

  // The route answers 200 with a plain-text ⚠️ line when the provider refused.
  // Peek at the first chunk so we can fall back instead of showing the error.
  const reader = res.body.getReader();
  const first = await reader.read();
  const head = new TextDecoder().decode(first.value ?? new Uint8Array());
  if (head.startsWith("⚠️")) {
    reader.cancel().catch(() => {});
    return null;
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (first.value) controller.enqueue(first.value);
      if (first.done) return controller.close();
      (async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch {
          /* aborted */
        } finally {
          controller.close();
        }
      })();
    },
  });
}

/**
 * Returns a text stream, automatically retrying across free providers so a
 * rate-limited tier never becomes a dead end for the user.
 */
export async function streamChat(args: Args): Promise<ReadableStream<Uint8Array> | null> {
  const chain = buildChain(args.modelId, args.keys);
  const startLabel = findModel(args.modelId).label;

  for (let i = 0; i < chain.length; i++) {
    if (args.signal.aborted) return null;
    const model = chain[i];
    try {
      const stream = await openOne(model, args);
      if (stream) {
        if (i > 0) args.onFallback?.(startLabel, model.label);
        return stream;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
    }
  }

  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(`⚠️ ${RATE_LIMIT_HINT}`));
      c.close();
    },
  });
}

function sseToText(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
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
                json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? "";
              if (delta) controller.enqueue(enc.encode(delta));
            } catch {
              /* partial chunk */
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });
}
