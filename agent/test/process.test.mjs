/**
 * The behaviour that makes "I do nothing" real: the agent must be able to start
 * a dev server, keep working, verify it responds, and shut it down — without
 * hanging.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeTool } from "../src/tools.js";
import { killAll } from "../src/process.js";
import { needsInteraction } from "../src/tools.js";

const ROOT = mkdtempSync(path.join(tmpdir(), "rv-proc-"));
let pass = 0;
let total = 0;

const check = (name, ok, extra = "") => {
  total++;
  if (ok) pass++;
  console.log(` ${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`);
};

// a tiny server that stays up, exactly like `npm run dev` would
writeFileSync(
  path.join(ROOT, "server.js"),
  `import http from "node:http";
http.createServer((_, res) => { res.writeHead(200); res.end("hello from rv"); })
  .listen(7391, () => console.log("listening on 7391"));`,
);

console.log("Background processes:");

const started = await executeTool(ROOT, "start_process", {
  name: "dev",
  command: "node server.js",
});
check("start_process returns immediately", started.includes("Started"), started.split("\n")[0]);

const status = await executeTool(ROOT, "check_process", { name: "dev", wait: "2" });
check("process is alive", status.includes("running"));
check("captured its logs", status.includes("listening on 7391"));

const curled = await executeTool(ROOT, "bash", {
  command: "curl -s --max-time 5 http://127.0.0.1:7391",
});
check("server actually responds", curled.includes("hello from rv"), curled.split("\n")[0]);

const list = await executeTool(ROOT, "list_processes", {});
check("appears in list_processes", list.includes("dev"));

const stopped = await executeTool(ROOT, "stop_process", { name: "dev" });
check("stops cleanly", stopped.includes("Stopped"));

await new Promise((r) => setTimeout(r, 1200));
const after = await executeTool(ROOT, "bash", {
  command: "curl -s --max-time 3 http://127.0.0.1:7391 || echo GONE",
});
check("server is really down", after.includes("GONE"));

console.log("\nGuards:");

check("sudo detected", needsInteraction("sudo apt install python3"));
check("normal command not flagged", !needsInteraction("npm install"));
check("sudo -n allowed through", !needsInteraction("sudo -n true"));

const sudoOut = await executeTool(ROOT, "bash", { command: "sudo apt install x" });
check("sudo returns guidance, does not hang", sudoOut.startsWith("Error:") && sudoOut.includes("password"));

const missing = await executeTool(ROOT, "check_process", { name: "nope", wait: "0" });
check("unknown process handled", missing.startsWith("Error:"));

const dup = await executeTool(ROOT, "start_process", { name: "a", command: "sleep 30" });
const dup2 = await executeTool(ROOT, "start_process", { name: "a", command: "sleep 30" });
check("duplicate name rejected", dup2.startsWith("Error:"));
void dup;

killAll();
console.log(`\n${pass}/${total} checks passed`);
process.exit(pass === total ? 0 : 1);
