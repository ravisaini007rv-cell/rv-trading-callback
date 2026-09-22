"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_OLLAMA_URL,
  OLLAMA_SETUP,
  RECOMMENDED,
  getOllamaUrl,
  probeOllama,
  setOllamaUrl,
  type OllamaStatus,
} from "@/lib/ollama";
import { setLocalModels } from "@/lib/fallback";
import Markdown from "./Markdown";

export default function OllamaCard({ onModelsChanged }: { onModelsChanged?: () => void }) {
  const [url, setUrl] = useState(DEFAULT_OLLAMA_URL);
  const [status, setStatus] = useState<OllamaStatus>({ state: "checking" });
  const [showSetup, setShowSetup] = useState(false);
  const [copied, setCopied] = useState("");

  const check = useCallback(
    async (u?: string) => {
      setStatus({ state: "checking" });
      const res = await probeOllama(u ?? getOllamaUrl());
      setStatus(res);
      setLocalModels(res.state === "online" ? res.models : []);
      onModelsChanged?.();
    },
    [onModelsChanged],
  );

  useEffect(() => {
    const u = getOllamaUrl();
    setUrl(u);
    check(u);
  }, [check]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* ignore */
    }
  };

  const online = status.state === "online";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">🖥️ Local AI (Ollama)</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] ${
            online
              ? "bg-emerald-500/15 text-emerald-400"
              : status.state === "checking"
                ? "bg-[var(--panel-2)] text-[var(--muted)]"
                : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {online
            ? `connected · ${status.models.length} model${status.models.length === 1 ? "" : "s"}`
            : status.state === "checking"
              ? "checking…"
              : "not detected"}
        </span>
        <button
          onClick={() => check()}
          className="ml-auto rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
        >
          Check again
        </button>
      </div>

      <p className="mt-2 text-sm text-[var(--muted)]">
        Run an AI model on your own computer: <strong>no daily limit, no API key, fully
        private, works offline</strong>. This is the only way to get genuinely unlimited use.
      </p>

      {online && status.models.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-[var(--muted)]">Installed and ready to use:</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {status.models.map((m) => (
              <span
                key={m}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-400"
              >
                {m}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            These now appear in every model dropdown, marked <em>(local)</em>.
          </p>
        </div>
      )}

      {online && status.models.length === 0 && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm text-amber-400">
          Ollama is running but no models are installed. Pull one below.
        </p>
      )}

      {status.state === "offline" && (
        <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-2.5 text-sm text-[var(--muted)]">
          {status.reason} — follow the setup guide below. Most often it just needs{" "}
          <code className="text-[var(--accent)]">OLLAMA_ORIGINS=*</code> so the browser is
          allowed to connect.
        </p>
      )}

      {/* recommended models */}
      <details className="mt-3" open={status.state !== "online" || status.models.length === 0}>
        <summary className="cursor-pointer text-sm text-[var(--muted)]">
          Which model should I download?
        </summary>
        <div className="mt-2 space-y-1.5">
          {RECOMMENDED.map((r) => {
            const cmd = `ollama pull ${r.tag}`;
            const have = online && status.models.some((m) => m.startsWith(r.tag.split(":")[0]));
            return (
              <div
                key={r.tag}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm"
              >
                <span className="font-medium">{r.label}</span>
                <span className="text-xs text-[var(--muted)]">
                  {r.size} · {r.ram}
                </span>
                {have && <span className="text-xs text-emerald-400">installed</span>}
                <span className="w-full text-xs text-[var(--muted)] sm:w-auto sm:flex-1">
                  {r.note}
                </span>
                <button
                  onClick={() => copy(cmd)}
                  className="shrink-0 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {copied === cmd ? "copied ✓" : cmd}
                </button>
              </div>
            );
          })}
        </div>
      </details>

      {/* server url */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-[var(--muted)]">
          Advanced: server address
        </summary>
        <div className="mt-2 flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={DEFAULT_OLLAMA_URL}
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 font-mono text-xs outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={() => {
              setOllamaUrl(url);
              check(url.replace(/\/+$/, ""));
            }}
            className="rounded-lg border border-[var(--line)] px-3 py-2 text-xs"
          >
            Save
          </button>
        </div>
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Change this only if Ollama runs on another machine on your network.
        </p>
      </details>

      <button
        onClick={() => setShowSetup((v) => !v)}
        className="mt-3 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-3 py-2 text-sm font-medium text-white"
      >
        {showSetup ? "Hide setup guide" : "📖 Full setup guide"}
      </button>

      {showSetup && (
        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-4 text-sm">
          <Markdown>{OLLAMA_SETUP}</Markdown>
        </div>
      )}
    </div>
  );
}
