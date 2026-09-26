# 📈 RV Market Intelligence — AI Stock Market Intelligence Team

**India 🇮🇳 + US 🇺🇸 markets · 5 AI agents · FREE me**

Viral "Grok Stock Market Intelligence Team" ka free version — koi paid subscription nahi,
koi SuperGrok nahi. Aapke apne computer pe chalta hai, aapki API key aapke paas rehti hai.

---

## ✨ Kya-kya milta hai

| Feature | Detail |
|---|---|
| 📊 **Live Dashboard** | NSE (NIFTY, BANKNIFTY, RELIANCE, TCS…) + US (S&P 500, AAPL, NVDA…) real-time prices, sparkline charts |
| 🔍 **Stock Search** | Groww-jaisa search — naam likho ("reliance", "apple"), suggestions me se click karo. Apne computer pe poora universe (saare NSE/BSE/US stocks, indices, crypto) live search hota hai |
| 📐 **Technical Engine** | RSI(14), SMA 20/50/200, MACD, 52-week range, volume analysis, **auto BUY/HOLD/SELL signals** (reasons ke saath) |
| 🤖 **5-Agent AI Team** | SCOUT 🛰️ (scanner) → RECON 🔎 (news extraction) → VERIFY ✅ (fact-check) → SIGNAL 📡 (narratives) → CHIEF 🧠 (final report) |
| 🧪 **Strategy Lab (backtester)** | 5 classic strategies ko saalon ke real data pe test karo — total return, CAGR, max drawdown, trades, win rate, Buy & Hold comparison. **"Paisa banane wali strategy dhundhne" ka honest tareeka** |
| 💰 **SIP Calculator** | Compounding maths — slow lekin real wealth ka formula |
| 📰 **News** | Har symbol ki latest news dashboard me |
| 📄 **Report Generator** | Poora markdown report — web se download karo ya CLI se banao |
| 💰 **100% FREE** | Groq free-tier LLM + Yahoo Finance data |

**Demo mode:** AI key nahi hai? UI phir bhi poora chalega — rule-based demo analysis ke saath.
Network blocked hai? Realistic demo data ke saath chalega (badge me clearly likha rahega).

---

## 🚀 2-Minute Setup

### Apne computer pe (recommended — real live data)

1. Ye repo/folder download karo
2. `market-intel` folder me jao
3. **Windows:** `run.bat` double-click karo · **Mac/Linux:** `./run.sh` chalao
4. Browser me `http://localhost:8000` khul jayega ✅

> Pehli baar chalate waqt Python packages install honge (2-3 min). Python 3.10+ chahiye.

### Free AI key lo (optional, 2 minute)

1. 👉 [console.groq.com](https://console.groq.com) kholo → Google/GitHub se sign in
2. **API Keys → Create API Key** → copy karo
3. Web app me **⚙ Settings** me paste karke Save karo

Bas — ab **Run Intelligence Team** dabaao aur full AI report paao.
(Groq free tier ≈ 30 requests/min — ek team-run me sirf 5 lagti hain.)

### CLI report (terminal lovers ke liye)

```bash
python report.py                                # default India+US watchlist
python report.py RELIANCE.NS AAPL TSLA          # custom symbols
python report.py --ai --focus "IT sector view"  # AI team ke saath (key .env me)
```

Report `reports/` folder me save hoti hai.

---

## 🤖 AI Providers

| Provider | Cost | Default Model | Key kahan se |
|---|---|---|---|
| **Groq** (default) | **FREE** | `openai/gpt-oss-120b` | [console.groq.com/keys](https://console.groq.com/keys) |
| xAI Grok | Paid | `grok-4-fast` | [console.x.ai](https://console.x.ai) |
| Custom | — | koi bhi | koi bhi OpenAI-compatible endpoint |

Provider Settings me switch karo, ya `.env` file banao (`.env.example` se copy karo):

```env
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b   # optional
```

> 🔒 Key sirf aapke browser/local env me rehti hai — request seedha provider ko jaati hai.

---

## 🏗️ Architecture

```
market-intel/
├── app.py               # FastAPI server (UI + API)
├── report.py            # CLI report generator
├── core/
│   ├── data.py          # Data: Yahoo → Stooq → Demo (auto-fallback)
│   ├── technicals.py    # RSI / SMA / MACD / signals (pure Python)
│   ├── agents.py        # 5-agent AI pipeline (OpenAI-compatible)
│   └── demo_data.py     # Offline fallback data
├── static/              # Dashboard (HTML/CSS/JS — zero dependencies)
├── run.sh / run.bat     # One-click starters
└── requirements.txt
```

**API endpoints:** `POST /api/quotes` · `POST /api/news` · `POST /api/analyze` ·
`POST /api/report` · `GET /api/status`

### Cloud pe free deploy (Render.com)

1. [render.com](https://render.com) pe new **Web Service** banao (free plan)
2. Repo connect karo, **Root Directory:** `market-intel`
3. **Build:** `pip install -r requirements.txt` · **Start:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
4. Environment variable `GROQ_API_KEY` set karo (optional)

---

## ⚠️ Disclaimer

Ye tool **research aur education** ke liye hai. Signals mathematical formulas se computed
hain; AI output data-grounded ho tab bhi **investment advice NAHI hai**. Trading me paisa
lagane se pehle apna research karo. Market ka risk sabke paas hai. 🙏
