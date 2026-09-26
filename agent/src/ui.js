import readline from "node:readline";

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

export const c = {
  bold: wrap("1"),
  dim: wrap("2"),
  red: wrap("31"),
  green: wrap("32"),
  yellow: wrap("33"),
  blue: wrap("34"),
  magenta: wrap("35"),
  cyan: wrap("36"),
  grey: wrap("90"),
};

let rl = null;
export function getRl() {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}
export function closeRl() {
  rl?.close();
  rl = null;
}

export function ask(question) {
  return new Promise((resolve) => getRl().question(question, (a) => resolve(a)));
}

export async function confirm(message) {
  const a = (await ask(`${message} ${c.dim("[Y/n] ")}`)).trim().toLowerCase();
  return a === "" || a === "y" || a === "yes";
}

const LABELS = {
  bash: "$",
  write_file: "write",
  read_file: "read",
  edit_file: "edit",
  list_files: "ls",
  search: "grep",
  web_search: "search",
  fetch_url: "fetch",
};

/** Print a live spinner for a running tool; returns a stop(failed) function. */
export function toolLine(call) {
  const label = LABELS[call.tool] ?? call.tool;
  const detail =
    call.args.command ||
    call.args.path ||
    call.args.query ||
    call.args.url ||
    call.args.dir ||
    "";
  const text = `${c.cyan(label)} ${c.dim(String(detail).replace(/\s+/g, " ").slice(0, 70))}`;

  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  let timer = null;

  if (process.stdout.isTTY) {
    process.stdout.write(`   ${frames[0]} ${text}`);
    timer = setInterval(() => {
      i = (i + 1) % frames.length;
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`   ${frames[i]} ${text}`);
    }, 80);
  } else {
    process.stdout.write(`   • ${text}\n`);
  }

  return (failed) => {
    if (timer) {
      clearInterval(timer);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      process.stdout.write(`   ${failed ? c.red("✗") : c.green("✓")} ${text}\n`);
    } else if (failed) {
      process.stdout.write(`   ✗ failed\n`);
    }
  };
}

export const BANNER = `
${c.magenta("██▀███   ██▒   █▓")}   ${c.bold("RV Agent")}
${c.magenta("▓██ ▒ ██▒▓██░   █▒")}   ${c.dim("an autonomous engineer on your machine")}
${c.magenta("▒██▒▐█▄ ░ ▓██  █▒░")}
`;
