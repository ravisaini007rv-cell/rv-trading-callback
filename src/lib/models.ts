export type ProviderId = "pollinations" | "groq" | "openrouter" | "gemini" | "ollama";

export type ModelDef = {
  id: string;
  label: string;
  provider: ProviderId;
  model: string;
  /** Short description shown in the picker */
  hint: string;
  /** Needs a user supplied API key */
  keyed: boolean;
  vision?: boolean;
  tag?: "fast" | "smart" | "code" | "vision" | "local";
  /** Runs on the user's own machine — unlimited, private, offline. */
  local?: boolean;
  /** Rough tokens/sec ranking used to pick the fastest option first. */
  speed?: number;
};

/**
 * Free-first model catalog.
 *
 * `keyed: false` models work with zero configuration (no API key at all).
 * `keyed: true` models light up once the user pastes a free API key in Settings.
 */
export const MODELS: ModelDef[] = [
  // ---- zero-key, works out of the box -------------------------------------
  {
    id: "rv-fast",
    label: "RV Fast",
    provider: "pollinations",
    model: "openai-fast",
    hint: "No key needed · quick everyday answers",
    keyed: false,
    tag: "fast",
    speed: 60,
  },
  {
    id: "rv-smart",
    label: "RV Smart",
    provider: "pollinations",
    model: "openai",
    hint: "No key needed · better reasoning, reads images",
    keyed: false,
    vision: true,
    tag: "smart",
    speed: 35,
  },
  {
    id: "rv-reason",
    label: "RV Reasoning",
    provider: "pollinations",
    model: "openai-reasoning",
    hint: "No key needed · slow, thinks step by step",
    keyed: false,
    tag: "smart",
    speed: 12,
  },
  {
    id: "rv-coder",
    label: "RV Coder",
    provider: "pollinations",
    model: "qwen-coder",
    hint: "No key needed · tuned for writing code",
    keyed: false,
    tag: "code",
    speed: 40,
  },

  // ---- free tiers that need a free key ------------------------------------
  {
    id: "groq-llama-70b",
    label: "Llama 3.3 70B",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    hint: "Groq free key · fastest of all (~280 tok/s)",
    keyed: true,
    tag: "fast",
    speed: 280,
  },
  {
    id: "groq-kimi",
    label: "Kimi K2",
    provider: "groq",
    model: "moonshotai/kimi-k2-instruct",
    hint: "Groq free key · strong at code & tools",
    keyed: true,
    tag: "code",
    speed: 200,
  },
  {
    id: "gemini-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    model: "gemini-2.0-flash",
    hint: "Google free key · huge context, sees images",
    keyed: true,
    vision: true,
    tag: "vision",
    speed: 120,
  },
  {
    id: "or-deepseek",
    label: "DeepSeek R1",
    provider: "openrouter",
    model: "deepseek/deepseek-r1:free",
    hint: "OpenRouter free key · deep reasoning",
    keyed: true,
    tag: "smart",
    speed: 25,
  },
  {
    id: "or-qwen",
    label: "Qwen3 Coder",
    provider: "openrouter",
    model: "qwen/qwen3-coder:free",
    hint: "OpenRouter free key · long code files",
    keyed: true,
    tag: "code",
    speed: 45,
  },
];

export const DEFAULT_MODEL_ID = "rv-smart";

export function findModel(id: string): ModelDef {
  const hit = MODELS.find((m) => m.id === id);
  if (hit) return hit;

  // Local Ollama models are discovered at runtime: "ollama:llama3.1:8b"
  if (id.startsWith("ollama:")) {
    const tag = id.slice("ollama:".length);
    return {
      id,
      label: `${tag} (local)`,
      provider: "ollama",
      model: tag,
      hint: "Runs on your PC · unlimited, private, offline",
      keyed: false,
      local: true,
      tag: "local",
      vision: /llava|vision|moondream/i.test(tag),
    };
  }

  return MODELS[0];
}

export const KEY_FIELDS: { provider: ProviderId; label: string; url: string }[] = [
  { provider: "groq", label: "Groq ⚡ fastest — start here", url: "https://console.groq.com/keys" },
  { provider: "gemini", label: "Google Gemini", url: "https://aistudio.google.com/apikey" },
  { provider: "openrouter", label: "OpenRouter", url: "https://openrouter.ai/keys" },
];
