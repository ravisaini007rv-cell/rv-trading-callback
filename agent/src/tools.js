import { execFile, spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/* ------------------------------------------------------------------ *
 * Safety rails. The agent works inside one project directory, and a
 * small set of genuinely destructive commands is always refused.
 * ------------------------------------------------------------------ */

const BLOCKED = [
  /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rf]/i, // rm -rf
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /:\(\)\s*\{.*\}\s*;:/, // fork bomb
  /\bshutdown\b|\breboot\b|\bhalt\b/i,
  /\bchmod\s+-R\s+777\s+\//,
  /\/dev\/(sd|disk|nvme)/i,
  />\s*\/dev\/(sd|disk)/i,
  /\bsudo\s+rm\b/i,
  /\bcurl\b[^|]*\|\s*(ba)?sh/i, // curl | sh
  /\bwget\b[^|]*\|\s*(ba)?sh/i,
];

export function isDangerous(cmd) {
  for (const re of BLOCKED) if (re.test(cmd)) return true;
  return false;
}

/** Keep every path inside the project root. */
function safePath(root, p) {
  const full = path.resolve(root, p);
  if (!full.startsWith(path.resolve(root)))
    throw new Error(`path escapes the project directory: ${p}`);
  return full;
}

const clip = (s, n = 8000) =>
  s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more characters)` : s;

/* ------------------------------------------------------------------ *
 * Tools
 * ------------------------------------------------------------------ */

export const TOOL_SPECS = [
  {
    name: "bash",
    args: { command: "the shell command", timeout: "optional seconds, default 120" },
    desc: "Run a shell command in the project directory. Use for npm, git, python, tests, builds, file inspection — anything you would type in a terminal.",
  },
  {
    name: "write_file",
    args: { path: "relative path", content: "the COMPLETE file contents" },
    desc: "Create or overwrite a file. Always write the whole file.",
  },
  {
    name: "read_file",
    args: { path: "relative path" },
    desc: "Read a file. Do this before editing anything you did not just write.",
  },
  {
    name: "edit_file",
    args: { path: "relative path", find: "exact text to replace", replace: "new text" },
    desc: "Replace exact text inside a file. Cheaper than rewriting the whole file.",
  },
  {
    name: "list_files",
    args: { dir: "optional subdirectory, default ." },
    desc: "List files in the project, ignoring node_modules and .git.",
  },
  {
    name: "search",
    args: { query: "text to find" },
    desc: "Search file contents across the project, with file and line numbers.",
  },
  {
    name: "web_search",
    args: { query: "search terms" },
    desc: "Search the live web for docs, errors, current versions.",
  },
  {
    name: "fetch_url",
    args: { url: "https://…" },
    desc: "Read the text of a web page or JSON API.",
  },
];

export function runBash(root, command, timeoutSec = 120) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: root,
      shell: true,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", CI: "1" },
    });

    let out = "";
    let done = false;
    const finish = (extra = "") => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(clip(out.trim() + extra) || "(no output)");
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(`\n\n[timed out after ${timeoutSec}s and was killed]`);
    }, timeoutSec * 1000);

    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (e) => finish(`\n[spawn error: ${e.message}]`));
    child.on("close", (code) =>
      finish(code === 0 ? "\n\n[exit 0]" : `\n\n[exit ${code}]`),
    );
  });
}

async function listFiles(root, dir = ".") {
  const base = safePath(root, dir);
  const skip = new Set([
    "node_modules", ".git", ".next", "dist", "build", "__pycache__",
    ".venv", "venv", ".cache", "target", "out",
  ]);
  const found = [];

  async function walk(d, depth) {
    if (depth > 4 || found.length > 400) return;
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".env.example") continue;
      if (skip.has(e.name)) continue;
      const full = path.join(d, e.name);
      const rel = path.relative(root, full);
      if (e.isDirectory()) {
        found.push(rel + "/");
        await walk(full, depth + 1);
      } else {
        found.push(rel);
      }
    }
  }

  await walk(base, 0);
  return found.length ? found.sort().join("\n") : "(empty)";
}

async function searchFiles(root, query) {
  const listing = await listFiles(root);
  const files = listing.split("\n").filter((f) => f && !f.endsWith("/"));
  const hits = [];

  for (const rel of files.slice(0, 300)) {
    let text;
    try {
      const stat = await fs.stat(safePath(root, rel));
      if (stat.size > 800_000) continue;
      text = await fs.readFile(safePath(root, rel), "utf8");
    } catch {
      continue;
    }
    text.split("\n").forEach((line, i) => {
      if (line.toLowerCase().includes(query.toLowerCase()) && hits.length < 80) {
        hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
      }
    });
  }
  return hits.length ? hits.join("\n") : `no matches for "${query}"`;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36";

async function webSearch(query) {
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: new URLSearchParams({ q: query }),
  });
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  const html = await res.text();

  const strip = (s) =>
    s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
     .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
     .replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

  const links = [...html.matchAll(/<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snips = [...html.matchAll(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g)];

  const out = links.slice(0, 6).map((l, i) => {
    const raw = decodeURIComponent(
      l[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&rut=")[0],
    );
    return `${i + 1}. ${strip(l[2])}\n   ${raw}\n   ${strip(snips[i]?.[1] ?? "")}`;
  });

  return out.length ? out.join("\n\n") : "no results";
}

async function fetchUrl(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error("url must start with http(s)://");
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  const raw = await res.text();
  if ((res.headers.get("content-type") ?? "").includes("json")) return clip(raw, 12000);
  return clip(
    raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    12000,
  );
}

/* ------------------------------------------------------------------ */

export async function executeTool(root, tool, args) {
  switch (tool) {
    case "bash":
      return runBash(root, args.command ?? "", Number(args.timeout) || 120);

    case "write_file": {
      if (!args.path) return "Error: path is required";
      const full = safePath(root, args.path);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, args.content ?? "", "utf8");
      const lines = (args.content ?? "").split("\n").length;
      return `Wrote ${args.path} (${lines} lines).`;
    }

    case "read_file": {
      try {
        const text = await fs.readFile(safePath(root, args.path), "utf8");
        return clip(`--- ${args.path} ---\n${text}`, 14000);
      } catch (e) {
        return `Error: cannot read ${args.path} (${e.code ?? e.message}). Use list_files.`;
      }
    }

    case "edit_file": {
      const full = safePath(root, args.path);
      let text;
      try {
        text = await fs.readFile(full, "utf8");
      } catch {
        return `Error: no such file ${args.path}`;
      }
      if (!text.includes(args.find))
        return `Error: the exact text was not found in ${args.path}. read_file first and copy it precisely.`;
      await fs.writeFile(full, text.replace(args.find, args.replace ?? ""), "utf8");
      return `Edited ${args.path}.`;
    }

    case "list_files":
      return listFiles(root, args.dir ?? ".");

    case "search":
      return searchFiles(root, args.query ?? "");

    case "web_search":
      try {
        return await webSearch(args.query ?? "");
      } catch (e) {
        return `Error: ${e.message}`;
      }

    case "fetch_url":
      try {
        return await fetchUrl(args.url ?? "");
      } catch (e) {
        return `Error: ${e.message}`;
      }

    default:
      return `Error: unknown tool "${tool}"`;
  }
}

export function systemInfo() {
  return `${os.platform()} ${os.release()}, ${os.cpus()[0]?.model ?? "cpu"}, ${Math.round(
    os.totalmem() / 1e9,
  )} GB RAM, node ${process.version}`;
}
