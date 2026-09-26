/**
 * Long-running processes (dev servers, watchers, databases).
 *
 * `bash` waits for a command to finish, which is wrong for anything that is
 * *meant* to keep running — it would just hang until the timeout. These tools
 * start such processes in the background, keep their logs, and let the agent
 * check on them, so it can start a server and then curl it to prove it works.
 */

import { spawn } from "node:child_process";

const procs = new Map(); // name -> { child, log, command, startedAt }

const MAX_LOG = 400; // lines kept per process

function record(entry, chunk) {
  const lines = String(chunk).split("\n");
  for (const l of lines) {
    if (!l.trim()) continue;
    entry.log.push(l);
    if (entry.log.length > MAX_LOG) entry.log.shift();
  }
}

export function startProcess(root, name, command) {
  if (procs.has(name)) {
    const old = procs.get(name);
    if (!old.child.killed && old.child.exitCode === null) {
      return `Error: a process named "${name}" is already running. Use stop_process first, or pick another name.`;
    }
  }

  // detached gives the command its own process group, so we can later kill the
  // whole tree — with shell:true, signalling the shell alone leaves the real
  // server orphaned and still holding the port.
  const child = spawn(command, {
    cwd: root,
    shell: true,
    detached: process.platform !== "win32",
    env: { ...process.env, FORCE_COLOR: "0", CI: "1" },
  });

  const entry = { child, log: [], command, startedAt: Date.now() };
  procs.set(name, entry);

  child.stdout.on("data", (d) => record(entry, d));
  child.stderr.on("data", (d) => record(entry, d));
  child.on("error", (e) => record(entry, `[spawn error] ${e.message}`));
  child.on("close", (code) => record(entry, `[process exited with code ${code}]`));

  return `Started "${name}" in the background (pid ${child.pid}).\nGive it a moment, then use check_process to read its output.`;
}

export async function checkProcess(name, waitSec = 3) {
  const entry = procs.get(name);
  if (!entry) return `Error: no process named "${name}". Running: ${listNames() || "none"}`;

  if (waitSec > 0) await new Promise((r) => setTimeout(r, Math.min(waitSec, 30) * 1000));

  const alive = entry.child.exitCode === null && !entry.child.killed;
  const uptime = Math.round((Date.now() - entry.startedAt) / 1000);
  const tail = entry.log.slice(-60).join("\n") || "(no output yet)";

  return `Process "${name}" — ${alive ? `running, up ${uptime}s` : `exited (code ${entry.child.exitCode})`}
command: ${entry.command}

--- last output ---
${tail}`;
}

/** Signal the whole process group, falling back to the single child. */
function signalTree(child, sig) {
  try {
    if (process.platform !== "win32" && child.pid) {
      process.kill(-child.pid, sig); // negative pid = the group
      return;
    }
  } catch {
    /* group already gone, or not a group leader */
  }
  try {
    child.kill(sig);
  } catch {
    /* already dead */
  }
}

export function stopProcess(name) {
  const entry = procs.get(name);
  if (!entry) return `Error: no process named "${name}".`;

  signalTree(entry.child, "SIGTERM");
  const child = entry.child;
  setTimeout(() => {
    if (child.exitCode === null) signalTree(child, "SIGKILL");
  }, 2000);

  procs.delete(name);
  return `Stopped "${name}".`;
}

export function listProcesses() {
  if (!procs.size) return "no background processes running";
  return [...procs.entries()]
    .map(([name, e]) => {
      const alive = e.child.exitCode === null && !e.child.killed;
      const up = Math.round((Date.now() - e.startedAt) / 1000);
      return `${name} — ${alive ? `running (${up}s)` : `exited ${e.child.exitCode}`} — ${e.command}`;
    })
    .join("\n");
}

function listNames() {
  return [...procs.keys()].join(", ");
}

/** Kill everything on exit so no stray servers are left behind. */
export function killAll() {
  for (const [, e] of procs) signalTree(e.child, "SIGKILL");
  procs.clear();
}

export const PROCESS_TOOLS = [
  {
    name: "start_process",
    args: { name: "short label e.g. dev-server", command: "the command to run" },
    desc: "Start a long-running process (dev server, watcher) in the background and keep going. Use this instead of bash for anything that does not exit on its own.",
  },
  {
    name: "check_process",
    args: { name: "the label you used", wait: "optional seconds to wait first, default 3" },
    desc: "Read a background process's recent output and whether it is still alive.",
  },
  {
    name: "stop_process",
    args: { name: "the label you used" },
    desc: "Stop a background process.",
  },
  {
    name: "list_processes",
    args: {},
    desc: "List background processes you have started.",
  },
];

export const PROCESS_TOOL_NAMES = PROCESS_TOOLS.map((t) => t.name);

export async function executeProcessTool(root, tool, args) {
  switch (tool) {
    case "start_process":
      return startProcess(root, args.name ?? "job", args.command ?? "");
    case "check_process":
      return await checkProcess(args.name ?? "job", Number(args.wait ?? 3));
    case "stop_process":
      return stopProcess(args.name ?? "job");
    case "list_processes":
      return listProcesses();
    default:
      return `Error: unknown process tool "${tool}"`;
  }
}
