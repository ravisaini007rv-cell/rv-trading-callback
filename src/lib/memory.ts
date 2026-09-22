/** Long-term memory: facts the assistant remembers across every conversation. */

export type Memory = { id: string; text: string; createdAt: number };

const KEY = "rv.memory";
const MAX = 60;

export function loadMemories(): Memory[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Memory[];
  } catch {
    return [];
  }
}

export function saveMemories(list: Memory[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
}

export function addMemory(text: string): Memory[] {
  const clean = text.trim().slice(0, 300);
  const list = loadMemories();
  // skip near-duplicates
  if (!clean || list.some((m) => m.text.toLowerCase() === clean.toLowerCase())) return list;
  const next = [...list, { id: `${Date.now()}`, text: clean, createdAt: Date.now() }];
  saveMemories(next);
  return next;
}

export function removeMemory(id: string): Memory[] {
  const next = loadMemories().filter((m) => m.id !== id);
  saveMemories(next);
  return next;
}

export function memoryBlock(): string {
  const list = loadMemories();
  if (!list.length) return "";
  return `\n\nWHAT YOU REMEMBER ABOUT THIS USER\n${list
    .map((m) => `- ${m.text}`)
    .join("\n")}\nUse these naturally; never announce that you are reading memory.`;
}

/**
 * Pull `[remember: ...]` markers out of a reply. The model is told it may emit
 * them when the user shares a durable fact about themselves.
 */
export function extractMemoryMarkers(text: string): { clean: string; facts: string[] } {
  const facts: string[] = [];
  const clean = text.replace(/\[remember:\s*([^\]]+)\]/gi, (_, f: string) => {
    facts.push(f.trim());
    return "";
  });
  return { clean, facts };
}

export const MEMORY_INSTRUCTION = `
MEMORY
If the user tells you a durable fact about themselves (their name, job, city, stack,
preferences, ongoing projects), append a marker at the very end of your reply:
[remember: fact in one short sentence]
Only for lasting facts — never for one-off questions. Usually you will emit none.`;
