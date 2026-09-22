"use client";

import { useEffect, useState } from "react";
import { vfs, type VFile } from "@/lib/vfs";
import { downloadZip } from "@/lib/project";

/** Shows the files the agent has created, so its work is never invisible. */
export default function WorkspaceCard() {
  const [files, setFiles] = useState<VFile[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setFiles(vfs.list());
    sync();
    window.addEventListener("rv-vfs-change", sync);
    return () => window.removeEventListener("rv-vfs-change", sync);
  }, []);

  if (!files.length) return null;
  const active = files.find((f) => f.path === open);

  return (
    <div className="mb-2 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-2.5">
      <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
        📁 Agent workspace — {files.length} file{files.length > 1 ? "s" : ""}
        <button
          onClick={() => downloadZip(files.map((f) => ({ path: f.path, content: f.content })))}
          className="ml-auto underline hover:text-[var(--text)]"
        >
          download zip
        </button>
        <button
          onClick={() => {
            if (confirm("Delete all agent files?")) {
              vfs.clear();
              setOpen(null);
            }
          }}
          className="underline hover:text-red-400"
        >
          clear
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => setOpen(open === f.path ? null : f.path)}
            className={`rounded-lg border px-2 py-1 font-mono text-[11px] ${
              open === f.path
                ? "border-[var(--accent)] text-[var(--text)]"
                : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {f.path}
          </button>
        ))}
      </div>

      {active && (
        <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2 font-mono text-[11px] leading-relaxed">
          {active.content.slice(0, 6000)}
        </pre>
      )}
    </div>
  );
}
