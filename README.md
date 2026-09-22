# RV AI Studio

A free, ChatGPT-style AI assistant you own — chat & coding help, image generation, and
in-browser video editing. Built with Next.js 16 + Tailwind 4.

**It works with zero configuration.** The default models need no API key at all.

## Features

- **Agent mode** — the AI uses real tools on its own: live web search, reading web pages,
  running JavaScript in a sandboxed worker, and generating images. You watch each step in
  collapsible tool cards. Up to 6 tool steps per answer. Toggle it off for plain chat.
- **Compare mode** — send one prompt to 2–4 models at once and see the answers side by side
  with response times.
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
