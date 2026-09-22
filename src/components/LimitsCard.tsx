"use client";

import type { Keys } from "@/lib/types";

type Row = {
  name: string;
  free: string;
  note: string;
  active: boolean;
  url?: string;
};

export default function LimitsCard({ keys }: { keys: Keys }) {
  const rows: Row[] = [
    {
      name: "Pollinations (default models)",
      free: "No key, unmetered",
      note: "~1 request / 5 s. Can be slow when busy — the app falls back automatically.",
      active: true,
    },
    {
      name: "Groq",
      free: "~14,400 req/day · 30/min",
      note: "Fastest option. Free forever, no card.",
      active: !!keys.groq,
      url: "https://console.groq.com/keys",
    },
    {
      name: "Google Gemini",
      free: "1,500 req/day (Flash)",
      note: "Huge context, reads images. No card needed.",
      active: !!keys.gemini,
      url: "https://aistudio.google.com/apikey",
    },
    {
      name: "OpenRouter",
      free: "50 req/day on :free models",
      note: "Rises to 1,000/day with a one-time $10 credit.",
      active: !!keys.openrouter,
      url: "https://openrouter.ai/keys",
    },
    {
      name: "Image generation",
      free: "Unmetered",
      note: "Pollinations — no key, fair-use rate limited.",
      active: true,
    },
    {
      name: "Video editing · tests · TTS · PDF",
      free: "Truly unlimited",
      note: "Runs on your own device. No server, no quota, works offline.",
      active: true,
    },
    {
      name: "Ollama (local models)",
      free: "Truly unlimited",
      note: "Runs on your own PC — no key, no quota, offline. Set it up below.",
      active: true,
      url: "https://ollama.com/download",
    },
    {
      name: "APK builds (GitHub Actions)",
      free: "Unlimited on public repos",
      note: "Private repos get 2,000 minutes/month.",
      active: true,
      url: "https://github.com/settings/billing",
    },
  ];

  const keyed = [keys.groq, keys.gemini, keys.openrouter].filter(Boolean).length;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <h2 className="font-semibold">Free capacity &amp; limits</h2>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Nothing here costs money. When one provider is rate-limited the app silently retries
        the next one, so you rarely see a failure.{" "}
        {keyed === 0
          ? "Add even one free key below and your daily headroom jumps massively."
          : `${keyed} key${keyed > 1 ? "s" : ""} active — you have plenty of headroom.`}
      </p>

      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 text-sm"
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                r.active ? "bg-emerald-400" : "bg-[var(--muted)]/40"
              }`}
              title={r.active ? "active" : "add a key to activate"}
            />
            <span className="font-medium">{r.name}</span>
            <span className="rounded-md bg-[var(--panel)] px-2 py-0.5 text-xs text-[var(--accent)]">
              {r.free}
            </span>
            <span className="w-full text-xs text-[var(--muted)] sm:w-auto sm:flex-1">
              {r.note}
            </span>
            {r.url && !r.active && (
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--accent)] underline"
              >
                get key ↗
              </a>
            )}
          </div>
        ))}
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-[var(--muted)]">
          Can this ever be truly unlimited?
        </summary>
        <p className="mt-2 text-[var(--muted)]">
          Not from a hosted model — someone pays for those GPUs. Two ways to get genuinely
          unlimited text generation: (1) run a local model with{" "}
          <a
            className="text-[var(--accent)] underline"
            href="https://ollama.com"
            target="_blank"
            rel="noreferrer"
          >
            Ollama
          </a>{" "}
          on your own PC — free forever, limited only by your hardware; or (2) stack several
          free keys, which is exactly what the fallback chain above does. Everything that runs
          in your browser — video editing, tests, speech, PDF reading — already has no limit
          at all.
        </p>
      </details>
    </div>
  );
}
