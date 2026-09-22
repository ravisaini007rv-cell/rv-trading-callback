"use client";

import { TOOL_LABEL } from "@/lib/tools";
import type { ToolRun } from "@/lib/types";

export default function ToolRunCard({ run }: { run: ToolRun }) {
  const label = TOOL_LABEL[run.tool] ?? run.tool;
  const detail =
    run.args.query || run.args.url || run.args.prompt || run.args.code?.slice(0, 80) || "";

  return (
    <details className="fade-in my-2 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-2)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs">
        <span
          className={
            run.status === "running"
              ? "dot h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
              : run.status === "error"
                ? "h-2 w-2 shrink-0 rounded-full bg-red-400"
                : "h-2 w-2 shrink-0 rounded-full bg-emerald-400"
          }
        />
        <span className="font-medium">{label}</span>
        {detail && (
          <span className="truncate text-[var(--muted)]">
            {detail}
          </span>
        )}
        <span className="ml-auto shrink-0 text-[var(--muted)]">
          {run.status === "running" ? "…" : "view"}
        </span>
      </summary>

      {run.imageUrl && (
        <img
          src={run.imageUrl}
          alt={run.args.prompt ?? "generated"}
          className="w-full border-t border-[var(--line)]"
        />
      )}

      {run.result && (
        <pre className="max-h-64 overflow-auto border-t border-[var(--line)] p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-[var(--muted)]">
          {run.result.slice(0, 4000)}
        </pre>
      )}
    </details>
  );
}
