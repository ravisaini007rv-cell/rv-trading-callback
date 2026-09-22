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
import {
  IconBolt,
  IconClip,
  IconMic,
  IconSend,
  IconStop,
  IconTrash,
} from "./Icons";
import { MODELS, findModel } from "@/lib/models";
import { streamChat } from "@/lib/stream";
import { AGENT_PROMPT, PLAIN_PROMPT, executeTool, parseToolCall } from "@/lib/tools";
import {
  uid,
  type Attachment,
  type Conversation,
  type Keys,
  type Message,
  type ToolRun,
} from "@/lib/types";

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
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);

  const model = useMemo(() => findModel(conversation.modelId), [conversation.modelId]);
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
        const text = await f.text().catch(() => "");
        out.push({
          id: uid(),
          name: f.name,
          mime: f.type || "text/plain",
          text: text.slice(0, 20000),
        });
      }
    }
    setAttachments((a) => [...a, ...out].slice(0, 5));
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) readFiles(e.target.files);
    e.target.value = "";
  };

  /* ---------------- voice input ---------------- */
  const toggleMic = () => {
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
    if (listening) {
      setListening(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let txt = "";
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      setInput(txt);
    };
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
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
    flush("");

    const controller = new AbortController();
    abortRef.current = controller;

    // Transcript sent to the model; grows as tools return results.
    const apiMessages = buildApiMessages(history);
    const agentMode = conversation.agent !== false;
    const system = agentMode
      ? AGENT_PROMPT + (systemPrompt ? `\n\nUSER PREFERENCES\n${systemPrompt}` : "")
      : systemPrompt || PLAIN_PROMPT;

    try {
      const MAX_STEPS = agentMode ? 6 : 1;

      for (let step = 0; step < MAX_STEPS; step++) {
        const stream = await streamChat({
          modelId: conversation.modelId,
          system,
          keys,
          messages: apiMessages,
          signal: controller.signal,
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
            visible = prefix + turn.replace(/```tool[\s\S]*$/, "");
            flush(visible);
          }
        }

        const call = agentMode ? parseToolCall(turn) : null;
        if (!call) {
          visible = prefix + turn;
          flush(visible);
          break;
        }

        // record + run the tool
        const runId = uid();
        runs = [...runs, { id: runId, tool: call.tool, args: call.args, status: "running" }];
        visible = prefix + turn.replace(call.raw, "").trimEnd();
        flush(visible);

        const { text: result, imageUrl } = await executeTool(call.tool, call.args);
        const failed = result.startsWith("Error:");
        runs = runs.map((r) =>
          r.id === runId
            ? { ...r, status: failed ? "error" : "done", result, imageUrl }
            : r,
        );
        if (imageUrl) visible += `\n\n![${call.args.prompt ?? "image"}](${imageUrl})\n`;
        flush(visible);

        apiMessages.push({ role: "assistant", content: turn });
        apiMessages.push({
          role: "user",
          content: `TOOL RESULT (${call.tool}):\n${result}\n\nContinue. If you have enough information, give the final answer now with no tool block.`,
        });

        if (step === MAX_STEPS - 1) {
          visible += "\n\n_(tool step limit reached)_";
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
          <optgroup label="No API key needed">
            {MODELS.filter((m) => !m.keyed).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Needs a free key (Settings)">
            {MODELS.filter((m) => m.keyed).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        </select>
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
        <span className="hidden truncate text-xs text-[var(--muted)] lg:block">{model.hint}</span>
        <div className="ml-auto flex items-center gap-1">
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
              <div className="mb-4 ml-11">
                <button
                  onClick={regenerate}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)] hover:text-[var(--text)]"
                >
                  ↻ Regenerate
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--bg)] px-4 py-3">
        <div className="mx-auto max-w-3xl">
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
              accept="image/*,.txt,.md,.json,.js,.ts,.tsx,.py,.css,.html,.csv"
            />
            <button
              onClick={() => fileRef.current?.click()}
              title="Attach image or file"
              className="rounded-lg p-2 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <IconClip />
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
    </div>
  );
}
