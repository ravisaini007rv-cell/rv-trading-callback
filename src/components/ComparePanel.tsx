"use client";

import { useRef, useState } from "react";
import Markdown from "./Markdown";
import { IconCompare, IconSend, IconStop } from "./Icons";
import { findModel } from "@/lib/models";
import { useModels } from "@/lib/useModels";
import { streamChat } from "@/lib/stream";
import { PLAIN_PROMPT } from "@/lib/tools";
import type { Keys } from "@/lib/types";

type Lane = {
  modelId: string;
  text: string;
  ms: number;
  status: "idle" | "running" | "done" | "error";
};

const DEFAULTS = ["rv-smart", "rv-coder", "rv-reason"];

export default function ComparePanel({
  keys,
  systemPrompt,
}: {
  keys: Keys;
  systemPrompt: string;
}) {
  const allModels = useModels();
  const [prompt, setPrompt] = useState("");
  const [lanes, setLanes] = useState<Lane[]>(
    DEFAULTS.map((modelId) => ({ modelId, text: "", ms: 0, status: "idle" })),
  );
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const setLane = (i: number, patch: Partial<Lane>) =>
    setLanes((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const run = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;

    setLanes((l) => l.map((x) => ({ ...x, text: "", ms: 0, status: "running" as const })));

    await Promise.all(
      lanes.map(async (lane, i) => {
        const t0 = performance.now();
        let acc = "";
        try {
          const stream = await streamChat({
            modelId: lane.modelId,
            system: systemPrompt || PLAIN_PROMPT,
            keys,
            messages: [{ role: "user", content: p }],
            signal: controller.signal,
          });
          const reader = stream?.getReader();
          const dec = new TextDecoder();
          if (reader) {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              acc += dec.decode(value, { stream: true });
              setLane(i, { text: acc, ms: Math.round(performance.now() - t0) });
            }
          }
          setLane(i, {
            text: acc || "_(empty response)_",
            ms: Math.round(performance.now() - t0),
            status: "done",
          });
        } catch (e) {
          setLane(i, {
            text: acc + `\n\n⚠️ ${(e as Error).message}`,
            status: "error",
            ms: Math.round(performance.now() - t0),
          });
        }
      }),
    );

    setBusy(false);
    abortRef.current = null;
  };

  const addLane = () =>
    setLanes((l) =>
      l.length >= 4 ? l : [...l, { modelId: "rv-fast", text: "", ms: 0, status: "idle" }],
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--line)] p-4">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-2 focus-within:border-[var(--accent)]">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  run();
                }
              }}
              rows={1}
              placeholder="Ask every model the same question…"
              className="max-h-32 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-[var(--muted)]"
            />
            {busy ? (
              <button
                onClick={() => abortRef.current?.abort()}
                className="rounded-xl bg-[var(--panel-2)] p-2.5"
              >
                <IconStop />
              </button>
            ) : (
              <button
                onClick={run}
                disabled={!prompt.trim()}
                className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] p-2.5 text-white disabled:opacity-35"
              >
                <IconSend />
              </button>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
            <IconCompare width={14} height={14} />
            Same prompt, {lanes.length} models, side by side.
            {lanes.length < 4 && (
              <button onClick={addLane} className="underline hover:text-[var(--text)]">
                + add model
              </button>
            )}
            {lanes.length > 2 && (
              <button
                onClick={() => setLanes((l) => l.slice(0, -1))}
                className="underline hover:text-[var(--text)]"
              >
                − remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div
          className="mx-auto grid max-w-7xl gap-3"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))` }}
        >
          {lanes.map((lane, i) => {
            const m = allModels.find((x) => x.id === lane.modelId) ?? findModel(lane.modelId);
            return (
              <div
                key={i}
                className="flex min-h-[220px] flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
              >
                <div className="flex items-center gap-2 border-b border-[var(--line)] p-2">
                  <select
                    value={lane.modelId}
                    onChange={(e) => setLane(i, { modelId: e.target.value, text: "" })}
                    className="min-w-0 flex-1 truncate rounded-lg bg-[var(--panel-2)] px-2 py-1 text-xs outline-none"
                  >
                    {allModels.map((mm) => (
                      <option key={mm.id} value={mm.id}>
                        {mm.label}
                        {mm.keyed ? " (key)" : ""}
                      </option>
                    ))}
                  </select>
                  {lane.ms > 0 && (
                    <span className="shrink-0 text-[10px] text-[var(--muted)]">
                      {(lane.ms / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
                  {lane.text ? (
                    <Markdown>{lane.text}</Markdown>
                  ) : lane.status === "running" ? (
                    <div className="flex gap-1.5">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="dot h-2 w-2 rounded-full bg-[var(--muted)]"
                          style={{ animationDelay: `${d * 0.15}s` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">{m.hint}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
