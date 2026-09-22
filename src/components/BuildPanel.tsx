"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconDownload, IconSend, IconStop, IconTrash } from "./Icons";
import { streamChat } from "@/lib/stream";
import { useModels } from "@/lib/useModels";
import {
  STARTER,
  buildPreviewHtml,
  downloadZip,
  parseWriteBlocks,
  type ProjectFile,
} from "@/lib/project";
import { androidBundle, defaultAppId } from "@/lib/apk";
import type { Keys } from "@/lib/types";

const BUILD_PROMPT = `You are RV Builder, an expert front-end engineer.

You are editing a static web project (HTML + CSS + vanilla JS, or a single HTML file).
The user describes what they want; you output the COMPLETE contents of every file you
create or change, each in its own fenced block using this exact syntax:

\`\`\`write path=index.html
<!doctype html>
...full file...
\`\`\`

Rules:
- ALWAYS output whole files, never diffs or "..." placeholders.
- Keep it to index.html, style.css and app.js unless the user asks otherwise.
- No build step, no npm, no frameworks that need bundling. CDN <script> tags are fine.
- Make it look genuinely good: modern layout, responsive, thoughtful spacing and colour.
- Write one short sentence before the blocks explaining what you did. Nothing after them.`;

export default function BuildPanel({
  keys,
  modelId,
}: {
  keys: Keys;
  modelId: string;
}) {
  const allModels = useModels();
  const [files, setFiles] = useState<ProjectFile[]>(STARTER);
  const [activePath, setActivePath] = useState("index.html");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [runtimeError, setRuntimeError] = useState("");
  const [view, setView] = useState<"preview" | "code">("preview");
  const [appName, setAppName] = useState("RV App");
  const [showApk, setShowApk] = useState(false);
  const [showDeploy, setShowDeploy] = useState(false);
  const [model, setModel] = useState(modelId);
  const abortRef = useRef<AbortController | null>(null);

  const active = files.find((f) => f.path === activePath) ?? files[0];
  const srcDoc = useMemo(() => buildPreviewHtml(files), [files]);

  /* capture errors thrown inside the preview iframe */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.__rvError) setRuntimeError(String(e.data.__rvError));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => setRuntimeError(""), [srcDoc]);

  const updateActive = (content: string) =>
    setFiles((fs) => fs.map((f) => (f.path === active.path ? { ...f, content } : f)));

  const generate = async (override?: string) => {
    const p = (override ?? prompt).trim();
    if (!p || busy) return;
    setBusy(true);
    setNote("Thinking…");
    setPrompt("");

    const controller = new AbortController();
    abortRef.current = controller;

    const context = files
      .map((f) => `--- ${f.path} ---\n${f.content}`)
      .join("\n\n")
      .slice(0, 24000);

    let acc = "";
    try {
      const stream = await streamChat({
        modelId: model,
        system: BUILD_PROMPT,
        keys,
        messages: [
          { role: "user", content: `CURRENT PROJECT:\n${context}\n\nTASK: ${p}` },
        ],
        signal: controller.signal,
      });
      const reader = stream?.getReader();
      const dec = new TextDecoder();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          const written = parseWriteBlocks(acc).length;
          setNote(written ? `Writing files… (${written})` : "Thinking…");
        }
      }

      const produced = parseWriteBlocks(acc);
      if (produced.length) {
        setFiles((fs) => {
          const next = [...fs];
          for (const nf of produced) {
            const i = next.findIndex((f) => f.path === nf.path);
            if (i >= 0) next[i] = nf;
            else next.push(nf);
          }
          return next;
        });
        setNote(`✓ Updated ${produced.map((f) => f.path).join(", ")}`);
        setView("preview");
      } else {
        setNote("Model did not return any files — try rephrasing or another model.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("⚠️ " + (e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* prompt bar */}
      <div className="shrink-0 border-b border-[var(--line)] p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-2 focus-within:border-[var(--accent)]">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                generate();
              }
            }}
            rows={1}
            placeholder="Describe the website…  e.g. ek trading dashboard banao dark theme with live chart"
            className="max-h-28 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-[var(--muted)]"
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
              onClick={() => generate()}
              disabled={!prompt.trim()}
              className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] p-2.5 text-white disabled:opacity-35"
            >
              <IconSend />
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1 outline-none"
          >
            {allModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.keyed ? " (key)" : ""}
              </option>
            ))}
          </select>
          {runtimeError && (
            <button
              onClick={() => generate(`The preview throws this error, fix it: ${runtimeError}`)}
              className="rounded-lg border border-red-500/40 px-2 py-1 text-red-400"
            >
              ⚠ Fix error automatically
            </button>
          )}
          <span className="truncate text-[var(--muted)]">{note}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => downloadZip(files)}
              title="Download project as ZIP"
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <IconDownload width={14} height={14} /> ZIP
            </button>
            <button
              onClick={() => setShowDeploy(true)}
              title="Publish this site online for free"
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]"
            >
              🚀 Deploy
            </button>
            <button
              onClick={() => setShowApk(true)}
              title="Export as an Android app project"
              className="flex items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]"
            >
              📱 APK
            </button>
            <button
              onClick={() => {
                if (confirm("Reset project to the starter template?")) setFiles(STARTER);
              }}
              title="Reset project"
              className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <IconTrash width={14} height={14} />
            </button>
          </div>
        </div>
      </div>

      {/* view switch */}
      <div className="flex shrink-0 gap-1 border-b border-[var(--line)] px-3 py-1.5">
        {(["preview", "code"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-lg px-3 py-1 text-xs capitalize ${
              view === v ? "bg-[var(--panel-2)]" : "text-[var(--muted)]"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* body */}
      <div className="min-h-0 flex-1">
        {view === "preview" ? (
          <iframe
            title="preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms allow-popups"
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="flex h-full min-h-0">
            <div className="w-44 shrink-0 overflow-y-auto border-r border-[var(--line)] p-2">
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => setActivePath(f.path)}
                  className={`block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs ${
                    f.path === active.path
                      ? "bg-[var(--panel-2)]"
                      : "text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {f.path}
                </button>
              ))}
              <button
                onClick={() => {
                  const p = prompt_("New file name (e.g. about.html)");
                  if (p && !files.some((f) => f.path === p)) {
                    setFiles((fs) => [...fs, { path: p, content: "" }]);
                    setActivePath(p);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-dashed border-[var(--line)] px-2 py-1.5 text-xs text-[var(--muted)]"
              >
                + file
              </button>
            </div>
            <textarea
              value={active?.content ?? ""}
              onChange={(e) => updateActive(e.target.value)}
              spellCheck={false}
              className="min-w-0 flex-1 resize-none bg-[var(--bg)] p-3 font-mono text-[13px] leading-relaxed outline-none"
            />
          </div>
        )}
      </div>

      {showDeploy && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowDeploy(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <h3 className="text-lg font-semibold">🚀 Put this site online — free</h3>

            <ol className="mt-4 space-y-3 text-sm">
              <li className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-3">
                <strong>1. Download the files</strong>
                <p className="mt-1 text-[var(--muted)]">
                  Grab the ZIP — it contains index.html, style.css and app.js.
                </p>
                <button
                  onClick={() => downloadZip(files)}
                  className="mt-2 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  Download ZIP
                </button>
              </li>

              <li className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-3">
                <strong>2. Pick a free host</strong>
                <div className="mt-2 space-y-2 text-[var(--muted)]">
                  <p>
                    <a
                      className="text-[var(--accent)] underline"
                      href="https://app.netlify.com/drop"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Netlify Drop ↗
                    </a>{" "}
                    — easiest: drag the unzipped folder onto the page, live URL in seconds, no
                    account needed to start.
                  </p>
                  <p>
                    <a
                      className="text-[var(--accent)] underline"
                      href="https://vercel.com/new"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Vercel ↗
                    </a>{" "}
                    — import a GitHub repo, auto-redeploys on every push. 100 GB/month free.
                  </p>
                  <p>
                    <a
                      className="text-[var(--accent)] underline"
                      href="https://github.com/new"
                      target="_blank"
                      rel="noreferrer"
                    >
                      GitHub Pages ↗
                    </a>{" "}
                    — upload the files to a repo, then Settings → Pages → deploy from main.
                  </p>
                </div>
              </li>

              <li className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] p-3">
                <strong>3. Want an app instead?</strong>
                <p className="mt-1 text-[var(--muted)]">
                  Use the 📱 APK button — it builds a real Android app from these same files.
                </p>
              </li>
            </ol>

            <button
              onClick={() => setShowDeploy(false)}
              className="mt-4 w-full rounded-lg bg-[var(--panel-2)] px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showApk && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowApk(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <h3 className="text-lg font-semibold">📱 Export as Android app</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Downloads a Capacitor project with a GitHub Actions workflow. Push it to a public
              GitHub repo and a real installable APK is built for you — free, no Android Studio.
            </p>
            <label className="mt-4 block text-sm">
              App name
              <input
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2 outline-none focus:border-[var(--accent)]"
              />
            </label>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Package id: <code>{defaultAppId(appName)}</code>
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setShowApk(false)}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  downloadZip(
                    androidBundle(files, { appName, appId: defaultAppId(appName) }),
                    `${appName.replace(/\s+/g, "-").toLowerCase()}-android.zip`,
                  );
                  setShowApk(false);
                }}
                className="rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-4 py-2 text-sm font-medium text-white"
              >
                Download project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function prompt_(msg: string) {
  return typeof window === "undefined" ? null : window.prompt(msg);
}
