"use client";

import { useState } from "react";
import { IconDownload, IconImage } from "./Icons";

const STYLES = [
  { id: "none", label: "None", suffix: "" },
  { id: "photo", label: "Photoreal", suffix: ", photorealistic, 50mm, natural light, sharp focus, high detail" },
  { id: "anime", label: "Anime", suffix: ", anime key visual, clean lineart, vibrant colors, studio quality" },
  { id: "3d", label: "3D render", suffix: ", 3d render, octane, soft studio lighting, subsurface scattering" },
  { id: "art", label: "Digital art", suffix: ", digital painting, dramatic lighting, artstation trending" },
  { id: "logo", label: "Logo", suffix: ", flat vector logo, minimal, centered, plain background" },
];

const SIZES = [
  { label: "Square 1:1", w: 1024, h: 1024 },
  { label: "Landscape 16:9", w: 1280, h: 720 },
  { label: "Portrait 9:16", w: 768, h: 1344 },
  { label: "Wide 3:2", w: 1200, h: 800 },
];

type Shot = { url: string; prompt: string; id: string };

export default function ImagePanel() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(STYLES[1]);
  const [size, setSize] = useState(SIZES[0]);
  const [model, setModel] = useState("flux");
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);

  const generate = () => {
    const p = prompt.trim();
    if (!p) return;
    setLoading(true);
    const made: Shot[] = Array.from({ length: count }, () => {
      const seed = Math.floor(Math.random() * 1_000_000);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        p + style.suffix,
      )}?width=${size.w}&height=${size.h}&seed=${seed}&model=${model}&nologo=true`;
      return { url, prompt: p, id: `${seed}` };
    });
    setShots((s) => [...made, ...s].slice(0, 24));
    setLoading(false);
  };

  const download = async (url: string, name: string) => {
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.jpg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--line)] p-4">
        <div className="mx-auto max-w-3xl space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
            rows={2}
            placeholder="Describe the image…  e.g. a neon-lit Jaipur street in the rain, cinematic"
            className="w-full resize-none rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-[15px] outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={style.id}
              onChange={(e) => setStyle(STYLES.find((s) => s.id === e.target.value)!)}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 outline-none"
            >
              {STYLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={size.label}
              onChange={(e) => setSize(SIZES.find((s) => s.label === e.target.value)!)}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 outline-none"
            >
              {SIZES.map((s) => (
                <option key={s.label}>{s.label}</option>
              ))}
            </select>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 outline-none"
            >
              <option value="flux">Flux</option>
              <option value="turbo">Turbo (fast)</option>
              <option value="kontext">Kontext</option>
            </select>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 outline-none"
            >
              {[1, 2, 4].map((n) => (
                <option key={n} value={n}>
                  {n} image{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={!prompt.trim() || loading}
              className="ml-auto rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-4 py-2 font-medium text-white disabled:opacity-40"
            >
              Generate
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {shots.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-[var(--muted)]">
            <IconImage width={40} height={40} />
            <p className="mt-3 text-sm">
              Free image generation — no API key required.
              <br />
              Type a prompt above and hit Generate.
            </p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shots.map((s) => (
              <div
                key={s.id}
                className="fade-in group relative overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]"
              >
                <img src={s.url} alt={s.prompt} loading="lazy" className="w-full" />
                <div className="flex items-center gap-2 p-2">
                  <p className="line-clamp-1 flex-1 text-xs text-[var(--muted)]">{s.prompt}</p>
                  <button
                    onClick={() => download(s.url, `rv-${s.id}`)}
                    title="Download"
                    className="rounded-md border border-[var(--line)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    <IconDownload width={15} height={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
