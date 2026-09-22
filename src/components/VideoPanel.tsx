"use client";

import { useRef, useState } from "react";
import { IconDownload, IconVideo } from "./Icons";

type Job =
  | { id: "trim"; label: "Trim clip" }
  | { id: "gif"; label: "Convert to GIF" }
  | { id: "mute"; label: "Remove audio" }
  | { id: "audio"; label: "Extract audio (MP3)" }
  | { id: "compress"; label: "Compress" }
  | { id: "resize"; label: "Resize / crop to 9:16" };

const JOBS: Job[] = [
  { id: "trim", label: "Trim clip" },
  { id: "gif", label: "Convert to GIF" },
  { id: "mute", label: "Remove audio" },
  { id: "audio", label: "Extract audio (MP3)" },
  { id: "compress", label: "Compress" },
  { id: "resize", label: "Resize / crop to 9:16" },
];

const CORE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

export default function VideoPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job["id"]>("trim");
  const [start, setStart] = useState("0");
  const [duration, setDuration] = useState("5");
  const [log, setLog] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string; name: string; type: string } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ffRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFF = async () => {
    if (ffRef.current) return ffRef.current;
    const { FFmpeg } = await import("@ffmpeg/ffmpeg");
    const { toBlobURL } = await import("@ffmpeg/util");
    const ff = new FFmpeg();
    ff.on("log", ({ message }: { message: string }) =>
      setLog((l) => (l + "\n" + message).slice(-4000)),
    );
    ff.on("progress", ({ progress }: { progress: number }) =>
      setProgress(Math.min(100, Math.round(progress * 100))),
    );
    setLog("Loading the video engine (first run downloads ~30 MB)…");
    await ff.load({
      coreURL: await toBlobURL(`${CORE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    ffRef.current = ff;
    return ff;
  };

  const argsFor = (input: string, out: string): string[] => {
    switch (job) {
      case "trim":
        return ["-ss", start, "-i", input, "-t", duration, "-c", "copy", out];
      case "gif":
        return [
          "-ss", start, "-t", duration, "-i", input,
          "-vf", "fps=12,scale=480:-1:flags=lanczos",
          "-loop", "0", out,
        ];
      case "mute":
        return ["-i", input, "-an", "-c:v", "copy", out];
      case "audio":
        return ["-i", input, "-vn", "-b:a", "192k", out];
      case "compress":
        return ["-i", input, "-vcodec", "libx264", "-crf", "30", "-preset", "veryfast", out];
      case "resize":
        return [
          "-i", input,
          "-vf", "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=720:1280",
          "-c:a", "copy", out,
        ];
    }
  };

  const outMeta = (): { name: string; type: string } => {
    if (job === "gif") return { name: "rv-output.gif", type: "image/gif" };
    if (job === "audio") return { name: "rv-output.mp3", type: "audio/mpeg" };
    return { name: "rv-output.mp4", type: "video/mp4" };
  };

  const run = async () => {
    if (!file || busy) return;
    setBusy(true);
    setResult(null);
    setProgress(0);
    try {
      const ff = await loadFF();
      const { fetchFile } = await import("@ffmpeg/util");
      const inName = "input" + (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".mp4");
      await ff.writeFile(inName, await fetchFile(file));
      const meta = outMeta();
      await ff.exec(argsFor(inName, meta.name));
      const data = await ff.readFile(meta.name);
      const blob = new Blob([data as unknown as BlobPart], { type: meta.type });
      setResult({ url: URL.createObjectURL(blob), ...meta });
      setProgress(100);
    } catch (e) {
      setLog((l) => l + "\n⚠️ " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <IconVideo /> Video Studio
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Runs entirely in your browser with FFmpeg — nothing is uploaded, and it&apos;s free.
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-8 text-center transition hover:border-[var(--accent)]"
        >
          <input
            ref={inputRef}
            type="file"
            accept="video/*,audio/*"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div className="text-sm">
              <strong>{file.name}</strong>
              <div className="text-[var(--muted)]">
                {(file.size / 1024 / 1024).toFixed(1)} MB — click to change
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--muted)]">
              Drop a video here, or click to choose one
              <div className="mt-1 text-xs">Keep it under ~100 MB for smooth browser processing</div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={job}
              onChange={(e) => setJob(e.target.value as Job["id"])}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 outline-none"
            >
              {JOBS.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.label}
                </option>
              ))}
            </select>
            {(job === "trim" || job === "gif") && (
              <>
                <label className="flex items-center gap-1 text-[var(--muted)]">
                  start
                  <input
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="w-20 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 text-[var(--text)] outline-none"
                    placeholder="00:00"
                  />
                </label>
                <label className="flex items-center gap-1 text-[var(--muted)]">
                  seconds
                  <input
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-20 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1.5 text-[var(--text)] outline-none"
                  />
                </label>
              </>
            )}
            <button
              onClick={run}
              disabled={!file || busy}
              className="ml-auto rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-4 py-2 font-medium text-white disabled:opacity-40"
            >
              {busy ? "Processing…" : "Run"}
            </button>
          </div>

          {busy && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel-2)]">
              <div
                className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {result && (
          <div className="fade-in rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            {result.type.startsWith("video") && (
              <video src={result.url} controls className="max-h-96 w-full rounded-lg" />
            )}
            {result.type === "image/gif" && (
              <img src={result.url} alt="result" className="max-h-96 rounded-lg" />
            )}
            {result.type.startsWith("audio") && <audio src={result.url} controls className="w-full" />}
            <a
              href={result.url}
              download={result.name}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              <IconDownload width={16} height={16} /> Download {result.name}
            </a>
          </div>
        )}

        {log && (
          <details className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-xs">
            <summary className="cursor-pointer text-[var(--muted)]">Engine log</summary>
            <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap text-[var(--muted)]">
              {log}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
