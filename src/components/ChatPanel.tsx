"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import Markdown from "./Markdown";
import ToolRunCard from "./ToolRunCard";
import WorkspaceCard from "./WorkspaceCard";
import {
  IconBolt,
  IconBook,
  IconClip,
  IconDownload,
  IconWave,
  IconMic,
  IconSend,
  IconStop,
  IconTrash,
} from "./Icons";
import { findModel } from "@/lib/models";
import { useModels } from "@/lib/useModels";
import { streamChat } from "@/lib/stream";
import { DOC_EXTENSIONS, extractAny } from "@/lib/docs";
import { MEMORY_INSTRUCTION, addMemory, extractMemoryMarkers, memoryBlock } from "@/lib/memory";
import { exportJson, exportMarkdown, exportPdf } from "@/lib/exporter";
import { BUILTIN, deletePrompt, loadPrompts, savePrompt, type Prompt } from "@/lib/prompts";
import { isSpeaking, speak, stopSpeaking, ttsAvailable } from "@/lib/speech";
import {
  AGENT_PROMPT,
  PLAIN_PROMPT,
  executeTool,
  parsePlan,
  parseToolCall,
} from "@/lib/tools";
import { vfs } from "@/lib/vfs";
import {
  uid,
  type Attachment,
  type Conversation,
  type Keys,
  type Message,
  type ToolRun,
} from "@/lib/types";

/** ⚡⚡⚡ = blazing, ⚡ = ok, 🐢 = slow but thorough */
function speedIcon(speed?: number) {
  const v = speed ?? 30;
  if (v >= 150) return "⚡⚡⚡";
  if (v >= 50) return "⚡⚡";
  if (v >= 25) return "⚡";
  return "🐢";
}

const SUGGESTIONS = [
  { t: "Debug my code", s: "Yeh Python function error de raha hai, fix karke samjhao:" },
  { t: "Explain simply", s: "Explain how JWT authentication works, in simple Hinglish." },
  { t: "Write a script", s: "Write a Node.js script that renames all files in a folder by date." },
  { t: "Plan something", s: "Ek 7-day Rajasthan road trip plan banao with budget." },
];

type Props = {
  conversation: Conversation;
  onChange: (c: Conversation) => void;
  keys: Keys;
  systemPrompt: string;
};

export default function ChatPanel({ conversation, onChange, keys, systemPrompt }: Props) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [extracting, setExtracting] = useState("");
  const [fallback, setFallback] = useState("");
  const [memoryToast, setMemoryToast] = useState("");
  const [prompts, setPrompts] = useState<Prompt[]>(BUILTIN);
  const [showLib, setShowLib] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const handsFree = useRef(false);
  const [handsFreeOn, setHandsFreeOn] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [planSteps, setPlanSteps] = useState<string[]>([]);
  const [doneSteps, setDoneSteps] = useState(0);
  const [speakingId, setSpeakingId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  const allModels = useModels();
  const model = useMemo(
    () => allModels.find((m) => m.id === conversation.modelId) ?? findModel(conversation.modelId),
    [allModels, conversation.modelId],
  );
  const messages = conversation.messages;

  /* ---------------- scrolling ---------------- */
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => setPrompts(loadPrompts()), []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  /* ---------------- attachments ---------------- */
  const readFiles = async (files: FileList | File[]) => {
    const out: Attachment[] = [];
    for (const f of Array.from(files).slice(0, 5)) {
      if (f.size > 8 * 1024 * 1024) continue;
      if (f.type.startsWith("image/")) {
        const dataUrl = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.readAsDataURL(f);
        });
        out.push({ id: uid(), name: f.name, mime: f.type, dataUrl });
      } else {
        setExtracting(f.name);
        const text = await extractAny(f).catch(() => "");
        out.push({
          id: uid(),
          name: f.name,
          mime: f.type || "text/plain",
          text: text.slice(0, 60000),
        });
        setExtracting("");
      }
    }
    setAttachments((a) => [...a, ...out].slice(0, 5));
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) readFiles(e.target.files);
    e.target.value = "";
  };

  /* ---------------- voice input ---------------- */
  const startListening = (autoSend = false) => {
    type SR = new () => {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      start: () => void;
      stop: () => void;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null;
    };
    const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      alert("Voice input is not supported in this browser. Try Chrome.");
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      finalText = txt;
      setInput(txt);
    };
    rec.onend = () => {
      setListening(false);
      if (autoSend && finalText.trim()) send(finalText);
    };
    rec.start();
    setListening(true);
  };

  const toggleMic = () => {
    if (listening) {
      setListening(false);
      return;
    }
    startListening(false);
  };

  const toggleHandsFree = () => {
    handsFree.current = !handsFree.current;
    setHandsFreeOn(handsFree.current);
    if (handsFree.current) startListening(true);
    else {
      stopSpeaking();
      setListening(false);
    }
  };

  /* ---------------- sending ---------------- */
  const buildApiMessages = (history: Message[]) =>
    history.map((m) => {
      const imgs = (m.attachments ?? []).filter((a) => a.dataUrl);
      const texts = (m.attachments ?? []).filter((a) => a.text);
      const textBlock =
        m.content +
        texts.map((t) => `\n\n--- file: ${t.name} ---\n${t.text}`).join("");

      if (imgs.length && model.vision) {
        return {
          role: m.role,
          content: [
            { type: "text", text: textBlock || "Describe this." },
            ...imgs.map((i) => ({ type: "image_url", image_url: { url: i.dataUrl } })),
          ],
        };
      }
      return { role: m.role, content: textBlock };
    });

  const send = async (overrideText?: string, regenerate = false) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !attachments.length && !regenerate) || busy) return;

    let history = messages;
    if (!regenerate) {
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: text,
        attachments: attachments.length ? attachments : undefined,
        createdAt: Date.now(),
      };
      history = [...messages, userMsg];
      setInput("");
      setAttachments([]);
    }

    const assistantId = uid();
    const baseTitle =
      conversation.title === "New chat" && (text || history[0]?.content)
        ? (text || history[0].content).slice(0, 44)
        : conversation.title;

    // Local mirror of the assistant message, flushed to the store on each tick.
    let visible = "";
    let runs: ToolRun[] = [];
    let plan: string[] = [];

    const flush = (content: string) => {
      onChange({
        ...conversation,
        title: baseTitle,
        updatedAt: Date.now(),
        messages: [
          ...history,
          {
            id: assistantId,
            role: "assistant",
            content,
            modelLabel: model.label,
            toolRuns: runs.length ? [...runs] : undefined,
            createdAt: Date.now(),
          },
        ],
      });
    };

    stickToBottom.current = true;
    setBusy(true);
    setFallback("");
    setPlanSteps([]);
    setDoneSteps(0);
    flush("");

    const controller = new AbortController();
    abortRef.current = controller;

    // Transcript sent to the model; grows as tools return results.
    const apiMessages = buildApiMessages(history);
    const agentMode = conversation.agent !== false;
    const system =
      (agentMode
        ? AGENT_PROMPT + (systemPrompt ? `\n\nUSER PREFERENCES\n${systemPrompt}` : "")
        : systemPrompt || PLAIN_PROMPT) +
      MEMORY_INSTRUCTION +
      memoryBlock() +
      (agentMode ? vfs.summary() : "");

    try {
      const MAX_STEPS = agentMode ? 12 : 1;

      for (let step = 0; step < MAX_STEPS; step++) {
        const stream = await streamChat({
          modelId: conversation.modelId,
          system,
          keys,
          messages: apiMessages,
          signal: controller.signal,
          turbo,
          onFallback: (from, to) => setFallback(`${from} busy → switched to ${to}`),
        });

        const reader = stream?.getReader();
        const dec = new TextDecoder();
        let turn = "";
        const prefix = visible;

        if (reader) {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            turn += dec.decode(value, { stream: true });
            // hide the raw tool block from the user while it streams
            visible =
              prefix +
              turn.replace(/```tool[\s\S]*$/, "").replace(/\[remember:[^\]]*\]?/gi, "");
            flush(visible);
          }
        }

        const parsed = agentMode ? parseToolCall(turn) : null;
        if (!parsed) {
          const { clean, facts } = extractMemoryMarkers(turn);
          facts.forEach(addMemory);
          if (facts.length) setMemoryToast(`Remembered: ${facts[0]}`);
          visible = (prefix + clean).trimEnd();
          flush(visible);
          break;
        }

        // surface the plan as a checklist the first time we see one
        const found = parsePlan(turn);
        if (found.length && !plan.length) {
          plan = found;
          setPlanSteps(found);
        }

        // register every call, then run them together
        const ids = parsed.calls.map(() => uid());
        runs = [
          ...runs,
          ...parsed.calls.map((c, i) => ({
            id: ids[i],
            tool: c.tool,
            args: c.args,
            status: "running" as const,
          })),
        ];
        visible = prefix + turn.replace(parsed.raw, "").trimEnd();
        flush(visible);

        const results = await Promise.all(
          parsed.calls.map((c) => executeTool(c.tool, c.args)),
        );

        results.forEach(({ text: result, imageUrl }, i) => {
          const failed = result.startsWith("Error:");
          runs = runs.map((r) =>
            r.id === ids[i]
              ? { ...r, status: failed ? ("error" as const) : ("done" as const), result, imageUrl }
              : r,
          );
          if (imageUrl) {
            visible += `\n\n![${parsed.calls[i].args.prompt ?? "image"}](${imageUrl})\n`;
          }
        });
        setDoneSteps((n) => n + 1);
        flush(visible);

        apiMessages.push({ role: "assistant", content: turn });
        apiMessages.push({
          role: "user",
          content:
            results
              .map((r, i) => `TOOL RESULT (${parsed.calls[i].tool}):\n${r.text}`)
              .join("\n\n") +
            "\n\nContinue. Fix any errors above yourself. When the work is done and verified, give the final answer with no tool block.",
        });

        if (step === MAX_STEPS - 1) {
          visible += "\n\n_(tool step limit reached — ask me to continue)_";
          flush(visible);
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        visible += "\n\n⚠️ Something went wrong. Please try again.";
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      flush(visible || "_(no response — try another model)_");

      if (handsFree.current && visible) {
        speak(visible, () => {
          if (handsFree.current) startListening(true);
        });
      }
    }
  };

  const stop = () => abortRef.current?.abort();

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const trimmed = messages.slice(0, messages.lastIndexOf(lastUser) + 1);
    onChange({ ...conversation, messages: trimmed });
    setTimeout(() => {
      const saved = trimmed;
      void saved;
      send(undefined, true);
    }, 30);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* model strip */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-4 py-2">
        <select
          value={conversation.modelId}
          onChange={(e) => onChange({ ...conversation, modelId: e.target.value })}
          className="max-w-[60%] truncate rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm outline-none"
        >
          {allModels.some((m) => m.local) && (
            <optgroup label="🖥️ On your PC — unlimited">
              {allModels
                .filter((m) => m.local)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
            </optgroup>
          )}
          <optgroup label="No API key needed">
            {allModels.filter((m) => !m.keyed && !m.local).map((m) => (
              <option key={m.id} value={m.id}>
                {speedIcon(m.speed)} {m.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Needs a free key (Settings)">
            {allModels.filter((m) => m.keyed).map((m) => (
              <option key={m.id} value={m.id}>
                {speedIcon(m.speed)} {m.label}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          onClick={() => setTurbo((t) => !t)}
          title="Turbo: always answer with the fastest model available"
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            turbo
              ? "border-transparent bg-amber-500 text-white"
              : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          ⚡ Turbo
        </button>
        <button
          onClick={() => onChange({ ...conversation, agent: conversation.agent === false })}
          title="Agent mode: lets the AI search the web, read pages, run code and make images"
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
            conversation.agent !== false
              ? "border-transparent bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white"
              : "border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          <IconBolt width={14} height={14} />
          Agent
        </button>
        <span className="hidden truncate text-xs text-[var(--muted)] lg:block">
          {turbo ? "Turbo on — fastest model wins, your pick is ignored" : model.hint}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowLib(true)}
            title="Prompt library"
            className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
          >
            <IconBook width={16} height={16} />
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => setShowExport(true)}
              title="Export chat"
              className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <IconDownload width={16} height={16} />
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => onChange({ ...conversation, messages: [], title: "New chat" })}
              title="Clear this chat"
              className="rounded-lg border border-[var(--line)] p-1.5 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <IconTrash />
            </button>
          )}
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-xl font-bold text-white">
              RV
            </div>
            <h2 className="text-2xl font-semibold">How can I help you today?</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Coding, explanations, writing, images, video trimming — Hindi ya English, jaise
              chaho.
            </p>
            <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.t}
                  onClick={() => setInput(s.s)}
                  className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 text-left transition hover:border-[var(--accent)]"
                >
                  <div className="text-sm font-medium">{s.t}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{s.s}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.map((m) => (
              <div key={m.id} className="fade-in mb-6 flex gap-3">
                <div
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${
                    m.role === "user"
                      ? "bg-[var(--panel-2)] text-[var(--muted)]"
                      : "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white"
                  }`}
                >
                  {m.role === "user" ? "You" : "RV"}
                </div>
                <div className="min-w-0 flex-1">
                  {m.role === "assistant" && m.modelLabel && (
                    <div className="mb-1 text-[11px] text-[var(--muted)]">{m.modelLabel}</div>
                  )}
                  {!!m.attachments?.length && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {m.attachments.map((a) =>
                        a.dataUrl ? (
                          <img
                            key={a.id}
                            src={a.dataUrl}
                            alt={a.name}
                            className="h-24 rounded-lg border border-[var(--line)] object-cover"
                          />
                        ) : (
                          <span
                            key={a.id}
                            className="rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1 text-xs text-[var(--muted)]"
                          >
                            📄 {a.name}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {!!m.toolRuns?.length && (
                    <div className="mb-1">
                      {m.toolRuns.map((r) => (
                        <ToolRunCard key={r.id} run={r} />
                      ))}
                    </div>
                  )}
                  {m.role === "user" ? (
                    <div className="whitespace-pre-wrap rounded-xl bg-[var(--panel)] px-3.5 py-2.5 text-[15px] leading-relaxed">
                      {m.content}
                    </div>
                  ) : m.content ? (
                    <Markdown>{m.content}</Markdown>
                  ) : m.toolRuns?.length ? null : (
                    <div className="flex gap-1.5 py-2">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="dot h-2 w-2 rounded-full bg-[var(--muted)]"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!busy && messages.at(-1)?.role === "assistant" && (
              <div className="mb-4 ml-11 flex gap-2">
                <button
                  onClick={regenerate}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                >
                  ↻ Regenerate
                </button>
                <button
                  onClick={() => {
                    const last = messages.at(-1)!;
                    navigator.clipboard?.writeText(last.content);
                  }}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                >
                  ⧉ Copy
                </button>
                {ttsAvailable() && (
                  <button
                    onClick={() => {
                      const last = messages.at(-1)!;
                      if (speakingId === last.id && isSpeaking()) {
                        stopSpeaking();
                        setSpeakingId("");
                      } else {
                        setSpeakingId(last.id);
                        speak(last.content, () => setSpeakingId(""));
                      }
                    }}
                    className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    {speakingId === messages.at(-1)!.id ? "■ Stop" : "🔊 Listen"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <WorkspaceCard />
          {busy && planSteps.length > 0 && (
            <div className="mb-2 rounded-xl border border-[var(--line)] bg-[var(--panel-2)] p-2.5">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-[var(--muted)]">
                <span className="dot h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                Plan — step {Math.min(doneSteps + 1, planSteps.length)} of {planSteps.length}
              </div>
              <ol className="space-y-0.5 text-xs">
                {planSteps.map((st, i) => (
                  <li
                    key={i}
                    className={
                      i < doneSteps
                        ? "text-emerald-400 line-through opacity-70"
                        : i === doneSteps
                          ? "text-[var(--text)]"
                          : "text-[var(--muted)]"
                    }
                  >
                    {i < doneSteps ? "✓" : i === doneSteps ? "▸" : "○"} {st}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {fallback && (
            <div className="mb-2 text-xs text-amber-400/90">↻ {fallback}</div>
          )}
          {memoryToast && (
            <div className="mb-2 flex items-center gap-2 text-xs text-[var(--muted)]">
              🧠 {memoryToast}
              <button onClick={() => setMemoryToast("")} className="underline">
                dismiss
              </button>
            </div>
          )}
          {extracting && (
            <div className="mb-2 text-xs text-[var(--muted)]">
              Reading {extracting}…
            </div>
          )}
          {!!attachments.length && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-2 py-1 text-xs"
                >
                  {a.dataUrl ? "🖼" : "📄"} {a.name.slice(0, 22)}
                  <button
                    onClick={() => setAttachments((x) => x.filter((y) => y.id !== a.id))}
                    className="text-[var(--muted)] hover:text-[var(--text)]"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
            }}
            className="flex items-end gap-1.5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-2 focus-within:border-[var(--accent)]"
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={onFileInput}
              accept={`image/*,${DOC_EXTENSIONS}`}
            />
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach image or file"
              className="rounded-lg p-2 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <IconClip />
            </button>
            <button
              onClick={toggleHandsFree}
              title="Hands-free conversation: speak, listen, repeat"
              className={`rounded-lg p-2 ${
                handsFreeOn ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              <IconWave />
            </button>
            <button
              onClick={toggleMic}
              title="Voice input"
              className={`rounded-lg p-2 hover:text-[var(--text)] ${
                listening ? "text-red-400" : "text-[var(--muted)]"
              }`}
            >
              <IconMic />
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.length) readFiles(files);
              }}
              rows={1}
              placeholder="Message RV AI…  (Shift+Enter for new line)"
              className="max-h-44 flex-1 resize-none bg-transparent py-2 text-[15px] outline-none placeholder:text-[var(--muted)]"
            />
            {busy ? (
              <button
                onClick={stop}
                title="Stop"
                className="rounded-xl bg-[var(--panel-2)] p-2.5 text-[var(--text)]"
              >
                <IconStop />
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim() && !attachments.length}
                title="Send"
                className="rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] p-2.5 text-white disabled:opacity-35"
              >
                <IconSend />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-[var(--muted)]">
            RV AI can make mistakes. Verify important information.
          </p>
        </div>
      </div>

      {showLib && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowLib(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <h3 className="text-lg font-semibold">📚 Prompt library</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Click one to load it into the composer.
            </p>
            <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {prompts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2"
                >
                  <button
                    onClick={() => {
                      setInput(p.body);
                      setShowLib(false);
                    }}
                    className="min-w-0 flex-1 text-left text-sm"
                  >
                    <div className="font-medium">{p.title}</div>
                    <div className="truncate text-xs text-[var(--muted)]">
                      {p.body.replace(/\n/g, " ").slice(0, 60)}
                    </div>
                  </button>
                  {!p.builtin && (
                    <button
                      onClick={() => setPrompts(deletePrompt(p.id))}
                      className="shrink-0 text-xs text-[var(--muted)] hover:text-red-400"
                    >
                      delete
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-between gap-2">
              <button
                onClick={() => {
                  if (!input.trim()) {
                    alert("Type something in the composer first, then save it.");
                    return;
                  }
                  const title = window.prompt("Name this prompt:");
                  if (title) setPrompts(savePrompt(title, input));
                }}
                className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)]"
              >
                + Save current input
              </button>
              <button
                onClick={() => setShowLib(false)}
                className="rounded-lg bg-[var(--panel-2)] px-4 py-2 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showExport && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-4"
          onClick={() => setShowExport(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
          >
            <h3 className="text-lg font-semibold">Export this chat</h3>
            <div className="mt-4 space-y-2">
              {[
                { label: "📝 Markdown (.md)", fn: () => exportMarkdown(conversation) },
                { label: "📄 PDF (via print)", fn: () => exportPdf(conversation) },
                { label: "🗂 JSON (backup)", fn: () => exportJson(conversation) },
              ].map((o) => (
                <button
                  key={o.label}
                  onClick={() => {
                    o.fn();
                    setShowExport(false);
                  }}
                  className="w-full rounded-lg border border-[var(--line)] bg-[var(--panel-2)] px-3 py-2.5 text-left text-sm hover:border-[var(--accent)]"
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowExport(false)}
              className="mt-4 w-full rounded-lg px-4 py-2 text-sm text-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
