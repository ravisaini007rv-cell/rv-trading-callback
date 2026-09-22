"use client";

import { useRef, useState } from "react";
import { IconSend, IconStop } from "./Icons";
import Markdown from "./Markdown";
import { streamChat } from "@/lib/stream";
import { MODELS } from "@/lib/models";
import type { Keys } from "@/lib/types";

const TEST_PROMPT = `You are RV QA, a senior test engineer.

Given the user's code, write a self-contained JavaScript test suite that runs in a plain
Web Worker with no libraries. Use ONLY this tiny harness, which is already defined for you:

  test("name", () => { ... })     // register a test
  expect(actual).toBe(expected)
  expect(actual).toEqual(expected)  // deep equality
  expect(fn).toThrow()

Output exactly ONE fenced javascript block containing:
1. the user's code (copy it in, adapted so it defines the functions), then
2. the test() calls.

Cover happy paths, edge cases, empty/null input, and boundary values. No explanation
outside the block.`;

const HARNESS = `
const __results = [];
function expect(actual) {
  return {
    toBe(exp) {
      if (!Object.is(actual, exp)) throw new Error("expected " + JSON.stringify(exp) + " but got " + JSON.stringify(actual));
    },
    toEqual(exp) {
      const a = JSON.stringify(actual), b = JSON.stringify(exp);
      if (a !== b) throw new Error("expected " + b + " but got " + a);
    },
    toThrow() {
      let threw = false;
      try { actual(); } catch { threw = true; }
      if (!threw) throw new Error("expected function to throw");
    },
  };
}
const __tests = [];
function test(name, fn) { __tests.push([name, fn]); }
`;

const RUNNER = `
(async () => {
  for (const [name, fn] of __tests) {
    const t0 = Date.now();
    try { await fn(); __results.push({ name, ok: true, ms: Date.now() - t0 }); }
    catch (e) { __results.push({ name, ok: false, ms: Date.now() - t0, error: String(e.message || e) }); }
  }
  self.postMessage(__results);
})();
`;

type Result = { name: string; ok: boolean; ms: number; error?: string };

function runSuite(code: string): Promise<Result[]> {
  return new Promise((resolve) => {
    const src = HARNESS + "\ntry{\n" + code + "\n}catch(e){ self.postMessage([{name:'suite failed to load',ok:false,ms:0,error:String(e)}]); }\n" + RUNNER;
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: "application/javascript" })));
    const timer = setTimeout(() => {
      worker.terminate();
      resolve([{ name: "suite", ok: false, ms: 8000, error: "timed out after 8s" }]);
    }, 8000);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data as Result[]);
    };
    worker.onerror = (err) => {
      clearTimeout(timer);
      worker.terminate();
      resolve([{ name: "suite", ok: false, ms: 0, error: err.message }]);
    };
  });
}

export default function TestPanel({ keys, modelId }: { keys: Keys; modelId: string }) {
  const [code, setCode] = useState(
    `function slugify(s) {\n  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");\n}`,
  );
  const [suite, setSuite] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [review, setReview] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [model, setModel] = useState(modelId);
  const abortRef = useRef<AbortController | null>(null);

  const stream = async (system: string, user: string, onChunk: (s: string) => void) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const st = await streamChat({
      modelId: model,
      system,
      keys,
      messages: [{ role: "user", content: user }],
      signal: controller.signal,
    });
    const reader = st?.getReader();
    const dec = new TextDecoder();
    let acc = "";
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        onChunk(acc);
      }
    }
    return acc;
  };

  const generateAndRun = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setResults([]);
    setReview("");
    setNote("Writing tests…");
    try {
      const acc = await stream(TEST_PROMPT, `CODE UNDER TEST:\n\`\`\`javascript\n${code}\n\`\`\``, () =>
        setNote("Writing tests…"),
      );
      const block = acc.match(/```(?:javascript|js)?\s*([\s\S]*?)```/);
      const generated = (block?.[1] ?? acc).trim();
      setSuite(generated);
      setNote("Running…");
      const res = await runSuite(generated);
      setResults(res);
      setNote(`${res.filter((r) => r.ok).length}/${res.length} passed`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("⚠️ " + (e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const rerun = async () => {
    if (!suite) return;
    setNote("Running…");
    const res = await runSuite(suite);
    setResults(res);
    setNote(`${res.filter((r) => r.ok).length}/${res.length} passed`);
  };

  const askReview = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setNote("Reviewing…");
    const failures = results.filter((r) => !r.ok);
    try {
      await stream(
        "You are a meticulous senior code reviewer. Point out bugs, security issues, edge cases and performance problems, then give the corrected code. Be concise and use markdown.",
        `Review this code:\n\`\`\`javascript\n${code}\n\`\`\`` +
          (failures.length
            ? `\n\nThese tests are failing:\n${failures
                .map((f) => `- ${f.name}: ${f.error}`)
                .join("\n")}`
            : ""),
        setReview,
      );
      setNote("");
    } finally {
      setBusy(false);
    }
  };

  const passed = results.filter((r) => r.ok).length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-semibold">🧪 Test &amp; QA Lab</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Paste JavaScript. The AI writes a test suite, actually runs it in a sandboxed
            worker, and reviews your code. All free, all in your browser.
          </p>
        </div>

        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          rows={10}
          placeholder="Paste the function you want tested…"
          className="w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 font-mono text-[13px] outline-none focus:border-[var(--accent)]"
        />

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 text-xs outline-none"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.keyed ? " (key)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={generateAndRun}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-3 py-2 font-medium text-white disabled:opacity-40"
          >
            <IconSend width={15} height={15} /> Generate &amp; run tests
          </button>
          <button
            onClick={askReview}
            disabled={busy}
            className="rounded-lg border border-[var(--line)] px-3 py-2 disabled:opacity-40"
          >
            🔍 Review code
          </button>
          {suite && !busy && (
            <button onClick={rerun} className="rounded-lg border border-[var(--line)] px-3 py-2">
              ↻ Re-run
            </button>
          )}
          {busy && (
            <button
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg border border-[var(--line)] p-2"
            >
              <IconStop width={15} height={15} />
            </button>
          )}
          <span className="text-xs text-[var(--muted)]">{note}</span>
        </div>

        {!!results.length && (
          <div className="fade-in overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <div
              className={`px-4 py-2 text-sm font-medium ${
                passed === results.length
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {passed === results.length ? "✓ All tests passed" : "✗ Some tests failed"} —{" "}
              {passed}/{results.length}
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {results.map((r, i) => (
                <li key={i} className="px-4 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={r.ok ? "text-emerald-400" : "text-red-400"}>
                      {r.ok ? "✓" : "✗"}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="text-[10px] text-[var(--muted)]">{r.ms}ms</span>
                  </div>
                  {r.error && (
                    <pre className="mt-1 ml-5 whitespace-pre-wrap text-xs text-red-400/90">
                      {r.error}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {suite && (
          <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
            <summary className="cursor-pointer text-sm text-[var(--muted)]">
              Generated test suite
            </summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap p-1 font-mono text-[12px]">
              {suite}
            </pre>
          </details>
        )}

        {review && (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
            <Markdown>{review}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
