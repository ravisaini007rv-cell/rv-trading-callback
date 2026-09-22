import type { ModelDef } from "./models";

/**
 * Ollama runs a local server on the user's own machine (default
 * http://localhost:11434) and exposes an OpenAI-compatible endpoint at
 * /v1/chat/completions. Because it lives on *their* computer, the browser talks
 * to it directly — requests never touch our server, there is no API key, no
 * quota, and it keeps working offline.
 */

export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
const URL_KEY = "rv.ollamaUrl";

export function getOllamaUrl(): string {
  if (typeof window === "undefined") return DEFAULT_OLLAMA_URL;
  try {
    return (
      (JSON.parse(localStorage.getItem(URL_KEY) ?? '""') as string) || DEFAULT_OLLAMA_URL
    );
  } catch {
    return DEFAULT_OLLAMA_URL;
  }
}

export function setOllamaUrl(url: string) {
  localStorage.setItem(URL_KEY, JSON.stringify(url.replace(/\/+$/, "")));
}

/** Models we suggest, sized by how much RAM the user has. */
export const RECOMMENDED = [
  {
    tag: "llama3.2:3b",
    label: "Llama 3.2 3B",
    size: "2 GB",
    ram: "8 GB RAM",
    note: "Lightest — fine for chat and quick questions.",
  },
  {
    tag: "llama3.1:8b",
    label: "Llama 3.1 8B",
    size: "4.7 GB",
    ram: "16 GB RAM",
    note: "Best all-rounder. Start here if unsure.",
  },
  {
    tag: "qwen2.5-coder:7b",
    label: "Qwen2.5 Coder 7B",
    size: "4.7 GB",
    ram: "16 GB RAM",
    note: "Specialised for writing and fixing code.",
  },
  {
    tag: "qwen2.5-coder:14b",
    label: "Qwen2.5 Coder 14B",
    size: "9 GB",
    ram: "16 GB + GPU",
    note: "Noticeably smarter at code. Needs a decent GPU.",
  },
  {
    tag: "gemma2:27b",
    label: "Gemma 2 27B",
    size: "16 GB",
    ram: "32 GB + GPU",
    note: "Closest to cloud quality, if your machine can take it.",
  },
  {
    tag: "llava:7b",
    label: "LLaVA 7B (vision)",
    size: "4.7 GB",
    ram: "16 GB RAM",
    note: "Can look at images you attach.",
  },
];

export type OllamaStatus =
  | { state: "checking" }
  | { state: "offline"; reason: string }
  | { state: "online"; models: string[] };

/** Ask the local Ollama server which models are installed. */
export async function probeOllama(url = getOllamaUrl()): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return { state: "offline", reason: `server returned ${res.status}` };
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = (data.models ?? []).map((m) => m.name);
    return { state: "online", models };
  } catch (e) {
    const msg = (e as Error).message || "";
    return {
      state: "offline",
      reason: /abort|timeout/i.test(msg)
        ? "no response — is Ollama running?"
        : "cannot reach the server (CORS or not installed)",
    };
  }
}

/** Turn installed Ollama tags into entries for the model picker. */
export function ollamaModelDefs(installed: string[]): ModelDef[] {
  return installed.map((tag) => ({
    id: `ollama:${tag}`,
    label: `${tag} (local)`,
    provider: "ollama" as const,
    model: tag,
    hint: "Runs on your PC · unlimited, private, offline",
    keyed: false,
    local: true,
    tag: "local" as const,
    vision: /llava|vision|moondream|llama3.2-vision/i.test(tag),
  }));
}

export const OLLAMA_SETUP = `# Unlimited local AI with Ollama

Ollama runs an AI model **on your own computer**. No API key, no daily limit, no internet
needed, and nothing you type ever leaves your machine.

## 1. Install

- **Windows / macOS** — download the installer from [ollama.com/download](https://ollama.com/download)
- **Linux** — \`curl -fsSL https://ollama.com/install.sh | sh\`

## 2. Download a model

Open a terminal and run one of these:

\`\`\`bash
ollama pull llama3.1:8b        # best all-rounder (needs ~16 GB RAM)
ollama pull llama3.2:3b        # lighter, works on 8 GB RAM
ollama pull qwen2.5-coder:7b   # specialised for coding
\`\`\`

## 3. Allow this app to talk to it

Ollama blocks requests from other websites by default. Let this app in:

**macOS**
\`\`\`bash
launchctl setenv OLLAMA_ORIGINS "*"
# then quit and reopen Ollama from the menu bar
\`\`\`

**Windows** — open *Environment Variables* and add a user variable
\`OLLAMA_ORIGINS\` = \`*\`, then restart Ollama.

**Linux**
\`\`\`bash
systemctl edit --user ollama
# add these two lines:
#   [Service]
#   Environment="OLLAMA_ORIGINS=*"
systemctl --user restart ollama
\`\`\`

> Using \`*\` is fine for local use. To be stricter, put your app's exact URL instead.

## 4. Done

Come back to **Settings → Local AI** and hit *Check again*. Your installed models appear in
every model dropdown with a **(local)** label.

## Tips

- First reply is slow (the model loads into memory); after that it's much faster.
- A GPU helps a lot but is not required.
- \`ollama list\` shows what you have, \`ollama rm <model>\` frees the disk space.
`;
