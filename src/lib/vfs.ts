/**
 * A tiny virtual filesystem the agent can actually operate on, persisted in
 * localStorage. This is what turns "chatbot that writes code" into "agent that
 * builds a project": it can list, read, write and patch files across turns,
 * exactly like a coding agent working in a repo.
 */

export type VFile = { path: string; content: string; updatedAt: number };

const KEY = "rv.vfs";

function read(): VFile[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as VFile[];
  } catch {
    return [];
  }
}

function write(files: VFile[]) {
  localStorage.setItem(KEY, JSON.stringify(files.slice(0, 200)));
  window.dispatchEvent(new CustomEvent("rv-vfs-change"));
}

const norm = (p: string) => p.trim().replace(/^\.?\//, "");

export const vfs = {
  list(): VFile[] {
    return read().sort((a, b) => a.path.localeCompare(b.path));
  },

  read(path: string): string | null {
    return read().find((f) => f.path === norm(path))?.content ?? null;
  },

  write(path: string, content: string): VFile {
    const p = norm(path);
    const files = read();
    const i = files.findIndex((f) => f.path === p);
    const file = { path: p, content, updatedAt: Date.now() };
    if (i >= 0) files[i] = file;
    else files.push(file);
    write(files);
    return file;
  },

  /** Replace the first occurrence of `find` with `replace`. */
  edit(path: string, find: string, replace: string): { ok: boolean; message: string } {
    const p = norm(path);
    const current = vfs.read(p);
    if (current === null) return { ok: false, message: `no such file: ${p}` };
    if (!current.includes(find))
      return { ok: false, message: `text not found in ${p}. Read the file first.` };
    vfs.write(p, current.replace(find, replace));
    return { ok: true, message: `edited ${p}` };
  },

  delete(path: string): boolean {
    const p = norm(path);
    const files = read();
    const next = files.filter((f) => f.path !== p);
    if (next.length === files.length) return false;
    write(next);
    return true;
  },

  clear() {
    write([]);
  },

  /** Compact overview injected into the agent's prompt each turn. */
  summary(): string {
    const files = vfs.list();
    if (!files.length) return "";
    return `\n\nFILES IN YOUR WORKSPACE\n${files
      .map((f) => `- ${f.path} (${f.content.split("\n").length} lines)`)
      .join("\n")}\nUse read_file before editing any of these.`;
  },
};

/** Search for a string across all files — like grep. */
export function grepFiles(needle: string): string {
  const hits: string[] = [];
  for (const f of vfs.list()) {
    const lines = f.content.split("\n");
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(needle.toLowerCase())) {
        hits.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 160)}`);
      }
    });
  }
  return hits.length ? hits.slice(0, 60).join("\n") : `no matches for "${needle}"`;
}
