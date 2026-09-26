#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { runTask } from "./agent.js";
import { availableProviders, PROVIDERS } from "./model.js";
import { BANNER, ask, c, closeRl, confirm } from "./ui.js";

const CONFIG_PATH = path.join(os.homedir(), ".rv-agent.json");

async function loadConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function saveConfig(cfg) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  await fs.chmod(CONFIG_PATH, 0o600).catch(() => {});
}

/* ------------------------------------------------------------------ */

async function setup() {
  console.log(BANNER);
  console.log(c.bold("Setup — all of these are free.\n"));

  const cfg = await loadConfig();

  console.log(
    `${c.green("1. Groq")} ${c.dim("— fastest, 14,400 requests/day")}\n` +
      `   ${c.dim("Get one at https://console.groq.com/keys (no card needed)")}`,
  );
  const groq = (await ask(`   paste key ${c.dim("(enter to skip)")}: `)).trim();
  if (groq) cfg.groq = groq;

  console.log(`\n${c.green("2. Gemini")} ${c.dim("— 1,500 requests/day, huge context")}`);
  console.log(c.dim("   https://aistudio.google.com/apikey"));
  const gem = (await ask(`   paste key ${c.dim("(enter to skip)")}: `)).trim();
  if (gem) cfg.gemini = gem;

  console.log(`\n${c.green("3. Ollama")} ${c.dim("— local, unlimited, offline (optional)")}`);
  cfg.useOllama = await confirm("   is Ollama installed and running?");

  cfg.autoApprove = !(await confirm(
    `\n${c.yellow("Safety")}: ask before every command and file write?`,
  ));

  await saveConfig(cfg);

  const avail = availableProviders(cfg);
  console.log(
    c.green(`\n✓ saved to ${CONFIG_PATH}`) +
      `\n  providers ready: ${avail.map((a) => PROVIDERS[a].label).join(", ") || "none"}`,
  );
  if (cfg.autoApprove)
    console.log(c.yellow("  auto-approve is ON — the agent will act without asking."));
  console.log(`\nNow run:  ${c.bold("rv")}   (inside any project folder)\n`);
  closeRl();
}

/* ------------------------------------------------------------------ */

function help() {
  console.log(BANNER);
  console.log(`${c.bold("Usage")}
  rv                      start an interactive session in this folder
  rv "<task>"             run one task and exit
  rv setup                configure free API keys
  rv --yolo "<task>"      run without asking for approval
  rv --help               this message

${c.bold("Examples")}
  ${c.dim('rv "ek react todo app banao aur dev server chalu karo"')}
  ${c.dim('rv "npm test chalao aur jo fail ho rahe hain wo theek karo"')}
  ${c.dim('rv "is folder ka code padho aur README likho"')}
  ${c.dim('rv "ye error theek karo: TypeError cannot read property map of undefined"')}

${c.bold("In a session")}
  /auto     toggle auto-approve      /clear   forget the conversation
  /cwd      show the project folder  /exit    quit
`);
}

/* ------------------------------------------------------------------ */

async function interactive(cfg, root) {
  console.log(BANNER);
  const avail = availableProviders(cfg);
  console.log(
    `${c.dim("folder  ")} ${root}\n` +
      `${c.dim("models  ")} ${avail.map((a) => PROVIDERS[a].label).join(" → ") || c.red("none — run: rv setup")}\n` +
      `${c.dim("approve ")} ${cfg.autoApprove ? c.yellow("auto (no prompts)") : c.green("ask first")}\n` +
      c.dim("\nDescribe what you want. /help for commands, /exit to quit.\n"),
  );

  const history = [];

  for (;;) {
    const input = (await ask(c.bold(c.magenta("\nrv › ")))).trim();
    if (!input) continue;

    if (input === "/exit" || input === "/quit") break;
    if (input === "/help") {
      help();
      continue;
    }
    if (input === "/clear") {
      history.length = 0;
      console.log(c.dim("   conversation cleared"));
      continue;
    }
    if (input === "/cwd") {
      console.log(c.dim("   " + root));
      continue;
    }
    if (input === "/auto") {
      cfg.autoApprove = !cfg.autoApprove;
      await saveConfig(cfg);
      console.log(
        cfg.autoApprove
          ? c.yellow("   auto-approve ON — no more prompts")
          : c.green("   auto-approve OFF — will ask first"),
      );
      continue;
    }

    const t0 = Date.now();
    const res = await runTask({ task: input, root, cfg, history });
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    console.log(
      c.dim(`   ─ ${res.steps} step${res.steps === 1 ? "" : "s"} · ${secs}s${res.provider ? " · " + res.provider : ""}`),
    );
  }

  closeRl();
  console.log(c.dim("\nbye 👋\n"));
}

/* ------------------------------------------------------------------ */

async function main() {
  const argv = process.argv.slice(2);

  if (argv[0] === "setup") return setup();
  if (argv.includes("--help") || argv.includes("-h")) return help();

  const cfg = await loadConfig();
  const root = process.cwd();

  if (argv.includes("--yolo")) cfg.autoApprove = true;
  const task = argv.filter((a) => !a.startsWith("--")).join(" ").trim();

  if (!availableProviders(cfg).length) {
    console.log(BANNER);
    console.log(c.yellow("No model providers configured yet.\n"));
    console.log(`Run ${c.bold("rv setup")} — it takes about a minute and is free.\n`);
    return closeRl();
  }

  if (task) {
    const res = await runTask({ task, root, cfg, history: [] });
    closeRl();
    process.exit(res.ok ? 0 : 1);
  }

  await interactive(cfg, root);
}

main().catch((e) => {
  console.error(c.red("\nfatal: " + (e?.stack ?? e)));
  closeRl();
  process.exit(1);
});
