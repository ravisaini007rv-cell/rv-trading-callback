"use client";

import { useRef, useState } from "react";
import Markdown from "./Markdown";
import { IconSend, IconStop } from "./Icons";
import { streamChat } from "@/lib/stream";
import { useModels } from "@/lib/useModels";
import type { Keys } from "@/lib/types";

type Sheet = { name: string; headers: string[]; rows: string[][] };

const ANALYST_PROMPT = `You are a precise data analyst.

You receive a table's column names, row count, and a sample of rows. Answer the user's
question about the data.

- Show real numbers, not vague statements.
- Use a markdown table when comparing things.
- When a trend or breakdown would help, include a mermaid chart in a \`\`\`mermaid block
  (pie, xychart-beta, or flowchart). Keep labels short.
- If the sample is too small to be sure, say so.
- Reply in the user's language.`;

export default function DataPanel({ keys, modelId }: { keys: Keys; modelId: string }) {
  const allModels = useModels();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState(modelId);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = async (file: File) => {
    const Papa = (await import("papaparse")).default;
    const text = await file.text();
    const parsed = Papa.parse<string[]>(text.slice(0, 5_000_000), {
      skipEmptyLines: true,
    });
    const all = parsed.data.filter((r) => Array.isArray(r) && r.length > 1);
    if (!all.length) return alert("Could not read any rows from that file.");
    setSheet({ name: file.name, headers: all[0], rows: all.slice(1) });
    setAnswer("");
  };

  const ask = async (override?: string) => {
    const q = (override ?? question).trim();
    if (!q || !sheet || busy) return;
    setBusy(true);
    setAnswer("");
    const controller = new AbortController();
    abortRef.current = controller;

    const sample = sheet.rows.slice(0, 120).map((r) => r.join(" | ")).join("\n");
    const context = `FILE: ${sheet.name}
COLUMNS: ${sheet.headers.join(" | ")}
TOTAL ROWS: ${sheet.rows.length}
SAMPLE (first ${Math.min(120, sheet.rows.length)} rows):
${sample}`;

    try {
      const stream = await streamChat({
        modelId: model,
        system: ANALYST_PROMPT,
        keys,
        messages: [{ role: "user", content: `${context}\n\nQUESTION: ${q}` }],
        signal: controller.signal,
      });
      const reader = stream?.getReader();
      const dec = new TextDecoder();
      let acc = "";
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setAnswer(acc);
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setAnswer("⚠️ " + (e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const QUICK = [
    "Summarise this data in 5 bullet points",
    "Kaunse patterns ya trends dikh rahe hain?",
    "Show the top 10 rows by the most important numeric column, as a table",
    "Koi outlier ya galat data hai to batao",
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-4xl space-y-3">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-semibold">📊 Data Analyst</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Upload a CSV or TSV. Ask questions in plain language — answers come back with
            tables and charts. The file never leaves your browser; only a small sample is sent
            to the model.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt"
          hidden
          onChange={(e) => e.target.files?.[0] && load(e.target.files[0])}
        />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
          }}
          className="cursor-pointer rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-6 text-center text-sm transition hover:border-[var(--accent)]"
        >
          {sheet ? (
            <span>
              <strong>{sheet.name}</strong>
              <span className="text-[var(--muted)]">
                {" "}
                — {sheet.rows.length} rows × {sheet.headers.length} columns (click to change)
              </span>
            </span>
          ) : (
            <span className="text-[var(--muted)]">Drop a CSV here, or click to choose</span>
          )}
        </div>

        {sheet && (
          <>
            <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--panel-2)]">
                  <tr>
                    {sheet.headers.slice(0, 12).map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 8).map((r, i) => (
                    <tr key={i} className="border-t border-[var(--line)]">
                      {r.slice(0, 12).map((c, j) => (
                        <td key={j} className="max-w-48 truncate px-3 py-1.5 text-[var(--muted)]">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuestion(q);
                    ask(q);
                  }}
                  disabled={busy}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)] disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-2 focus-within:border-[var(--accent)]">
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="shrink-0 rounded-lg bg-[var(--panel-2)] px-2 py-1.5 text-xs outline-none"
              >
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask();
                  }
                }}
                rows={1}
                placeholder="Ask anything about this data…"
                className="max-h-24 flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-[var(--muted)]"
              />
              {busy ? (
                <button
                  onClick={() => abortRef.current?.abort()}
                  className="rounded-xl bg-[var(--panel-2)] p-2"
                >
                  <IconStop width={16} height={16} />
                </button>
              ) : (
                <button
                  onClick={() => ask()}
                  disabled={!question.trim()}
                  className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] p-2 text-white disabled:opacity-35"
                >
                  <IconSend width={16} height={16} />
                </button>
              )}
            </div>
          </>
        )}

        {answer && (
          <div className="fade-in rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
            <Markdown>{answer}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
}
