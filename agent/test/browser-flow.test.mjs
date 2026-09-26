/**
 * Verifies the agent correctly plans, dispatches and recovers around the
 * browser tools, without needing a real Chromium download.
 */
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runTask } from "../src/agent.js";

const script = [
  `PLAN:
1. Open WhatsApp Web
2. Read what is on screen
3. Report back

\`\`\`tool
{"tool":"browser_open","args":{"url":"https://web.whatsapp.com"}}
\`\`\``,
  `The browser isn't set up yet, so let me confirm the terminal still works.
\`\`\`tool
{"tool":"bash","args":{"command":"echo fallback-path-works"}}
\`\`\``,
  `Reported honestly: the browser needs \`npx playwright install chromium\` first. The terminal side is working.`,
];

let i = 0;
const server = http
  .createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const out = script[Math.min(i++, script.length - 1)];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: out } }] }));
    });
  })
  .listen(8901, "127.0.0.1");

const ROOT = mkdtempSync(path.join(tmpdir(), "rv-browser-"));

const cfg = {
  useOllama: true,
  ollamaUrl: "http://127.0.0.1:8901",
  autoApprove: true,
  maxSteps: 8,
};

console.log("=== agent driving browser tools ===\n");
const res = await runTask({ task: "whatsapp web kholo", root: ROOT, cfg, history: [] });

server.close();

const ok = res.ok && i >= 3;
console.log(`\nsteps: ${res.steps}, model turns: ${i}`);
console.log(ok ? "✓ PASS — dispatched browser tool, recovered, finished cleanly" : "✗ FAIL");
process.exit(ok ? 0 : 1);
