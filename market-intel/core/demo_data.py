"""RV Market Intelligence — Demo market data.

Used ONLY as a fallback when live data (Yahoo Finance / Stooq) is
unreachable — e.g. restricted networks or offline preview. Data is
deterministic (seeded per symbol) and clearly labelled as demo.

On your own computer the app will use real live data automatically.
"""

from __future__ import annotations

import random
from datetime import date, timedelta

# symbol → (base_price, currency, name, base_volume, daily_drift, daily_vol)
UNIVERSE: dict[str, tuple] = {
    # ── India (NSE) ──────────────────────────────────────────────
    "^NSEI":      (26250.0, "INR", "NIFTY 50 Index",        0,        0.00045, 0.0060),
    "^NSEBANK":   (59800.0, "INR", "NIFTY Bank Index",      0,        0.00050, 0.0075),
    "RELIANCE.NS":(1580.0,  "INR", "Reliance Industries",   8_500_000, 0.00040, 0.0110),
    "TCS.NS":     (3448.0,  "INR", "Tata Consultancy Svcs", 2_100_000, 0.00030, 0.0100),
    "HDFCBANK.NS":(1052.0,  "INR", "HDFC Bank",             9_800_000, 0.00042, 0.0105),
    "INFY.NS":    (1655.0,  "INR", "Infosys",               6_200_000, 0.00028, 0.0120),
    "ICICIBANK.NS":(1441.0, "INR", "ICICI Bank",            11_000_000,0.00045, 0.0108),
    "TATAMOTORS.NS":(722.0, "INR", "Tata Motors",           16_000_000,0.00055, 0.0160),
    "SBIN.NS":    (952.0,   "INR", "State Bank of India",   14_000_000,0.00048, 0.0125),
    "BHARTIARTL.NS":(2155.0,"INR", "Bharti Airtel",         4_500_000, 0.00050, 0.0105),
    # ── US ───────────────────────────────────────────────────────
    "^GSPC":      (6910.0,  "USD", "S&P 500 Index",         0,        0.00040, 0.0055),
    "^IXIC":      (25820.0, "USD", "Nasdaq Composite",      0,        0.00050, 0.0068),
    "AAPL":       (286.0,   "USD", "Apple Inc.",            52_000_000,0.00042, 0.0115),
    "MSFT":       (542.0,   "USD", "Microsoft Corp.",       21_000_000,0.00038, 0.0102),
    "NVDA":       (212.0,   "USD", "NVIDIA Corp.",          190_000_000,0.00060,0.0190),
    "TSLA":       (481.0,   "USD", "Tesla Inc.",            88_000_000,0.00050, 0.0230),
    "AMZN":       (262.0,   "USD", "Amazon.com Inc.",       35_000_000,0.00045, 0.0130),
    "GOOGL":      (352.0,   "USD", "Alphabet Inc.",         24_000_000,0.00044, 0.0122),
    "META":       (784.0,   "USD", "Meta Platforms",        13_000_000,0.00046, 0.0140),
}

_DAYS = 380  # ~1.5y of trading days

_NEWS_TEMPLATES = [
    ("{name} shares in focus ahead of quarterly results next week", "Economic Times"),
    ("Brokerages maintain BUY on {name}; target price raised after strong guidance", "Moneycontrol"),
    ("{name} announces capex plan to expand capacity, street reaction mixed", "Business Standard"),
    ("FIIs raise stake in {name} in the latest shareholding data", "NSE Filing"),
    ("Analyst debate: is {name} still a buy after the recent rally?", "CNBC-TV18"),
    ("{name} under pressure as global peers slide; volume spike noted", "Reuters"),
    ("Q2 earnings preview: what to expect from {name}", "Bloomberg"),
    ("Technical view: {name} approaches key support; momentum indicators turn positive", "Moneycontrol"),
]

_MACRO_NEWS = [
    ("RBI policy meet next week — rate cut hopes keep rate-sensitives in focus", "Economic Times"),
    ("US Fed minutes signal data-dependent path; Asian markets steady", "Reuters"),
    ("Crude oil slips 2% — oil marketing companies and paint stocks in focus", "Bloomberg"),
    ("FII flows turn positive after three weeks of selling; NIFTY holds key level", "Moneycontrol"),
    ("IT stocks in demand as US tech earnings season kicks off", "Business Standard"),
    ("Global cues: S&P 500 closes at record high on soft inflation print", "CNBC"),
]


def demo_history(symbol: str, days: int = _DAYS) -> list[dict]:
    """Deterministic OHLCV history for one symbol (oldest → newest, weekdays only)."""
    if symbol not in UNIVERSE:
        base, cur, drift, vol = 100.0, "USD", 0.0004, 0.015
        name = symbol
    else:
        base, cur, name, basevol, drift, vol = UNIVERSE[symbol]

    rng = random.Random(f"rv-demo-{symbol}")
    today = date.today()

    # build list of weekdays ending today
    d = today
    trading_days: list[date] = []
    while len(trading_days) < days:
        if d.weekday() < 5:
            trading_days.append(d)
        d -= timedelta(days=1)
    trading_days.reverse()

    # random walk *backwards* from base so latest price ≈ base
    closes = [base]
    for _ in range(len(trading_days) - 1):
        prev = closes[0]
        step = rng.gauss(-drift, vol)
        closes.insert(0, prev / (1 + step))
    closes = [round(c, 2) for c in closes]

    out = []
    for i, day in enumerate(trading_days):
        c = closes[i]
        o = round(c * (1 + rng.gauss(0, vol / 3)), 2)
        hi = round(max(o, c) * (1 + abs(rng.gauss(0, vol / 2))), 2)
        lo = round(min(o, c) * (1 - abs(rng.gauss(0, vol / 2))), 2)
        v = int(basevol * rng.uniform(0.55, 1.7)) if basevol else 0
        out.append({"date": day.isoformat(), "open": o, "high": hi, "low": lo,
                    "close": c, "volume": v})
    return out


def demo_news(symbol: str) -> list[dict]:
    rng = random.Random(f"rv-news-{symbol}")
    name = UNIVERSE.get(symbol, (None, None, symbol))[2]
    picks = rng.sample(_NEWS_TEMPLATES, k=min(4, len(_NEWS_TEMPLATES)))
    out = []
    for i, (tpl, pub) in enumerate(picks):
        out.append({
            "title": tpl.format(name=name),
            "publisher": pub,
            "link": "",
            "published": (date.today() - timedelta(days=rng.randint(0, 4))).isoformat(),
        })
    for tpl, pub in rng.sample(_MACRO_NEWS, k=2):
        out.append({"title": tpl, "publisher": pub, "link": "",
                    "published": date.today().isoformat()})
    out.sort(key=lambda x: x["published"], reverse=True)
    return out


def demo_meta(symbol: str) -> dict:
    if symbol in UNIVERSE:
        base, cur, name, *_ = UNIVERSE[symbol]
        return {"name": name, "currency": cur}
    return {"name": symbol, "currency": "USD"}
