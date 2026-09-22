import { findModel } from "./models";

type Args = {
  modelId: string;
  system: string;
  keys: Record<string, string | undefined>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[];
  signal: AbortSignal;
};

/**
 * Returns a ReadableStream of plain text deltas.
 *
 * Keyless models are called straight from the browser, which keeps the app
 * working on static hosting and avoids a server round-trip. Keyed providers go
 * through /api/chat so the key never lands in a cross-origin request log.
 */
export async function streamChat(args: Args): Promise<ReadableStream<Uint8Array> | null> {
  const model = findModel(args.modelId);

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
    // fall through to the server route if the direct call is blocked
  }

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: args.signal,
    body: JSON.stringify({
      modelId: args.modelId,
      system: args.system,
      keys: args.keys,
      messages: args.messages,
    }),
  });
  return res.body;
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
