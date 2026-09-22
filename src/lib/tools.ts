export type ToolCall = {
  id: string;
  tool: string;
  args: Record<string, string>;
  status: "running" | "done" | "error";
  result?: string;
};

export type ToolSpec = {
  name: string;
  signature: string;
  description: string;
  /** true = executed in the browser, false = executed on the server route */
  client: boolean;
};

export const TOOLS: ToolSpec[] = [
  {
    name: "web_search",
    signature: `{"tool":"web_search","args":{"query":"latest news about X"}}`,
    description: "Search the live web. Use for anything recent, factual, or that you are unsure about.",
    client: false,
  },
  {
    name: "fetch_url",
    signature: `{"tool":"fetch_url","args":{"url":"https://example.com/page"}}`,
    description: "Read the text content of a specific web page or JSON API.",
    client: false,
  },
  {
    name: "run_js",
    signature: `{"tool":"run_js","args":{"code":"return [1,2,3].map(x=>x*2)"}}`,
    description:
      "Execute JavaScript in a sandbox and get the returned value. Use for math, data processing, and verifying code logic.",
    client: true,
  },
  {
    name: "generate_image",
    signature: `{"tool":"generate_image","args":{"prompt":"a red fox in snow, photorealistic"}}`,
    description: "Create an image from a text prompt and show it to the user.",
    client: true,
  },
];

export const AGENT_PROMPT = `You are RV AI, an autonomous agent with real tools.

AVAILABLE TOOLS
${TOOLS.map((t) => `- ${t.name}: ${t.description}\n  call: ${t.signature}`).join("\n")}

HOW TO USE A TOOL
When you need one, stop writing prose and emit a single fenced block exactly like this:

\`\`\`tool
{"tool":"web_search","args":{"query":"Bitcoin price today"}}
\`\`\`

Rules:
- Emit the block and then STOP. Do not invent the result.
- The real result is given back to you, then you continue.
- One tool call per turn. You may use several turns in a row (up to 6).
- Use web_search whenever the answer depends on current facts, prices, news, docs or
  anything after your training cutoff. Do not guess.
- After web_search, cite sources as markdown links.
- When you have enough information, write the final answer with NO tool block.

STYLE
Reply in the user's language (Hindi, Hinglish or English). Use GitHub-flavoured markdown,
fenced code blocks with a language tag, and be concise but complete.`;

export const PLAIN_PROMPT = `You are RV AI, a capable, friendly assistant. Answer in the same language the user writes in (including Hindi or Hinglish). Use GitHub-flavoured markdown. For code, always use fenced blocks with a language tag. Be concise but complete.`;

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

export function parseToolCall(
  text: string,
): { tool: string; args: Record<string, string>; raw: string } | null {
  const m = text.match(/```tool\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (typeof parsed?.tool !== "string") return null;
    return { tool: parsed.tool, args: parsed.args ?? {}, raw: m[0] };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* execution                                                           */
/* ------------------------------------------------------------------ */

function runJsSandboxed(code: string, timeoutMs = 5000): Promise<string> {
  return new Promise((resolve) => {
    const src = `
      self.onmessage = async (e) => {
        const logs = [];
        const console = {
          log: (...a) => logs.push(a.map(String).join(" ")),
          error: (...a) => logs.push("ERROR: " + a.map(String).join(" ")),
searchInfo: null,
        };
        try {
          const fn = new Function("console", '"use strict"; return (async () => {' + e.data + '})()');
          const value = await fn(console);
          self.postMessage({ ok: true, logs, value: value === undefined ? null : value });
        } catch (err) {
          self.postMessage({ ok: false, logs, error: String(err) });
        }
      };
    `;
    const blob = new Blob([src], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    const timer = setTimeout(() => {
      worker.terminate();
      resolve("Error: execution timed out after 5s");
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      const d = e.data as { ok: boolean; logs: string[]; value?: unknown; error?: string };
      const parts: string[] = [];
      if (d.logs?.length) parts.push("console:\n" + d.logs.join("\n"));
      if (d.ok) parts.push("returned: " + JSON.stringify(d.value, null, 2));
      else parts.push(d.error ?? "unknown error");
      resolve(parts.join("\n\n").slice(0, 6000));
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      resolve("Error: " + err.message);
    };
    worker.postMessage(code);
  });
}

export async function executeTool(
  tool: string,
  args: Record<string, string>,
): Promise<{ text: string; imageUrl?: string }> {
  if (tool === "run_js") {
    return { text: await runJsSandboxed(args.code ?? "") };
  }

  if (tool === "generate_image") {
    const seed = Math.floor(Math.random() * 1_000_000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
      args.prompt ?? "",
    )}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
    return { text: `Image generated for: "${args.prompt}". It is now shown to the user.`, imageUrl: url };
  }

  // server-side tools
  try {
    const res = await fetch("/api/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
    });
    const data = await res.json();
    if (!data.ok) return { text: `Error: ${data.error}` };
    return { text: JSON.stringify(data.result, null, 2).slice(0, 10000) };
  } catch (e) {
    return { text: `Error: ${(e as Error).message}` };
  }
}

export const TOOL_LABEL: Record<string, string> = {
  web_search: "Searching the web",
  fetch_url: "Reading page",
  run_js: "Running code",
  generate_image: "Generating image",
};
