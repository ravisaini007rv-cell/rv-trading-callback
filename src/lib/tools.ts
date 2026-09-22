import { grepFiles, vfs } from "./vfs";

export type ToolSpec = {
  name: string;
  signature: string;
  description: string;
};

export const TOOLS: ToolSpec[] = [
  {
    name: "web_search",
    signature: `{"tool":"web_search","args":{"query":"latest news about X"}}`,
    description:
      "Search the live web. Use for anything recent, factual, or that you are unsure about.",
  },
  {
    name: "fetch_url",
    signature: `{"tool":"fetch_url","args":{"url":"https://example.com/page"}}`,
    description: "Read the text content of a specific web page or JSON API.",
  },
  {
    name: "run_js",
    signature: `{"tool":"run_js","args":{"code":"return [1,2,3].map(x=>x*2)"}}`,
    description:
      "Execute JavaScript in a sandbox and get the real returned value. Use it to do maths, process data, and VERIFY code you wrote actually works.",
  },
  {
    name: "write_file",
    signature: `{"tool":"write_file","args":{"path":"app.js","content":"full file contents"}}`,
    description:
      "Create or overwrite a file in your workspace. Always write the COMPLETE file.",
  },
  {
    name: "read_file",
    signature: `{"tool":"read_file","args":{"path":"app.js"}}`,
    description: "Read a file back. Do this before editing a file you did not just write.",
  },
  {
    name: "edit_file",
    signature: `{"tool":"edit_file","args":{"path":"app.js","find":"exact old text","replace":"new text"}}`,
    description:
      "Replace exact text inside a file. Cheaper than rewriting a whole file for a small change.",
  },
  {
    name: "list_files",
    signature: `{"tool":"list_files","args":{}}`,
    description: "List every file in your workspace.",
  },
  {
    name: "grep",
    signature: `{"tool":"grep","args":{"query":"functionName"}}`,
    description: "Search across all your files for a string, with file and line numbers.",
  },
  {
    name: "generate_image",
    signature: `{"tool":"generate_image","args":{"prompt":"a red fox in snow, photorealistic"}}`,
    description: "Create an image from a text prompt and show it to the user.",
  },
];

/**
 * The harness prompt. This — not the model — is what makes an agent feel
 * capable: explicit planning, permission to run several tools at once, and a
 * hard requirement to verify its own work before finishing.
 */
export const AGENT_PROMPT = `You are RV AI, an autonomous agent. You do real work with real tools, then report results.

AVAILABLE TOOLS
${TOOLS.map((t) => `- ${t.name}: ${t.description}\n  call: ${t.signature}`).join("\n")}

CALLING TOOLS
Emit a fenced block and then STOP writing. The real result comes back to you.

\`\`\`tool
{"tool":"web_search","args":{"query":"Bitcoin price today"}}
\`\`\`

You may call SEVERAL INDEPENDENT tools at once by putting a JSON array in one block.
They run in parallel, which is much faster. Only do this when the calls do not depend
on each other:

\`\`\`tool
[{"tool":"web_search","args":{"query":"React 19 release notes"}},
 {"tool":"web_search","args":{"query":"React 19 breaking changes"}}]
\`\`\`

HOW TO WORK

1. PLAN FIRST. For any task needing more than one step, open your reply with a short
   plan in this exact format, then immediately start executing:
   PLAN:
   1. <step>
   2. <step>

2. GATHER before you answer. If the question touches current facts, prices, versions,
   news, or docs — search. Never guess and never claim you cannot access the internet.

3. VERIFY your own work. This is what separates you from a chatbot:
   - Wrote code? Run it with run_js and show that it works.
   - Did maths? Compute it with run_js instead of doing it in your head.
   - Built files? list_files or read_file to confirm what is actually there.
   - A tool returned an error? Read it, fix the cause, and retry. Do not give up
     after one failure and do not ask the user to fix it for you.

4. BE HONEST. If a tool failed or a result was thin, say so plainly. Never invent a
   tool result. Never claim you did something you did not do.

5. FINISH. When the work is done and verified, write the final answer with NO tool
   block. Summarise what you did, what you found, and anything the user should check.

STYLE
Reply in the user's language (Hindi, Hinglish or English). GitHub-flavoured markdown.
Fenced code blocks with a language tag. Cite sources as markdown links after a search.
Be concise: no filler, no repeating the plan back at the end.`;

export const PLAIN_PROMPT = `You are RV AI, a capable, friendly assistant. Answer in the same language the user writes in (including Hindi or Hinglish). Use GitHub-flavoured markdown. For code, always use fenced blocks with a language tag. Be concise but complete.`;

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

export type ParsedCall = { tool: string; args: Record<string, string> };

/** Returns every call in the first ```tool block (one, or an array of them). */
export function parseToolCall(
  text: string,
): { calls: ParsedCall[]; raw: string } | null {
  const m = text.match(/```tool\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const calls = list
      .filter((c) => c && typeof c.tool === "string")
      .map((c) => ({ tool: c.tool as string, args: (c.args ?? {}) as Record<string, string> }));
    return calls.length ? { calls, raw: m[0] } : null;
  } catch {
    return null;
  }
}

/** Pull the PLAN block out so the UI can show it as a checklist. */
export function parsePlan(text: string): string[] {
  const m = text.match(/PLAN:\s*\n((?:\s*\d+\..*\n?)+)/i);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* execution                                                           */
/* ------------------------------------------------------------------ */

function runJsSandboxed(code: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve) => {
    const src = `
      self.onmessage = async (e) => {
        const logs = [];
        const console = {
          log: (...a) => logs.push(a.map(v => typeof v === "object" ? JSON.stringify(v) : String(v)).join(" ")),
          error: (...a) => logs.push("ERROR: " + a.map(String).join(" ")),
          warn: (...a) => logs.push("WARN: " + a.map(String).join(" ")),
        };
        try {
          const fn = new Function("console", '"use strict"; return (async () => {' + e.data + '})()');
          const value = await fn(console);
          self.postMessage({ ok: true, logs, value: value === undefined ? null : value });
        } catch (err) {
          self.postMessage({ ok: false, logs, error: String(err && err.stack || err) });
        }
      };
    `;
    const worker = new Worker(
      URL.createObjectURL(new Blob([src], { type: "application/javascript" })),
    );
    const timer = setTimeout(() => {
      worker.terminate();
      resolve("Error: execution timed out after 6s (infinite loop?)");
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      const d = e.data as { ok: boolean; logs: string[]; value?: unknown; error?: string };
      const parts: string[] = [];
      if (d.logs?.length) parts.push("console:\n" + d.logs.join("\n"));
      if (d.ok) parts.push("returned: " + JSON.stringify(d.value, null, 2));
      else parts.push("Error: " + d.error);
      resolve(parts.join("\n\n").slice(0, 8000));
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
  switch (tool) {
    case "run_js":
      return { text: await runJsSandboxed(args.code ?? "") };

    case "write_file": {
      if (!args.path) return { text: "Error: path is required" };
      const f = vfs.write(args.path, args.content ?? "");
      return { text: `Wrote ${f.path} (${f.content.split("\n").length} lines).` };
    }

    case "read_file": {
      const content = vfs.read(args.path ?? "");
      if (content === null)
        return { text: `Error: no such file "${args.path}". Use list_files to see what exists.` };
      return { text: `--- ${args.path} ---\n${content.slice(0, 12000)}` };
    }

    case "edit_file": {
      const res = vfs.edit(args.path ?? "", args.find ?? "", args.replace ?? "");
      return { text: res.ok ? res.message : `Error: ${res.message}` };
    }

    case "list_files": {
      const files = vfs.list();
      return {
        text: files.length
          ? files.map((f) => `${f.path} (${f.content.split("\n").length} lines)`).join("\n")
          : "workspace is empty",
      };
    }

    case "grep":
      return { text: grepFiles(args.query ?? "") };

    case "generate_image": {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        args.prompt ?? "",
      )}?width=1024&height=1024&seed=${seed}&model=flux&nologo=true`;
      return {
        text: `Image generated for: "${args.prompt}". It is now shown to the user.`,
        imageUrl: url,
      };
    }

    default: {
      // server-side tools: web_search, fetch_url
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
  }
}

/** Run independent calls concurrently — the big latency win. */
export async function executeToolsParallel(calls: ParsedCall[]) {
  return Promise.all(calls.map((c) => executeTool(c.tool, c.args)));
}

export const TOOL_LABEL: Record<string, string> = {
  web_search: "Searching the web",
  fetch_url: "Reading page",
  run_js: "Running code",
  write_file: "Writing file",
  read_file: "Reading file",
  edit_file: "Editing file",
  list_files: "Listing files",
  grep: "Searching files",
  generate_image: "Generating image",
};
