export type Prompt = { id: string; title: string; body: string; builtin?: boolean };

const KEY = "rv.prompts";

export const BUILTIN: Prompt[] = [
  {
    id: "b1",
    title: "🐞 Debug this error",
    body: "Yeh error aa raha hai. Root cause batao, fix do, aur samjhao kyun hua:\n\n",
    builtin: true,
  },
  {
    id: "b2",
    title: "👀 Code review",
    body: "Review this code like a senior engineer — bugs, security, edge cases, performance. Then give the corrected version:\n\n```\n\n```",
    builtin: true,
  },
  {
    id: "b3",
    title: "📖 Explain simply",
    body: "Explain this to me in simple Hinglish, with a real-world analogy and a small example:\n\n",
    builtin: true,
  },
  {
    id: "b4",
    title: "⚡ Optimise",
    body: "Make this faster and cleaner without changing behaviour. Show before/after complexity:\n\n```\n\n```",
    builtin: true,
  },
  {
    id: "b5",
    title: "🔄 Convert language",
    body: "Convert this code to [TARGET LANGUAGE], keeping it idiomatic:\n\n```\n\n```",
    builtin: true,
  },
  {
    id: "b6",
    title: "🧩 Plan a feature",
    body: "Main ye feature banana chahta hoon: [FEATURE].\nStep-by-step plan do — data model, API, UI, edge cases, aur kis order mein banau.",
    builtin: true,
  },
  {
    id: "b7",
    title: "📊 Diagram it",
    body: "Draw a mermaid flowchart explaining this system. Use a ```mermaid code block:\n\n",
    builtin: true,
  },
  {
    id: "b8",
    title: "🔍 Research (agent)",
    body: "Search the web and give me an up-to-date summary with sources on:\n\n",
    builtin: true,
  },
];

export function loadPrompts(): Prompt[] {
  if (typeof window === "undefined") return BUILTIN;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Prompt[];
    return [...BUILTIN, ...saved];
  } catch {
    return BUILTIN;
  }
}

export function savePrompt(title: string, body: string): Prompt[] {
  const saved = loadPrompts().filter((p) => !p.builtin);
  const next = [...saved, { id: `${Date.now()}`, title: title.slice(0, 40), body }];
  localStorage.setItem(KEY, JSON.stringify(next));
  return [...BUILTIN, ...next];
}

export function deletePrompt(id: string): Prompt[] {
  const saved = loadPrompts().filter((p) => !p.builtin && p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(saved));
  return [...BUILTIN, ...saved];
}
