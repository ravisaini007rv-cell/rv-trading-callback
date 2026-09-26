# RV AI Studio

A free, ChatGPT-style AI assistant you own — chat & coding help, image generation, and
in-browser video editing. Built with Next.js 16 + Tailwind 4.

**It works with zero configuration.** The default models need no API key at all.

## Two halves

| | Runs in | Can it touch your computer? |
|---|---|---|
| **Web app** (this folder) | Browser | No — sandboxed. Chat, build, images, video, data. |
| **[RV Agent](agent/)** (`agent/`) | Your terminal | **Yes** — real shell, real files. It installs, builds, runs and fixes code by itself. |

Use the web app for thinking and creating; use the agent when you want the work actually
done on your machine. → **[agent/README.md](agent/README.md)**

## Free capacity — the honest version

Nothing here costs money, but "free" is not "infinite". The app is built around that:
**if one provider is rate-limited it silently retries the next one**, so you rarely see a
failure.

| Source | Real free limit |
|---|---|
| Pollinations (default, no key) | Unmetered, ~1 req / 5 s, slower when busy |
| Groq | ~14,400 req/day, 30/min |
| Google Gemini | 1,500 req/day (Flash) |
| OpenRouter `:free` models | ~50/day (1,000 with a one-time $10 credit) |
| Image generation | Unmetered (fair use) |
| **Video editing, tests, TTS, PDF** | **Genuinely unlimited — runs on your device** |
| APK builds (GitHub Actions) | Unlimited on public repos |

| **Ollama (local models)** | **Truly unlimited** — your own PC, offline, private |

The live version of this table is in **Settings**.

### Unlimited mode: Ollama

Install [Ollama](https://ollama.com/download), run `ollama pull llama3.1:8b`, then set
`OLLAMA_ORIGINS=*` so the browser may connect. Open **Settings → Local AI** and press
*Check again* — your installed models appear in every dropdown marked **(local)**, with no
quota, no key, and no internet required. They also act as a backup when the cloud tiers are
rate-limited. Full instructions are built into the app.

## Want it fast?

1. **Add the free Groq key** (Settings → ~1 minute, no card). It is by far the fastest
   provider — roughly 280 tokens/sec, about 10× a local model on a laptop without a GPU.
2. **Turn on ⚡ Turbo** in the chat toolbar — it ignores your model choice and always routes
   to the fastest model you can currently use.
3. Models are labelled in the dropdown: ⚡⚡⚡ blazing, ⚡⚡ quick, ⚡ ok, 🐢 slow but thorough.
4. The fallback chain is sorted by speed, and a provider that stalls for more than a few
   seconds is dropped automatically — you never sit waiting on a dead tier.

> Ollama (local models) is **optional and can be skipped**. It is only fast on Apple Silicon
> or a dedicated NVIDIA GPU; on an Intel Mac, Groq will be much quicker.

## Features

- **Memory** — remembers durable facts about you across every chat; view and forget them
  in Settings.
- **Auto-fallback** — rate-limited provider? It switches models mid-request and tells you.
- **Data Analyst** — upload a CSV and ask questions; get tables and charts back.
- **Diagrams** — mermaid flowcharts, pie and xy charts render inline in any reply.
- **Hands-free voice** — speak, it answers aloud, then listens again.
- **Prompt library** — 8 built-in prompts plus your own saved ones.
- **Export** — any chat to Markdown, PDF or JSON.
- **Installable PWA** — add to your home screen, UI works offline.
- **Agent mode** — a real agent harness, not just a chatbot with a search button:
  - **9 tools**: `web_search`, `fetch_url`, `run_js`, `write_file`, `read_file`,
    `edit_file`, `list_files`, `grep`, `generate_image`
  - **Plans first** — multi-step tasks open with a plan, shown live as a ticking checklist
  - **Parallel tool calls** — independent calls run concurrently (~3× faster)
  - **A real workspace** — files persist across turns, so it can write code, read it back,
    patch it and grep it like an engineer working in a repo
  - **Self-verification** — it is required to run the code it writes and fix its own errors
    rather than handing them to you
  - Up to 12 tool steps per answer, every step visible in collapsible cards
- **Compare mode** — send one prompt to 2–4 models at once and see the answers side by side
  with response times.
- **Build mode** — describe a website and the agent writes real `index.html` / `style.css` /
  `app.js`, shows a live sandboxed preview, catches runtime errors and offers one-click
  auto-fix. Edit files by hand, download as ZIP.
- **APK export** — turn any built site into a Capacitor Android project with a GitHub
  Actions workflow that produces a real installable APK on free runners. No Android Studio.
- **Test & QA Lab** — paste JavaScript; the AI writes a test suite, actually **executes** it
  in a sandboxed worker with a built-in `test`/`expect` harness, shows pass/fail per case
  with timings, and reviews your code for bugs.
- **Documents** — attach PDF, DOCX or code files; text is extracted in-browser and fed to
  the model.
- **Listen** — any reply can be read aloud (Hindi or English voice, picked automatically).
- **Chat** — streaming replies, markdown, syntax-highlighted code blocks with copy buttons,
  regenerate, multi-chat history (saved in your browser)
- **9 models in one dropdown** — 4 that need no key, plus Llama 3.3 70B, Kimi K2, Gemini 2.0
  Flash, DeepSeek R1 and Qwen3 Coder once you paste a free key
- **Vision + files** — attach or paste images, drop in code/text files and ask about them
- **Voice input** — dictate with the browser's speech recognition
- **Image Studio** — free text-to-image (Flux / Turbo / Kontext), style and aspect-ratio
  presets, batch generation, one-click download
- **Video Studio** — trim, GIF, mute, extract MP3, compress, crop to 9:16. Runs on FFmpeg
  WebAssembly entirely on your device; nothing is uploaded
- **Custom instructions**, dark/light theme, fully responsive

## Tools the agent can use

| Tool | What it does | Runs on |
|---|---|---|
| `web_search` | Live DuckDuckGo search, no key needed | server |
| `fetch_url` | Reads the text of any page or JSON API | server |
| `run_js` | Executes JavaScript in a sandboxed Web Worker (5s timeout) | your browser |
| `generate_image` | Makes an image and drops it into the reply | your browser |

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Optional free API keys

Everything works without keys. To unlock the faster/smarter models, open **Settings** in the
app and paste any of these (all have free tiers):

| Provider | Get a key |
|---|---|
| Groq | https://console.groq.com/keys |
| Google Gemini | https://aistudio.google.com/apikey |
| OpenRouter | https://openrouter.ai/keys |

Keys entered in Settings are stored **only in your browser's localStorage**.

For a shared deployment, set them as server environment variables instead so users don't need
their own:

```
GROQ_API_KEY=...
GEMINI_API_KEY=...
OPENROUTER_API_KEY=...
```

## Deploy

Push to GitHub and import the repo on [Vercel](https://vercel.com) — the free Hobby tier is
enough. Add the env vars above only if you want to supply the keys yourself.

## How requests flow

- Keyless models are called directly from the browser, so the app keeps working even on
  static hosting.
- Keyed providers go through `/api/chat`, which normalises every provider to the OpenAI
  chat-completions dialect and re-streams the response as plain text.

## Notes & limits

- Free tiers have rate limits — fine for personal use, not for thousands of users. If you hit
  a 429, switch models.
- This app does not train a model; it orchestrates existing ones, the same way most AI
  products do.
- The original static page is kept in [`legacy/index.html`](legacy/index.html).
