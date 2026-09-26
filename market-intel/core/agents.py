"""RV Market Intelligence — AI Agent Team.

A 5-agent pipeline inspired by the viral "Grok Stock Market
Intelligence Team", rebuilt to run on ANY OpenAI-compatible API:

  SCOUT  → scans the market snapshot, flags movers & anomalies
  RECON  → extracts key drivers from the latest news
  VERIFY → cross-checks every claim against real numbers
  SIGNAL → maps narratives, risks & contrarian angles
  CHIEF  → synthesizes the final intelligence report

Default provider: Groq (free tier). Also works with xAI Grok,
OpenRouter, or any OpenAI-compatible endpoint — just change
base_url / model in the UI settings or .env.
"""

from __future__ import annotations

import requests

from .data import get_news

# ── provider defaults ────────────────────────────────────────────

PROVIDERS = {
    "groq": {
        "label": "Groq (FREE — recommended)",
        "base_url": "https://api.groq.com/openai/v1",
        "model": "openai/gpt-oss-120b",
        "key_url": "https://console.groq.com/keys",
    },
    "xai": {
        "label": "xAI Grok (paid)",
        "base_url": "https://api.x.ai/v1",
        "model": "grok-4-fast",
        "key_url": "https://console.x.ai",
    },
    "custom": {
        "label": "Custom (OpenAI-compatible)",
        "base_url": "",
        "model": "",
        "key_url": "",
    },
}

MODEL_FALLBACKS = ["openai/gpt-oss-120b", "qwen/qwen3.6-27b",
                   "openai/gpt-oss-20b", "groq/compound-mini"]

MAX_TOKENS = 1600


class LLMError(Exception):
    pass


class LLM:
    """Minimal OpenAI-compatible chat client with model fallback."""

    def __init__(self, api_key: str, base_url: str, model: str | None = None):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.models = [model] + [m for m in MODEL_FALLBACKS if m != model] if model \
            else list(MODEL_FALLBACKS)

    def chat(self, system: str, user: str, temperature: float = 0.4) -> str:
        last_err = "no model attempted"
        for model in self.models:
            try:
                r = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}",
                             "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "messages": [{"role": "system", "content": system},
                                     {"role": "user", "content": user}],
                        "temperature": temperature,
                        "max_tokens": MAX_TOKENS,
                    },
                    timeout=90,
                )
                if r.status_code == 404 or (r.status_code == 400 and "model" in r.text.lower()):
                    last_err = f"model '{model}' unavailable: {r.text[:200]}"
                    continue  # try next model
                if r.status_code == 401:
                    raise LLMError("API key invalid — Settings me key check karo.")
                if r.status_code == 429:
                    raise LLMError("Rate limit hit — thoda ruk ke dobara try karo (free tier limit).")
                r.raise_for_status()
                data = r.json()
                text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
                if text.strip():
                    return text.strip()
                last_err = f"empty response from {model}"
            except LLMError:
                raise
            except requests.RequestException as e:
                last_err = f"network error ({model}): {e}"
                continue
        if "network error" in last_err:
            raise LLMError(
                "AI provider tak connect nahi ho paya — internet / base URL / proxy check karo. "
                f"(detail: {last_err[:180]})")
        raise LLMError(last_err)


# ── agent definitions ────────────────────────────────────────────

AGENTS = [
    {
        "id": "scout", "name": "SCOUT", "emoji": "🛰️",
        "role": "Market scanner — identifies movers, anomalies and priorities",
        "system": (
            "You are SCOUT, a market scanning agent on a stock intelligence team. "
            "You receive a market snapshot (India NSE + US) with prices, changes, RSI, "
            "MACD and signal scores. Identify: (1) biggest movers up/down, (2) anomalies "
            "(oversold/overbought, unusual volume, near 52-week extremes), (3) the 3-5 "
            "symbols that deserve deep analysis today and why. Be concise and numeric. "
            "Format as short markdown with a 'Priority targets' list."
        ),
    },
    {
        "id": "recon", "name": "RECON", "emoji": "🔎",
        "role": "Deep extraction — pulls key facts & drivers from latest news",
        "system": (
            "You are RECON, an information-extraction agent. You receive recent news "
            "headlines per symbol. Extract the key drivers, events and sentiment per "
            "symbol (results, guidance, policy, flows, global cues). Note what is "
            "mission-critical vs noise. Short markdown, grouped by symbol."
        ),
    },
    {
        "id": "verify", "name": "VERIFY", "emoji": "✅",
        "role": "Fact-checker — cross-references every claim against real data",
        "system": (
            "You are VERIFY, a fact-checking agent. You receive RECON's extracted claims "
            "plus the raw numeric market data. Cross-check each claim against the numbers. "
            "Tag each claim [CONFIDENCE: HIGH/MEDIUM/LOW] with one-line justification. "
            "Flag anything the news says that the data does NOT support. Short markdown."
        ),
    },
    {
        "id": "signal", "name": "SIGNAL", "emoji": "📡",
        "role": "Narrative mapper — trends, risks & contrarian angles",
        "system": (
            "You are SIGNAL, a narrative-mapping agent. From the verified findings, map: "
            "(1) active market narratives (India + US), (2) risks that could invalidate "
            "them, (3) one or two contrarian angles — what the crowd may be missing. "
            "You are allowed to be opinionated but must stay data-grounded. Short markdown."
        ),
    },
    {
        "id": "chief", "name": "CHIEF", "emoji": "🧠",
        "role": "Team lead — writes the final intelligence report",
        "system": (
            "You are CHIEF, the team lead of a stock market intelligence team. Synthesize "
            "SCOUT, RECON, VERIFY and SIGNAL's work into ONE polished markdown report: "
            "## Market Pulse (2-3 lines)  ## Key Movers (table)  ## What's Driving It "
            "## Risks  ## Watchlist Actions (per priority symbol: view + invalidation level) "
            "## Bottom Line (3 bullets). Use the real numbers you were given. Add "
            "'_Not investment advice._' at the end. Write for a retail trader in simple English."
        ),
    },
]


# ── data serialization for prompts ───────────────────────────────

def _compact_snapshot(quotes: list[dict]) -> str:
    lines = ["symbol | name | price | day% | RSI14 | MACD-hist | 52w-pos% | signal | vol-ratio"]
    for q in quotes:
        t = q["technicals"]
        lines.append(
            f"{q['symbol']} | {q['name']} | {q['price']} ({q['currency']}) | "
            f"{q['change_pct']:+.2f}% | {t['rsi14']} | {t['macd_hist']} | "
            f"{t['pos_52w']} | {t['signal']} | {t['vol_ratio']}"
        )
    return "\n".join(lines)


def _compact_news(symbols: list[str]) -> str:
    parts = []
    for sym in symbols[:10]:
        n = get_news(sym)
        if n["items"]:
            head = "; ".join(f"[{i['publisher']}] {i['title']}" for i in n["items"][:5])
            parts.append(f"### {sym}\n{head}")
    return "\n\n".join(parts) if parts else "(no news available)"


# ── pipeline ─────────────────────────────────────────────────────

def run_team(quotes: list[dict], symbols: list[str], llm: LLM,
             focus: str = "", on_step=None) -> dict:
    """Run the 5-agent pipeline. `on_step(agent_id, status)` for progress."""
    snapshot = _compact_snapshot(quotes)
    news = _compact_news(symbols)
    focus_line = f"\n\nUSER FOCUS: {focus}" if focus else ""

    context = {"scout": "", "recon": "", "verify": "", "signal": ""}
    steps = []

    def call(agent, user_prompt):
        if on_step:
            on_step(agent["id"], "running")
        text = llm.chat(agent["system"], user_prompt)
        if on_step:
            on_step(agent["id"], "done")
        steps.append({"agent": agent["id"], "name": agent["name"], "emoji": agent["emoji"],
                      "role": agent["role"], "content": text})
        return text

    context["scout"] = call(
        AGENTS[0],
        f"MARKET SNAPSHOT ({len(quotes)} symbols, India + US):\n{snapshot}\n{focus_line}")

    context["recon"] = call(
        AGENTS[1],
        f"LATEST NEWS:\n{news}\n\nFocus on the priority symbols SCOUT identified:\n{context['scout']}")

    context["verify"] = call(
        AGENTS[2],
        f"RAW MARKET DATA:\n{snapshot}\n\nRECON'S CLAIMS TO VERIFY:\n{context['recon']}")

    context["signal"] = call(
        AGENTS[3],
        f"MARKET DATA:\n{snapshot}\n\nSCOUT:\n{context['scout']}\n\nVERIFIED FINDINGS:\n{context['verify']}")

    final = call(
        AGENTS[4],
        f"TEAM INPUTS\n\nMARKET DATA:\n{snapshot}\n\nSCOUT:\n{context['scout']}\n\n"
        f"RECON:\n{context['recon']}\n\nVERIFY:\n{context['verify']}\n\nSIGNAL:\n{context['signal']}\n{focus_line}")

    return {"steps": steps, "final": final, "mode": "ai"}


# ── demo team (no API key needed) ────────────────────────────────

def run_demo_team(quotes: list[dict], symbols: list[str]) -> dict:
    """Rule-based sample output so users can preview the experience key-free."""
    steps = []

    movers_up = sorted(quotes, key=lambda q: q["change_pct"], reverse=True)
    top, bottom = movers_up[0], movers_up[-1]
    overbought = [q for q in quotes if (q["technicals"]["rsi14"] or 50) > 70]
    oversold = [q for q in quotes if (q["technicals"]["rsi14"] or 50) < 30]
    buys = [q for q in quotes if "BUY" in q["technicals"]["signal"]]
    sells = [q for q in quotes if "SELL" in q["technicals"]["signal"]]

    def sym_line(q):
        return f"**{q['symbol']}** ({q['name']}): {q['price']:,} ({q['change_pct']:+.2f}%), RSI {q['technicals']['rsi14']}, signal **{q['technicals']['signal']}**"

    scout = (
        "### Scan results\n"
        f"**Top gainer:** {sym_line(top)}\n**Top loser:** {sym_line(bottom)}\n\n"
        f"**Oversold (RSI<30):** {', '.join(q['symbol'] for q in oversold) or 'none'}\n"
        f"**Overbought (RSI>70):** {', '.join(q['symbol'] for q in overbought) or 'none'}\n\n"
        "**Priority targets:** " + ", ".join(
            q["symbol"] for q in (movers_up[:2] + [bottom])[:3])
    )

    recon = "### Latest drivers (sample extraction)\n" + "\n".join(
        f"- **{sym}**: results/event flows in focus — headlines se capex, guidance aur FII "
        f"activity ke signals milte hain. Full news Dashboard me per-symbol khulegi."
        for sym in symbols[:5])

    verify = ("### Verified vs data\n"
              "Every numeric claim above was computed directly from OHLCV data:\n"
              f"- RSI, SMA, MACD values are real calculations — **[CONFIDENCE: HIGH]**\n"
              f"- News-based sentiment is directional only — **[CONFIDENCE: MEDIUM]**\n"
              f"- No contradictory data detected between claims and price action.")

    signal_txt = ("### Narratives\n"
                  f"- Momentum leaders ({', '.join(q['symbol'] for q in buys[:3]) or '—'}) trend continuation ka risk/reward dekho.\n"
                  f"- Weak names ({', '.join(q['symbol'] for q in sells[:3]) or '—'}) me catch-a-falling-knife se bacho.\n\n"
                  "### Contrarian angle\n"
                  "- Oversold names me mean-reversion bounce possible — lekin volume confirmation chahiye.")

    rows = "\n".join(
        f"| {q['symbol']} | {q['price']:,} | {q['change_pct']:+.2f}% | "
        f"{q['technicals']['rsi14']} | {q['technicals']['signal']} |"
        for q in movers_up[:8])
    final = (
        "## Market Pulse (DEMO)\n"
        "Yeh **demo output** hai — AI key ke bina rule-based analysis. Settings me free "
        "Groq key daalo to full AI report milega.\n\n"
        "## Key Movers\n\n| Symbol | Price | Day % | RSI | Signal |\n|---|---|---|---|---|\n"
        f"{rows}\n\n"
        "## What's Driving It\n"
        f"{len(buys)} symbols BUY zone me, {len(sells)} SELL zone me. "
        f"{top['symbol']} sabse strong, {bottom['symbol']} sabse weak.\n\n"
        "## Bottom Line\n"
        "- Trend-followers: BUY-zone symbols me dips pe entry dekho\n"
        "- RSI extremes (30/70) respect karo\n"
        "- _Not investment advice._"
    )

    for agent, content in zip(AGENTS, [scout, recon, verify, signal_txt, final]):
        steps.append({"agent": agent["id"], "name": agent["name"], "emoji": agent["emoji"],
                      "role": agent["role"], "content": content})
    return {"steps": steps, "final": final, "mode": "demo"}
