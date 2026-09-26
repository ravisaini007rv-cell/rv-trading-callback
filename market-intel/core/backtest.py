"""RV Market Intelligence — Strategy backtester.

Tests classic strategies on real historical OHLCV data and compares
them honestly against Buy & Hold. Close-based fills, 0.1% cost per
side (brokerage+STT+slippage approx). Past performance ≠ future.
"""

from __future__ import annotations

from .technicals import ema_series

COST_PER_SIDE = 0.001  # ~0.1% per trade side
CAPITAL = 100_000.0


# ── indicator series ─────────────────────────────────────────────

def _sma_series(vals: list[float], period: int) -> list:
    out = [None] * len(vals)
    s = 0.0
    for i, v in enumerate(vals):
        s += v
        if i >= period:
            s -= vals[i - period]
        if i >= period - 1:
            out[i] = s / period
    return out


def _rsi_series(closes: list[float], period: int = 14) -> list:
    out = [None] * len(closes)
    if len(closes) < period + 1:
        return out
    gains = [max(closes[i] - closes[i - 1], 0.0) for i in range(1, len(closes))]
    losses = [max(closes[i - 1] - closes[i], 0.0) for i in range(1, len(closes))]
    ag = sum(gains[:period]) / period
    al = sum(losses[:period]) / period
    out[period] = 100.0 if al == 0 else 100.0 - 100.0 / (1.0 + ag / al)
    for i in range(period, len(gains)):
        ag = (ag * (period - 1) + gains[i]) / period
        al = (al * (period - 1) + losses[i]) / period
        out[i + 1] = 100.0 if al == 0 else 100.0 - 100.0 / (1.0 + ag / al)
    return out


# ── signal builders (1 = in market, 0 = cash) ───────────────────

def _sig_sma_cross(closes, fast, slow):
    f, s = _sma_series(closes, fast), _sma_series(closes, slow)
    return [0 if (f[i] is None or s[i] is None) else int(f[i] > s[i])
            for i in range(len(closes))]


def _sig_rsi_reversion(closes):
    r = _rsi_series(closes)
    sig, pos = [0] * len(closes), 0
    for i, v in enumerate(r):
        if v is None:
            continue
        if pos == 0 and v < 30:
            pos = 1
        elif pos == 1 and v > 70:
            pos = 0
        sig[i] = pos
    return sig


def _sig_macd(closes):
    e12, e26 = ema_series(closes, 12), ema_series(closes, 26)
    line = [a - b for a, b in zip(e12, e26)]
    sig9 = ema_series(line, 9)
    sig = [0] * len(closes)
    for i in range(35, len(closes)):  # warmup
        sig[i] = int((line[i] - sig9[i]) > 0)
    return sig


def _sig_momentum(closes, lookback=100):
    sig = [0] * len(closes)
    for i in range(lookback, len(closes)):
        sig[i] = int(closes[i] > closes[i - lookback])
    return sig


STRATEGIES = {
    "sma_20_50": {
        "name": "SMA Crossover (20/50)",
        "desc": "20-din average 50-din ke upar → BUY, neeche → SELL. Trend-following.",
        "warmup": 50,
        "build": lambda c: _sig_sma_cross(c, 20, 50),
    },
    "golden_50_200": {
        "name": "Golden Cross (50/200)",
        "desc": "Bade trend wala classic — 50/200 crossover. Kam trades, lambi hold.",
        "warmup": 200,
        "build": lambda c: _sig_sma_cross(c, 50, 200),
    },
    "rsi_reversion": {
        "name": "RSI Mean Reversion (30/70)",
        "desc": "RSI<30 (oversold) pe kharido, RSI>70 pe becho. Dip-buying.",
        "warmup": 15,
        "build": _sig_rsi_reversion,
    },
    "macd": {
        "name": "MACD Momentum",
        "desc": "MACD histogram positive → BUY, negative → SELL.",
        "warmup": 35,
        "build": _sig_macd,
    },
    "momentum_100": {
        "name": "100-Day Momentum",
        "desc": "Price 100 din pehle se upar → hold, warna cash.",
        "warmup": 100,
        "build": _sig_momentum,
    },
    "buy_hold": {
        "name": "Buy & Hold (baseline)",
        "desc": "Din 1 pe kharido, kabhi mat becho. Sab strategies isse compare hongi.",
        "warmup": 1,
        "build": lambda c: [1] * len(c),
    },
}


# ── simulation ───────────────────────────────────────────────────

def simulate(dates, closes, sig, capital: float = CAPITAL):
    """Close-based fills, signal lagged 1 day (no lookahead), costs per side."""
    n = len(closes)
    p = [0] * n
    for i in range(1, n):
        p[i] = sig[i - 1]

    eq = capital
    curve = [capital]
    peak, mdd = capital, 0.0
    trades, entry = [], None

    for i in range(1, n):
        if p[i]:
            eq *= 1.0 + (closes[i] / closes[i - 1] - 1.0)
        if p[i] and not p[i - 1]:
            eq *= 1.0 - COST_PER_SIDE
            entry = {"i": i, "date": dates[i], "price": closes[i]}
        elif (not p[i]) and p[i - 1] and entry:
            eq *= 1.0 - COST_PER_SIDE
            trades.append({**entry, "exit_date": dates[i], "exit_price": closes[i],
                           "ret_pct": round((closes[i] / entry["price"] - 1.0) * 100, 2),
                           "open": False})
            entry = None
        curve.append(eq)
        peak = max(peak, eq)
        mdd = max(mdd, (peak - eq) / peak)

    if entry:  # still open
        trades.append({**entry, "exit_date": dates[-1], "exit_price": closes[-1],
                       "ret_pct": round((closes[-1] / entry["price"] - 1.0) * 100, 2),
                       "open": True})

    wins = [t for t in trades if t["ret_pct"] > 0]
    days = max(n - 1, 1)
    total_ret = eq / capital - 1.0
    cagr = (eq / capital) ** (252.0 / days) - 1.0 if eq > 0 else -1.0

    return {
        "final_equity": round(eq, 0),
        "total_return_pct": round(total_ret * 100, 2),
        "cagr_pct": round(cagr * 100, 2),
        "max_drawdown_pct": round(mdd * 100, 2),
        "n_trades": len(trades),
        "win_rate_pct": round(len(wins) / len(trades) * 100, 1) if trades else None,
        "exposure_pct": round(sum(p) / days * 100, 1),
        "curve": [round(v, 0) for v in curve],
        "trades": [{k: t[k] for k in ("date", "price", "exit_date", "exit_price",
                                      "ret_pct", "open")} for t in trades[-14:]],
    }


def run_backtest(days: list[dict], strategy_id: str) -> dict:
    if strategy_id not in STRATEGIES:
        raise ValueError(f"unknown strategy: {strategy_id}")
    strat = STRATEGIES[strategy_id]
    closes = [d["close"] for d in days]
    dates = [d["date"] for d in days]

    if len(closes) < strat["warmup"] + 40:
        raise ValueError(
            f"Is strategy ke liye kam se kam {strat['warmup'] + 40} din data chahiye "
            f"(mila: {len(closes)}). Lambe period chuno ya doosra strategy try karo.")

    sig = strat["build"](closes)
    strat_res = simulate(dates, closes, sig)
    bh_res = simulate(dates, closes, [1] * len(closes))

    beat = strat_res["total_return_pct"] > bh_res["total_return_pct"]
    if strategy_id == "buy_hold":
        verdict = ("Buy & Hold baseline — doosri strategies ISSE compare hoti hain. "
                   "Agar koi strategy isse consistently haraati hai (lambe period me), "
                   "tab hi uspe seriously socho.")
    elif beat:
        verdict = (f"✅ Is period me strategy ne Buy & Hold ko haraya "
                   f"({strat_res['total_return_pct']}% vs {bh_res['total_return_pct']}%). "
                   "Lekin yaad rakho: ek period jeetna kaafi nahi — alag-alag stocks, "
                   "alag-alag periods pe bhi test karo.")
    else:
        verdict = (f"❌ Buy & Hold jeeta ({bh_res['total_return_pct']}% vs "
                   f"{strat_res['total_return_pct']}%) — is stock/period pe ye strategy "
                   "fayde ki nahi thi. Aise hi numbers se seekhte hain pros.")

    return {"strategy": strategy_id, "strategy_name": strat["name"],
            "n_days": len(closes), "from": dates[0], "to": dates[-1],
            "result": strat_res, "buy_hold": bh_res, "beat_buy_hold": beat,
            "verdict": verdict,
            "disclaimer": "Close-based backtest, ~0.1% cost per side. Past performance "
                          "future ki guarantee NAHI hai — ye research hai, tip nahi."}
