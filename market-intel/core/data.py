"""RV Market Intelligence — Market data layer.

Provider chain (first success wins, per symbol):
  1. Yahoo Finance  (via yfinance)  — India NSE + US, live
  2. Stooq          (free CSV API)  — US fallback
  3. Demo data                       — offline / restricted networks

Everything is cached in-memory for 60s to stay fast and polite.
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from datetime import datetime, timezone

from . import demo_data
from .technicals import analyze

# silence yfinance / curl_cffi chatter (errors are handled via fallbacks)
for _lg in ("yfinance", "curl_cffi", "urllib3", "peewee"):
    logging.getLogger(_lg).setLevel(logging.CRITICAL)

try:
    import yfinance as yf
    yf.set_tz_cache_location(os.path.join(tempfile.gettempdir(), ".yf_cache"))
except Exception:  # pragma: no cover - yfinance optional
    yf = None

import requests

CACHE_TTL = 60
_cache: dict[str, tuple[float, object]] = {}


def _cached(key: str):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]
    return None


def _store(key: str, val):
    _cache[key] = (time.time(), val)
    return val


# ── symbol metadata ──────────────────────────────────────────────

def is_indian(symbol: str) -> bool:
    return symbol.endswith((".NS", ".BO")) or symbol in ("^NSEI", "^NSEBANK")


def currency_of(symbol: str) -> str:
    return "INR" if is_indian(symbol) else "USD"


def name_of(symbol: str) -> str:
    if symbol in demo_data.UNIVERSE:
        return demo_data.UNIVERSE[symbol][2]
    return symbol


# ── providers ────────────────────────────────────────────────────

def _yahoo_history(symbol: str, period: str = "1y") -> list[dict] | None:
    if yf is None:
        return None
    try:
        df = yf.Ticker(symbol).history(period=period, interval="1d", auto_adjust=True)
        if df is None or len(df) < 30:
            return None
        days = []
        for ts, row in df.iterrows():
            days.append({
                "date": ts.strftime("%Y-%m-%d"),
                "open": float(row["Open"]), "high": float(row["High"]),
                "low": float(row["Low"]), "close": float(row["Close"]),
                "volume": int(row.get("Volume") or 0),
            })
        return days or None
    except Exception:
        return None


_STOOQ_MAP = {"^GSPC": "^spx", "^IXIC": "^ndq", "^NSEI": "^nsei"}


def _stooq_history(symbol: str, period: str = "1y") -> list[dict] | None:
    if is_indian(symbol) and symbol not in _STOOQ_MAP:
        return None  # stooq has no NSE stock coverage
    s = _STOOQ_MAP.get(symbol, symbol.lower() + ("" if "." in symbol else ".us"))
    try:
        url = f"https://stooq.com/q/d/l/?s={s}&i=d"
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        lines = [l for l in r.text.strip().splitlines() if l.strip()]
        if len(lines) < 30 or not lines[0].lower().startswith("date"):
            return None
        days = []
        for line in lines[1:]:
            p = line.split(",")
            if len(p) < 5:
                continue
            try:
                days.append({
                    "date": p[0], "open": float(p[1]), "high": float(p[2]),
                    "low": float(p[3]), "close": float(p[4]),
                    "volume": int(float(p[5])) if len(p) > 5 and p[5] else 0,
                })
            except ValueError:
                continue
        limit = {"1y": 252, "2y": 504, "6mo": 126, "1mo": 22}.get(period, 252)
        return days[-limit:] or None
    except Exception:
        return None


def get_history(symbol: str, period: str = "1y") -> dict:
    """{symbol, days, source} — source ∈ yahoo | stooq | demo"""
    key = f"hist:{symbol}:{period}"
    hit = _cached(key)
    if hit:
        return hit
    for fn, src in ((_yahoo_history, "yahoo"), (_stooq_history, "stooq")):
        days = fn(symbol, period)
        if days:
            return _store(key, {"symbol": symbol, "days": days, "source": src})
    return _store(key, {"symbol": symbol, "days": demo_data.demo_history(symbol), "source": "demo"})


def get_quotes(symbols: list[str]) -> dict:
    """Full bundle: quotes + technicals per symbol + overall data mode."""
    key = "quotes:" + ",".join(symbols)
    hit = _cached(key)
    if hit:
        return hit

    # fast path: try one batched yfinance download
    batch_days = _yahoo_batch(symbols)

    quotes, sources = [], []
    for sym in symbols:
        if batch_days and sym in batch_days:
            days, src = batch_days[sym]["days"], batch_days[sym]["source"]
        else:
            h = get_history(sym)
            days, src = h["days"], h["source"]
        quotes.append(_build_quote(sym, days, src))
        sources.append(src)

    mode = "demo" if all(s == "demo" for s in sources) else "live"
    return _store(key, {"mode": mode, "as_of": datetime.now(timezone.utc).isoformat(),
                        "quotes": quotes})


def _yahoo_batch(symbols: list[str]) -> dict | None:
    if yf is None or not symbols:
        return None
    try:
        df = yf.download(symbols, period="1y", interval="1d", auto_adjust=True,
                         group_by="ticker", progress=False, threads=True)
        if df is None or len(df) < 30:
            return None
        out = {}
        single = len(symbols) == 1 or not isinstance(df.columns, __import__("pandas").MultiIndex)
        for sym in symbols:
            try:
                sub = df[sym] if not single else df
                sub = sub.dropna(subset=["Close"])
                if len(sub) < 30:
                    continue
                days = [{
                    "date": ts.strftime("%Y-%m-%d"),
                    "open": float(r["Open"]), "high": float(r["High"]),
                    "low": float(r["Low"]), "close": float(r["Close"]),
                    "volume": int(r.get("Volume") or 0),
                } for ts, r in sub.iterrows()]
                out[sym] = {"days": days, "source": "yahoo"}
            except Exception:
                continue
        return out or None
    except Exception:
        return None


def _build_quote(symbol: str, days: list[dict], source: str) -> dict:
    closes = [d["close"] for d in days]
    vols = [d["volume"] for d in days] if days and days[-1].get("volume") else None
    t = analyze(closes, vols)

    last, prev = days[-1], days[-2]
    change = last["close"] - prev["close"]
    change_pct = change / prev["close"] * 100 if prev["close"] else 0.0

    return {
        "symbol": symbol,
        "name": name_of(symbol),
        "currency": currency_of(symbol),
        "region": "IN" if is_indian(symbol) else "US",
        "price": round(last["close"], 2),
        "prev_close": round(prev["close"], 2),
        "open": round(last["open"], 2),
        "day_high": round(last["high"], 2),
        "day_low": round(last["low"], 2),
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "volume": last.get("volume", 0),
        "date": last["date"],
        "source": source,
        "spark": closes[-60:],
        "technicals": {
            "rsi14": None if t["rsi14"] is None else round(t["rsi14"], 1),
            "sma20": None if t["sma20"] is None else round(t["sma20"], 2),
            "sma50": None if t["sma50"] is None else round(t["sma50"], 2),
            "sma200": None if t["sma200"] is None else round(t["sma200"], 2),
            "macd_hist": None if t["macd"]["hist"] is None else round(t["macd"]["hist"], 3),
            "high_52w": None if t["high_52w"] is None else round(t["high_52w"], 2),
            "low_52w": None if t["low_52w"] is None else round(t["low_52w"], 2),
            "pos_52w": round(t["pos_52w"], 1),
            "from_high_52w": None if t["from_high_52w"] is None else round(t["from_high_52w"], 2),
            "vol_ratio": None if t["vol_ratio"] is None else round(t["vol_ratio"], 2),
            "signal": t["signal"],
            "score": t["score"],
            "reasons": t["reasons"],
        },
    }


# ── symbol search (Groww-jaisa) ──────────────────────────────────

import json as _json
from pathlib import Path as _Path

_SYMBOLS: list | None = None


def _static_symbols() -> list:
    global _SYMBOLS
    if _SYMBOLS is None:
        try:
            p = _Path(__file__).resolve().parent.parent / "static" / "symbols.json"
            _SYMBOLS = _json.loads(p.read_text(encoding="utf-8"))["symbols"]
        except Exception:
            _SYMBOLS = []
    return _SYMBOLS


def _yahoo_search(q: str, limit: int = 8) -> list[dict]:
    """Live Yahoo search — full universe (all NSE/BSE/US), works on user's machine."""
    try:
        r = requests.get(
            "https://query2.finance.yahoo.com/v1/finance/search",
            params={"q": q, "quotesCount": limit, "newsCount": 0, "listsCount": 0},
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
            timeout=5)
        r.raise_for_status()
        out = []
        for it in r.json().get("quotes", []):
            sym = (it.get("symbol") or "").strip()
            if not sym or not all(c.isalnum() or c in ".-^" for c in sym):
                continue
            name = it.get("shortname") or it.get("longname") or sym
            exch = it.get("exchDisp") or it.get("exchange") or ""
            if sym.endswith((".NS", ".BO")):
                region = "IN"
            elif sym.endswith("-USD"):
                region = "CRYPTO"
            elif sym.startswith("^"):
                region = "IDX"
            elif "." in sym:
                continue  # other countries' exchanges
            else:
                region = "US"
            out.append({"symbol": sym, "name": name, "region": region, "exch": exch})
        return out[:limit]
    except Exception:
        return []


def search_symbols(q: str, limit: int = 10) -> dict:
    q = (q or "").strip()
    if not q:
        return {"query": q, "results": [], "live": False}

    live = _yahoo_search(q)  # full universe when online (like Groww)
    ql = q.lower()
    qu = q.upper()
    starts, contains = [], []
    for sym, name, region in _static_symbols():
        su, nu = sym.upper(), name.upper()
        if su.startswith(qu) or nu.startswith(ql):
            starts.append({"symbol": sym, "name": name, "region": region})
        elif ql in su.lower() or ql in nu.lower():
            contains.append({"symbol": sym, "name": name, "region": region})
    static = starts + contains

    seen = {r["symbol"] for r in live}
    merged = live + [r for r in static if r["symbol"] not in seen]
    return {"query": q, "results": merged[:limit], "live": bool(live)}


# ── news ─────────────────────────────────────────────────────────

def get_news(symbol: str) -> dict:
    key = f"news:{symbol}"
    hit = _cached(key)
    if hit:
        return hit

    items, source = _yahoo_news(symbol)
    if not items:
        items, source = demo_data.demo_news(symbol), "demo"
    return _store(key, {"symbol": symbol, "source": source, "items": items[:8]})


def _yahoo_news(symbol: str) -> tuple[list[dict], str]:
    if yf is None:
        return [], "demo"
    try:
        raw = yf.Ticker(symbol).news or []
        items = []
        for n in raw[:8]:
            c = n.get("content", n)  # new vs old yfinance shape
            title = c.get("title") or n.get("title")
            if not title:
                continue
            link = ""
            if isinstance(c.get("canonicalUrl"), dict):
                link = c["canonicalUrl"].get("url", "")
            link = link or c.get("link") or n.get("link") or ""
            pub = c.get("provider") or {}
            publisher = pub.get("displayName") if isinstance(pub, dict) else pub
            publisher = publisher or n.get("publisher") or "Yahoo Finance"
            when = c.get("pubDate") or n.get("providerPublishTime")
            items.append({"title": title, "publisher": publisher, "link": link,
                          "published": str(when or "")[:10]})
        return items, "yahoo"
    except Exception:
        return [], "demo"
