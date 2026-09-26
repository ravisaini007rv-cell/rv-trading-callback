"""RV Market Intelligence — API server.

Run:   uvicorn app:app --host 0.0.0.0 --port 8000
Then:  open http://localhost:8000
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from core import agents, data

load_dotenv()
ROOT = Path(__file__).parent
REPORTS_DIR = ROOT / "reports"
REPORTS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="RV Market Intelligence", docs_url=None, redoc_url=None)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                   allow_headers=["*"])


# ── static frontend ──────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse(ROOT / "static" / "index.html")


app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


# ── helpers ──────────────────────────────────────────────────────

def _key_from(req: Request, body: dict) -> tuple[str | None, str, str | None]:
    """Resolve LLM credentials: request body > header > .env"""
    api_key = body.get("api_key") or req.headers.get("X-API-Key") or \
        os.getenv("GROQ_API_KEY") or os.getenv("XAI_API_KEY")
    provider = body.get("provider") or ("xai" if os.getenv("XAI_API_KEY") and not
                                        os.getenv("GROQ_API_KEY") else "groq")
    if provider == "xai":
        api_key = body.get("api_key") or os.getenv("XAI_API_KEY")
        base_url = body.get("base_url") or os.getenv("XAI_BASE_URL",
                                                     agents.PROVIDERS["xai"]["base_url"])
        model = body.get("model") or os.getenv("XAI_MODEL",
                                               agents.PROVIDERS["xai"]["model"])
    else:
        base_url = body.get("base_url") or agents.PROVIDERS["groq"]["base_url"]
        model = body.get("model") or os.getenv("GROQ_MODEL",
                                               agents.PROVIDERS["groq"]["model"])
    return api_key, base_url, model


# ── API endpoints ────────────────────────────────────────────────

@app.get("/api/status")
def status():
    return {
        "data_mode": "unknown until first quote request",
        "env_key": bool(os.getenv("GROQ_API_KEY") or os.getenv("XAI_API_KEY")),
        "providers": {k: {kk: vv for kk, vv in v.items()} for k, v in agents.PROVIDERS.items()},
    }


@app.get("/api/search")
def search(q: str = ""):
    return data.search_symbols(q)


@app.get("/api/network")
def network():
    """LAN address — phone se connect karne ke liye (same WiFi)."""
    import socket
    ip = "127.0.0.1"
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # UDP: no packet actually sent
        ip = s.getsockname()[0]
    except Exception:
        try:
            ip = socket.gethostbyname(socket.gethostname())
        except Exception:
            pass
    finally:
        s.close()
    return {"lan_ip": ip, "port": 8000, "url": f"http://{ip}:8000"}


@app.post("/api/quotes")
async def quotes(body: dict):
    symbols = body.get("symbols") or []
    if not symbols:
        return JSONResponse(status_code=400, content={"detail": "symbols required"})
    return data.get_quotes(symbols[:30])


@app.post("/api/news")
async def news(body: dict):
    symbol = body.get("symbol")
    if not symbol:
        return JSONResponse(status_code=400, content={"detail": "symbol required"})
    return data.get_news(symbol)


@app.post("/api/analyze")
async def analyze(body: dict, request: Request):
    symbols = body.get("symbols") or []
    if not symbols:
        return JSONResponse(status_code=400, content={"detail": "symbols required"})
    symbols = symbols[:15]

    bundle = data.get_quotes(symbols)
    quote_list = bundle["quotes"]

    api_key, base_url, model = _key_from(request, body)
    demo = body.get("demo") or not api_key

    if demo:
        result = agents.run_demo_team(quote_list, symbols)
        result["data_mode"] = bundle["mode"]
        result["note"] = ("Demo output — free Groq API key daalo (Settings ⚙) "
                          "to unlock the full AI team.")
        return result

    llm = agents.LLM(api_key, base_url, model)
    try:
        result = agents.run_team(quote_list, symbols, llm,
                                 focus=body.get("focus", ""))
    except agents.LLMError as e:
        return JSONResponse(status_code=502, content={"detail": str(e)})
    result["data_mode"] = bundle["mode"]
    result["model"] = model
    return result


@app.post("/api/report")
async def report(body: dict, request: Request):
    symbols = body.get("symbols") or []
    if not symbols:
        return JSONResponse(status_code=400, content={"detail": "symbols required"})
    symbols = symbols[:15]

    bundle = data.get_quotes(symbols)
    api_key, base_url, model = _key_from(request, body)
    use_ai = bool(body.get("use_ai") and api_key)

    md = [f"# RV Market Intelligence Report",
          f"*Generated {datetime.now():%d %b %Y, %H:%M} — data mode: {bundle['mode'].upper()}*",
          "", "## Watchlist Snapshot", "",
          "| Symbol | Name | Price | Day % | RSI | Signal |",
          "|---|---|---|---|---|---|"]
    for q in sorted(bundle["quotes"], key=lambda x: x["change_pct"], reverse=True):
        t = q["technicals"]
        md.append(f"| {q['symbol']} | {q['name']} | {q['price']:,} {q['currency']} | "
                  f"{q['change_pct']:+.2f}% | {t['rsi14']} | {t['signal']} |")

    md += ["", "## Technical Detail", ""]
    for q in bundle["quotes"]:
        t = q["technicals"]
        md.append(f"### {q['symbol']} — {q['name']} ({t['signal']})")
        md.append(f"- Price {q['price']:,} ({q['change_pct']:+.2f}%), RSI {t['rsi14']}, "
                  f"52w pos {t['pos_52w']}% (from high: {t['from_high_52w']}%)")
        for r in t["reasons"]:
            md.append(f"- {r}")
        md.append("")

    if use_ai:
        llm = agents.LLM(api_key, base_url, model)
        try:
            md += ["## AI Intelligence Team Report", "",
                   agents.run_team(bundle["quotes"], symbols, llm,
                                   focus=body.get("focus", ""))["final"], ""]
        except agents.LLMError as e:
            md += [f"_(AI section failed: {e})_", ""]

    if not use_ai:
        md += ["## AI Intelligence Team Report", "",
           "_AI section disabled ya API key missing — Settings me free Groq key add karke "
           "'Include AI analysis' enable karo._", ""]

    md += ["---", "_Auto-generated by RV Market Intelligence. Not investment advice._"]
    text = "\n".join(md)

    fname = f"market-intel-{datetime.now():%Y%m%d-%H%M}.md"
    (REPORTS_DIR / fname).write_text(text, encoding="utf-8")
    return {"filename": fname, "markdown": text, "data_mode": bundle["mode"],
            "ai_included": use_ai}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
