import { TOOL_SPECS, executeTool, isDangerous, systemInfo } from "./tools.js";
import { askModel } from "./model.js";
import { c, confirm, toolLine } from "./ui.js";

const SYSTEM = (root) => `You are RV Agent, an autonomous software engineer working on a real computer.

MACHINE: ${systemInfo()}
PROJECT DIRECTORY: ${root}

You have real tools. You are not describing what to do — you are doing it.

TOOLS
${TOOL_SPECS.map(
  (t) =>
    `- ${t.name}(${Object.keys(t.args).join(", ")}) — ${t.desc}`,
).join("\n")}

CALLING A TOOL
Emit exactly one fenced block, then STOP. The real result is returned to you.

\`\`\`tool
{"tool":"bash","args":{"command":"npm test"}}
\`\`\`

Run INDEPENDENT tools together as an array — they execute in parallel:

\`\`\`tool
[{"tool":"read_file","args":{"path":"package.json"}},
 {"tool":"list_files","args":{}}]
\`\`\`

RULES OF WORK

1. LOOK BEFORE YOU LEAP. At the start of a task, inspect the project: list_files,
   read the relevant files. Never assume what is in them.

2. PLAN. For anything multi-step, begin your first reply with:
   PLAN:
   1. <step>
   2. <step>
   Then start executing immediately in the same reply.

3. DO THE WHOLE JOB. Install dependencies, create files, run the build, start the
   server, run the tests — actually run them with bash. Never tell the user to run a
   command themselves. You have the terminal; use it.

4. VERIFY EVERYTHING. After writing code, run it. After a build, check the exit code.
   Exit 0 is not proof — read the output. If you started a server, curl it.

5. USING THE BROWSER. fetch_url is for plain reading. Use the browser_* tools when a
   site needs logging in, clicking or typing (WhatsApp Web, Gmail, dashboards, forms).
   The browser window is visible and the profile is persistent — if a site asks the user
   to scan a QR code or log in, say so plainly and wait; do not try to guess passwords.
   Always browser_read before clicking so you know what is actually on the page.

6. FIX YOUR OWN ERRORS. A failing command is normal, not a reason to stop. Read the
   error, form a hypothesis, change something, run it again. Keep going until it works
   or you have tried three genuinely different approaches. Only then report the blocker.

7. BE HONEST. Never claim a command succeeded when it did not. Never invent output.
   If something is still broken, say exactly what and why.

8. FINISH CLEANLY. When the task is done and verified, reply with NO tool block:
   say what you built, what you ran to prove it works, and how the user can use it.

STYLE
Reply in the user's language (Hindi, Hinglish or English). Be brief between tool calls —
one short line about what you are doing next. Save the detail for the final summary.`;

function parseToolBlock(text) {
  const m = text.match(/```tool\s*([\s\S]*?)```/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const calls = list
      .filter((x) => x && typeof x.tool === "string")
      .map((x) => ({ tool: x.tool, args: x.args ?? {} }));
    return calls.length ? { calls, raw: m[0] } : null;
  } catch {
    return null;
  }
}

function prose(text, raw) {
  return (raw ? text.replace(raw, "") : text).trim();
}

/**
 * Run one task to completion.
 * @param {object} o
 * @param {string} o.task        what the user asked for
 * @param {string} o.root        project directory
 * @param {object} o.cfg         config (keys, autoApprove…)
 * @param {Array}  o.history     prior messages, mutated in place
 */
export async function runTask({ task, root, cfg, history }) {
  const messages = history.length
    ? history
    : [{ role: "system", content: SYSTEM(root) }];

  messages.push({ role: "user", content: task });

  const MAX_STEPS = cfg.maxSteps ?? 30;
  let steps = 0;

  for (steps = 0; steps < MAX_STEPS; steps++) {
    let reply;
    try {
      reply = await askModel(cfg, messages, {
        onFallback: (label) => console.log(c.dim(`   ↻ switched to ${label}`)),
      });
    } catch (e) {
      console.log(c.red(`\n✗ ${e.message}`));
      return { ok: false, steps };
    }

    const block = parseToolBlock(reply.text);
    const said = prose(reply.text, block?.raw);

    if (said) console.log("\n" + said + "\n");

    if (!block) {
      messages.push({ role: "assistant", content: reply.text });
      return { ok: true, steps, provider: reply.provider };
    }

    // ---- approval gate -------------------------------------------------
    const approved = [];
    for (const call of block.calls) {
      const danger = call.tool === "bash" && isDangerous(call.args.command ?? "");
      if (danger) {
        console.log(
          c.red(`   ⛔ refused (destructive): ${call.args.command}`),
        );
        approved.push({ call, result: "Error: refused — this command is destructive and blocked by policy. Choose a safer approach." });
        continue;
      }

      const needsOk =
        !cfg.autoApprove &&
        (call.tool === "bash" || call.tool === "write_file" || call.tool === "edit_file");

      if (needsOk) {
        const preview =
          call.tool === "bash"
            ? call.args.command
            : `${call.tool} → ${call.args.path}`;
        const ok = await confirm(`   ${c.yellow("?")} run: ${c.bold(preview)}`);
        if (!ok) {
          approved.push({ call, result: "The user declined this action. Try a different approach or ask what they would prefer." });
          continue;
        }
      }
      approved.push({ call, result: null });
    }

    // ---- execute (parallel) --------------------------------------------
    const results = await Promise.all(
      approved.map(async ({ call, result }) => {
        if (result !== null) return result;
        const stop = toolLine(call);
        const out = await executeTool(root, call.tool, call.args);
        stop(out.startsWith("Error:") || /\[exit [1-9]/.test(out));
        return out;
      }),
    );

    messages.push({ role: "assistant", content: reply.text });
    messages.push({
      role: "user",
      content:
        approved
          .map((a, i) => `TOOL RESULT (${a.call.tool}):\n${results[i]}`)
          .join("\n\n") +
        "\n\nContinue. Fix any errors above yourself. When everything is done and verified, reply with no tool block.",
    });
  }

  console.log(c.yellow(`\n⚠ hit the ${MAX_STEPS}-step limit. Say "continue" to keep going.`));
  return { ok: false, steps };
}
