"use client";

import { useEffect, useMemo, useState } from "react";
import ChatPanel from "./ChatPanel";
import ImagePanel from "./ImagePanel";
import VideoPanel from "./VideoPanel";
import SettingsPanel from "./SettingsPanel";
import ComparePanel from "./ComparePanel";
import {
  IconChat,
  IconCompare,
  IconImage,
  IconMenu,
  IconMoon,
  IconPlus,
  IconSettings,
  IconSun,
  IconTrash,
  IconVideo,
} from "./Icons";
import { DEFAULT_MODEL_ID } from "@/lib/models";
import { uid, type Conversation, type Keys } from "@/lib/types";

type Tab = "chat" | "compare" | "image" | "video" | "settings";

const LS = {
  convos: "rv.convos",
  active: "rv.active",
  keys: "rv.keys",
  system: "rv.system",
  theme: "rv.theme",
};

const newConvo = (): Conversation => ({
  id: uid(),
  title: "New chat",
  messages: [],
  modelId: DEFAULT_MODEL_ID,
  updatedAt: Date.now(),
});

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function AppShell() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [sidebar, setSidebar] = useState(false);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [keys, setKeys] = useState<Keys>({});
  const [systemPrompt, setSystemPrompt] = useState("");
  const [dark, setDark] = useState(true);

  /* ---------- hydrate ---------- */
  useEffect(() => {
    const c = load<Conversation[]>(LS.convos, []);
    const list = c.length ? c : [newConvo()];
    setConvos(list);
    const stored = load<string>(LS.active, "");
    setActiveId(list.some((x) => x.id === stored) ? stored : list[0].id);
    setKeys(load<Keys>(LS.keys, {}));
    setSystemPrompt(load<string>(LS.system, ""));
    const theme = load<string>(LS.theme, "dark");
    setDark(theme !== "light");
    setReady(true);
  }, []);

  /* ---------- persist ---------- */
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(LS.convos, JSON.stringify(convos.slice(0, 60)));
  }, [convos, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(LS.active, JSON.stringify(activeId));
  }, [activeId, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(LS.keys, JSON.stringify(keys));
  }, [keys, ready]);
  useEffect(() => {
    if (ready) localStorage.setItem(LS.system, JSON.stringify(systemPrompt));
  }, [systemPrompt, ready]);
  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
    if (ready) localStorage.setItem(LS.theme, JSON.stringify(dark ? "dark" : "light"));
  }, [dark, ready]);

  const active = useMemo(
    () => convos.find((c) => c.id === activeId) ?? convos[0],
    [convos, activeId],
  );

  const updateConvo = (c: Conversation) =>
    setConvos((list) => list.map((x) => (x.id === c.id ? c : x)));

  const addConvo = () => {
    const c = newConvo();
    setConvos((l) => [c, ...l]);
    setActiveId(c.id);
    setTab("chat");
    setSidebar(false);
  };

  const removeConvo = (id: string) => {
    setConvos((l) => {
      const next = l.filter((c) => c.id !== id);
      const list = next.length ? next : [newConvo()];
      if (id === activeId) setActiveId(list[0].id);
      return list;
    });
  };

  if (!ready || !active) {
    return (
      <div className="grid h-full place-items-center text-sm text-[var(--muted)]">Loading…</div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "chat", label: "Chat", icon: <IconChat /> },
    { id: "compare", label: "Compare", icon: <IconCompare /> },
    { id: "image", label: "Image", icon: <IconImage /> },
    { id: "video", label: "Video", icon: <IconVideo /> },
    { id: "settings", label: "Settings", icon: <IconSettings /> },
  ];

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* backdrop for mobile */}
      {sidebar && (
        <div
          onClick={() => setSidebar(false)}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      {/* sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] transition-transform md:static md:translate-x-0 ${
          sidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-2 p-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-sm font-bold text-white">
            RV
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">RV AI Studio</div>
            <div className="text-[11px] text-[var(--muted)]">chat · image · video</div>
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            title="Toggle theme"
            className="ml-auto rounded-lg p-2 text-[var(--muted)] hover:text-[var(--text)]"
          >
            {dark ? <IconSun /> : <IconMoon />}
          </button>
        </div>

        <div className="px-3">
          <button
            onClick={addConvo}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] py-2.5 text-sm font-medium text-white"
          >
            <IconPlus width={16} height={16} /> New chat
          </button>
        </div>

        <nav className="mt-3 flex gap-1 px-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setSidebar(false);
              }}
              title={t.label}
              className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition ${
                tab === t.id
                  ? "bg-[var(--panel-2)] text-[var(--text)]"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <div className="px-2 pb-1 text-[11px] uppercase tracking-wide text-[var(--muted)]">
            History
          </div>
          {convos.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-1 rounded-lg px-2 ${
                c.id === activeId ? "bg-[var(--panel-2)]" : "hover:bg-[var(--panel-2)]/60"
              }`}
            >
              <button
                onClick={() => {
                  setActiveId(c.id);
                  setTab("chat");
                  setSidebar(false);
                }}
                className="flex-1 truncate py-2 text-left text-sm"
              >
                {c.title}
              </button>
              <button
                onClick={() => removeConvo(c.id)}
                title="Delete"
                className="p-1 text-[var(--muted)] opacity-0 transition group-hover:opacity-100 hover:text-red-400"
              >
                <IconTrash width={14} height={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* main */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 py-2 md:hidden">
          <button
            onClick={() => setSidebar(true)}
            className="rounded-lg p-2 text-[var(--muted)]"
          >
            <IconMenu />
          </button>
          <span className="text-sm font-semibold">RV AI Studio</span>
        </header>

        <div className="min-h-0 flex-1">
          {tab === "chat" && (
            <ChatPanel
              key={active.id}
              conversation={active}
              onChange={updateConvo}
              keys={keys}
              systemPrompt={systemPrompt}
            />
          )}
          {tab === "compare" && <ComparePanel keys={keys} systemPrompt={systemPrompt} />}
          {tab === "image" && <ImagePanel />}
          {tab === "video" && <VideoPanel />}
          {tab === "settings" && (
            <SettingsPanel
              keys={keys}
              setKeys={setKeys}
              systemPrompt={systemPrompt}
              setSystemPrompt={setSystemPrompt}
            />
          )}
        </div>
      </main>
    </div>
  );
}
