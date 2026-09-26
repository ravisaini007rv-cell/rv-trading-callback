"""RV Market Intelligence — Technical analysis engine.

Pure-Python indicators (no pandas needed): RSI, SMA, EMA, MACD,
52-week range, volume analysis and a composite signal score.
"""

from __future__ import annotations


# ── basic helpers ────────────────────────────────────────────────

def sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema_series(values: list[float], period: int) -> list[float]:
    """Full EMA series (same length as input, first period-1 are seeded)."""
    if len(values) < period:
        return list(values)
    out = list(values[:period - 1])
    e = sum(values[:period]) / period
    out.append(e)
    k = 2 / (period + 1)
    for v in values[period:]:
        e = v * k + e * (1 - k)
        out.append(e)
    return out


def rsi(closes: list[float], period: int = 14) -> float | None:
    """Wilder's RSI."""
    if len(closes) < period + 1:
        return None
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for i in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return 100.0 - 100.0 / (1.0 + rs)


def macd(closes: list[float]) -> dict:
    """Returns {macd, signal, hist} using EMA-12/26, signal EMA-9."""
    if len(closes) < 35:
        return {"macd": None, "signal": None, "hist": None}
    e12 = ema_series(closes, 12)
    e26 = ema_series(closes, 26)
    line = [a - b for a, b in zip(e12, e26)][25:]
    if len(line) < 9:
        return {"macd": None, "signal": None, "hist": None}
    sig = ema_series(line, 9)
    return {"macd": line[-1], "signal": sig[-1], "hist": line[-1] - sig[-1]}


# ── composite signal ─────────────────────────────────────────────

LABELS = ["STRONG SELL", "SELL", "HOLD", "BUY", "STRONG BUY"]


def analyze(closes: list[float], volumes: list[float] | None = None) -> dict:
    """Compute all indicators + composite signal for one symbol.

    `closes` — daily closes, oldest first (>= ~60 recommended).
    `volumes` — matching daily volumes (optional).
    """
    price = closes[-1] if closes else None
    out: dict = {
        "price": price,
        "sma20": sma(closes, 20),
        "sma50": sma(closes, 50),
        "sma200": sma(closes, 200),
        "rsi14": rsi(closes, 14),
        "macd": macd(closes),
    }

    # 52-week range
    window = closes[-252:] if len(closes) >= 252 else closes
    hi, lo = max(window), min(window)
    out["high_52w"], out["low_52w"] = hi, lo
    out["pos_52w"] = ((price - lo) / (hi - lo) * 100) if hi > lo else 50.0
    out["from_high_52w"] = ((price - hi) / hi * 100) if hi else None

    # volume
    if volumes and len(volumes) >= 20:
        avg20 = sum(volumes[-20:]) / 20
        out["avg_vol_20d"] = avg20
        out["vol_ratio"] = volumes[-1] / avg20 if avg20 else None
    else:
        out["avg_vol_20d"] = None
        out["vol_ratio"] = None

    # ── scoring ──
    score = 0.0
    reasons: list[str] = []

    def fmt(x, nd=2):
        return "N/A" if x is None else f"{x:,.{nd}f}"

    if out["sma20"] is not None:
        if price > out["sma20"]:
            score += 1
            reasons.append(f"Price above 20-day SMA ({fmt(price)} > {fmt(out['sma20'])}) — short-term uptrend")
        else:
            score -= 1
            reasons.append(f"Price below 20-day SMA ({fmt(price)} < {fmt(out['sma20'])}) — short-term weakness")

    if out["sma50"] is not None:
        if price > out["sma50"]:
            score += 1
            reasons.append("Trading above 50-day SMA — medium-term trend intact")
        else:
            score -= 1
            reasons.append("Trading below 50-day SMA — medium-term trend weak")

    if out["sma20"] is not None and out["sma50"] is not None:
        if out["sma20"] > out["sma50"]:
            score += 1
            reasons.append("20-day SMA above 50-day SMA (bullish crossover zone)")
        else:
            score -= 1
            reasons.append("20-day SMA below 50-day SMA (bearish crossover zone)")

    r = out["rsi14"]
    if r is not None:
        if r < 30:
            score += 2
            reasons.append(f"RSI {r:.0f} — oversold, possible bounce")
        elif r > 70:
            score -= 2
            reasons.append(f"RSI {r:.0f} — overbought, cooling-off risk")
        elif r >= 55:
            score += 0.5
            reasons.append(f"RSI {r:.0f} — healthy momentum")
        elif r <= 45:
            score -= 0.5
            reasons.append(f"RSI {r:.0f} — soft momentum")

    h = out["macd"]["hist"]
    if h is not None:
        if h > 0:
            score += 1
            reasons.append("MACD histogram positive — momentum building")
        else:
            score -= 1
            reasons.append("MACD histogram negative — momentum fading")

    vr = out["vol_ratio"]
    if vr is not None and vr > 1.8:
        reasons.append(f"Volume {vr:.1f}× the 20-day average — unusual activity, watch for catalyst")

    # map score ∈ [-6.5, +6.5] → label
    if score >= 3:
        label = "STRONG BUY"
    elif score >= 1:
        label = "BUY"
    elif score <= -3:
        label = "STRONG SELL"
    elif score <= -1:
        label = "SELL"
    else:
        label = "HOLD"

    out["score"] = round(score, 2)
    out["signal"] = label
    out["reasons"] = reasons
    return out
