/**
 * Talks to free model providers using the OpenAI chat-completions dialect,
 * falling back down a chain when one is rate-limited.
 */

export const PROVIDERS = {
  groq: {
    label: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    envKey: "GROQ_API_KEY",
    model: "llama-3.3-70b-versatile",
    speed: 280,
  },
  gemini: {
    label: "Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    envKey: "GEMINI_API_KEY",
    model: "gemini-2.0-flash",
    speed: 120,
  },
  openrouter: {
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    envKey: "OPENROUTER_API_KEY",
    model: "qwen/qwen3-coder:free",
    speed: 45,
  },
  ollama: {
    label: "Ollama (local)",
    url: (cfg) => `${cfg.ollamaUrl || "http://localhost:11434"}/v1/chat/completions`,
    envKey: null,
    model: "qwen2.5-coder:7b",
    speed: 20,
  },
  pollinations: {
    label: "Pollinations",
    url: "https://text.pollinations.ai/openai",
    envKey: null,
    model: "openai-fast",
    speed: 60,
  },
};

/** Which providers can actually be used right now, fastest first. */
export function availableProviders(cfg) {
  return Object.entries(PROVIDERS)
    .filter(([id, p]) => {
      if (id === "ollama") return !!cfg.useOllama;
      if (!p.envKey) return true;
      return !!(cfg[id] || process.env[p.envKey]);
    })
    .sort((a, b) => b[1].speed - a[1].speed)
    .map(([id]) => id);
}

function keyFor(id, cfg) {
  const p = PROVIDERS[id];
  if (!p.envKey) return null;
  return cfg[id] || process.env[p.envKey] || null;
}

async function callOne(id, cfg, messages, signal) {
  const p = PROVIDERS[id];
  const url = typeof p.url === "function" ? p.url(cfg) : p.url;
  const key = keyFor(id, cfg);
  const model = cfg.models?.[id] || p.model;

  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(id === "openrouter" ? { "X-Title": "RV Agent" } : {}),
    },
    body: JSON.stringify({ model, messages, stream: false, temperature: 0.3 }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`${p.label} ${res.status}${detail ? ": " + detail : ""}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error(`${p.label} returned nothing`);
  return { text, provider: p.label, model };
}

/** Try each usable provider in turn; report which one answered. */
export async function askModel(cfg, messages, { onFallback } = {}) {
  const chain = availableProviders(cfg);
  if (!chain.length) throw new Error("No providers configured. Run: rv setup");

  let lastErr;
  for (let i = 0; i < chain.length; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      try {
        const out = await callOne(chain[i], cfg, messages, ctrl.signal);
        if (i > 0) onFallback?.(PROVIDERS[chain[i]].label);
        return out;
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`All providers failed. Last error: ${lastErr?.message}`);
}
