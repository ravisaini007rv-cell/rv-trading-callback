"use client";

import { KEY_FIELDS } from "@/lib/models";
import { useEffect, useState } from "react";
import LimitsCard from "./LimitsCard";
import OllamaCard from "./OllamaCard";
import { loadMemories, removeMemory, type Memory } from "@/lib/memory";
import type { Keys } from "@/lib/types";

type Props = {
  keys: Keys;
  setKeys: (k: Keys) => void;
  systemPrompt: string;
  setSystemPrompt: (s: string) => void;
};

export default function SettingsPanel({ keys, setKeys, systemPrompt, setSystemPrompt }: Props) {
  const [mem, setMem] = useState<Memory[]>([]);
  useEffect(() => setMem(loadMemories()), []);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <LimitsCard keys={keys} />
        <OllamaCard />
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-semibold">Free API keys (optional)</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            The default models work without any key. Add free keys below to unlock faster and
            smarter models. Keys are stored only in your browser (localStorage) and are sent
            straight to the provider.
          </p>
          <div className="mt-4 space-y-3">
            {KEY_FIELDS.map((f) => (
              <div key={f.provider}>
                <label className="flex items-center justify-between text-sm">
                  <span className="font-medium">{f.label}</span>
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-[var(--accent)] underline"
                  >
                    get a free key ↗
                  </a>
                </label>
                <input
                  type="password"
                  autoComplete="off"
                  value={keys[f.provider as keyof Keys] ?? ""}
                  onChange={(e) => setKeys({ ...keys, [f.provider]: e.target.value })}
                  placeholder="paste key here…"
                  className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-semibold">Custom instructions</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Tell RV AI how it should behave in every chat.
          </p>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={6}
            placeholder="e.g. Always reply in Hinglish. Keep answers short. I am a beginner developer."
            className="mt-3 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-3 text-sm outline-none focus:border-[var(--accent)]"
          />
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="font-semibold">🧠 Memory</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Facts RV AI has picked up about you and uses in every chat.
          </p>
          {mem.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Nothing remembered yet. Try telling it something like &ldquo;my name is Ravi and I
              build trading apps&rdquo;.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {mem.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                >
                  <span className="flex-1">{m.text}</span>
                  <button
                    onClick={() => setMem(removeMemory(m.id))}
                    className="shrink-0 text-xs text-[var(--muted)] hover:text-red-400"
                  >
                    forget
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm">
          <h2 className="font-semibold">Data</h2>
          <p className="mt-1 text-[var(--muted)]">
            Chats live in your browser only. Nothing is stored on a server.
          </p>
          <button
            onClick={() => {
              if (confirm("Delete all chats, keys and settings?")) {
                localStorage.clear();
                location.reload();
              }
            }}
            className="mt-3 rounded-lg border border-red-500/40 px-3 py-2 text-red-400 hover:bg-red-500/10"
          >
            Erase everything
          </button>
        </div>
      </div>
    </div>
  );
}
