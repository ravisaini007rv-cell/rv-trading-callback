# RV Agent

An autonomous coding agent that runs **on your own laptop** and actually does the work —
it opens the terminal, writes files, installs packages, runs the build, reads the errors,
and fixes them itself. You describe the goal; it executes.

This is the piece a browser app cannot do: real shell, real files, and a real browser it
drives itself.

```
rv › ek react todo app banao aur dev server chalu karo

PLAN:
1. Scaffold the project with Vite
2. Write the Todo component
3. Install dependencies and start the dev server

   ✓ $ npm create vite@latest . -- --template react
   ✓ write src/App.jsx
   ✓ $ npm install
   ✓ $ npm run dev &
   ✓ $ curl -s localhost:5173

Done — running at http://localhost:5173.
```

## It can also drive a browser

Beyond the terminal, the agent can open a real Chromium window and use websites like a
person — Google, WhatsApp Web, Gmail, any dashboard or form.

```bash
rv browser-setup      # one-time, downloads Chromium (~150 MB)

rv "google par aaj ka gold rate dekho aur batao"
rv "whatsapp web kholo aur Papa ko message bhejo ki ghar aa raha hoon"
rv "is site par form bharo aur submit kar do"
```

**The window is visible** — you watch every click and can take over whenever you want.

**Logins are remembered.** The profile lives in `~/.rv-agent-browser`, so you scan the
WhatsApp QR code or sign into Google **once, by hand**, and the agent stays logged in for
every future run. It will never ask for or type your password — if a site needs a login it
stops and tells you to do it.

## Install

Needs **Node 18+** (`node -v` to check; get it from [nodejs.org](https://nodejs.org)).

```bash
cd agent
npm link          # makes the `rv` command available everywhere
rv setup          # paste a free API key — takes a minute
```

No dependencies are downloaded: the agent uses only Node built-ins.

> If `npm link` needs permissions, use `sudo npm link`, or skip it and call
> `node /path/to/agent/src/cli.js` directly.

## Use

```bash
cd ~/my-project     # the agent works in the folder you are standing in

rv                  # interactive session
rv "add dark mode to this site"     # one task, then exit
rv --yolo "fix the failing tests"   # don't ask for approval
```

### What to ask it

```bash
rv "ek portfolio website banao, phir browser me khol do"
rv "npm test chalao aur jo fail ho rahe hain wo theek karo"
rv "is project ka code padho aur README likho"
rv "ye error theek karo: TypeError cannot read property map of undefined"
rv "sare console.log hatao aur git commit kar do"
rv "is folder ko github par push karo"
```

### Session commands

| Command | Does |
|---|---|
| `/auto` | toggle auto-approve |
| `/clear` | forget the conversation |
| `/cwd` | show the project folder |
| `/exit` | quit |

## Its tools

| Tool | What it does |
|---|---|
| `bash` | Any shell command — npm, git, python, curl, tests, builds |
| `write_file` / `read_file` / `edit_file` | Real files on disk |
| `list_files` / `search` | Explore and grep the project |
| `web_search` / `fetch_url` | Look up docs and errors online |
| `browser_open` / `browser_read` | Open a site and see what is on the page |
| `browser_click` / `browser_type` | Click buttons and fill fields, by visible text |
| `browser_screenshot` | Save a PNG of what it is looking at |

Independent tools run **in parallel**.

## Safety

The agent has real power, so it has real limits:

1. **Approval by default.** Every command, file write and edit is shown and confirmed
   before it runs. Turn it off with `/auto` or `--yolo` once you trust it.
2. **Destructive commands are always refused**, even in yolo mode: `rm -rf`, `mkfs`,
   `dd if=`, fork bombs, `shutdown`, `curl | sh`, and writes to raw disks.
3. **Locked to one folder.** File paths cannot escape the directory you started in.
4. **Runaway commands are killed** after a timeout (default 120s).

Good practice: run it inside a **git repo** so every change is reviewable with
`git diff` and revertible with `git checkout .`.

## Providers

Configured with `rv setup`, tried fastest-first and automatically falling back:

| Provider | Free tier | Speed |
|---|---|---|
| **Groq** | 14,400 req/day | ⚡⚡⚡ fastest — recommended |
| Gemini | 1,500 req/day | ⚡⚡ |
| OpenRouter | ~50 req/day | ⚡ |
| Ollama | unlimited, offline | depends on your hardware |
| Pollinations | no key at all | ⚡⚡ fallback |

Keys live in `~/.rv-agent.json` (chmod 600) or the standard environment variables
(`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`).

## Honest limits

- **Model quality decides quality.** Groq's Llama 3.3 70B is good but not
  frontier-level; it will occasionally take a clumsy route or need a nudge.
- **Long tasks hit the step cap** (30 tool calls). Say "continue" to resume.
- **Browser control is web-only.** It drives Chromium, so anything with a website works
  (WhatsApp Web, Gmail, GitHub). It cannot click native desktop apps — the WhatsApp
  *app* on your Mac, Finder, or System Settings are out of reach.
- **Sites change and break automation.** WhatsApp Web in particular updates often; if a
  click fails, `browser_read` usually lets the agent find the new button, but not always.
- **Review before you trust.** It is capable, not infallible. Use git.

## Tests

```bash
npm test     # safety rails + agent loop
```

19 safety checks cover blocked destructive commands, path-escape attempts, missing files,
bad edits and runaway processes.
