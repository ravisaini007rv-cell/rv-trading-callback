/* RV Market Intelligence — frontend logic */
"use strict";

/* ── state ─────────────────────────────────────────────────── */
const DEFAULT_WATCHLIST = [
  "^NSEI", "^NSEBANK", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS",
  "ICICIBANK.NS", "INFY.NS", "TATAMOTORS.NS",
  "^GSPC", "^IXIC", "AAPL", "MSFT", "NVDA", "TSLA",
];

const store = {
  get watchlist() { try { return JSON.parse(localStorage.rvWatchlist) || DEFAULT_WATCHLIST; }
    catch { return DEFAULT_WATCHLIST; } },
  set watchlist(v) { localStorage.rvWatchlist = JSON.stringify(v); },
  get settings() { try { return JSON.parse(localStorage.rvSettings) || {}; } catch { return {}; } },
  set settings(v) { localStorage.rvSettings = JSON.stringify(v); },
};

let QUOTES = [];          // last quote bundle
let DATA_MODE = null;     // "live" | "demo"
let aiRunning = false;

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

/* ── helpers ───────────────────────────────────────────────── */
const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const USD = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function fmtMoney(v, cur) { return v == null ? "—" : (cur === "INR" ? "₹" : "$") + INR.format(v); }

function isIndia(sym) { return sym.endsWith(".NS") || sym.endsWith(".BO") || sym === "^NSEI" || sym === "^NSEBANK"; }

async function api(path, body) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
  return data;
}

/* ── markdown mini-renderer ────────────────────────────────── */
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function renderMD(md) {
  const lines = esc(md).split("\n");
  let html = "", inCode = false, inList = null, tableBuf = [];
  const flushList = () => { if (inList) { html += `</${inList}>`; inList = null; } };
  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf.filter(r => !/^\|[\s:|-]+\|$/.test(r.trim()));
    let t = "<table>";
    rows.forEach((r, i) => {
      const cells = r.split("|").slice(1, -1).map(c => c.trim());
      const tag = i === 0 ? "th" : "td";
      t += "<tr>" + cells.map(c => `<${tag}>${inline(c)}</${tag}>`).join("") + "</tr>";
    });
    html += t + "</table>"; tableBuf = [];
  };
  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|\W)\*([^*]+)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) { flushList(); flushTable(); inCode = !inCode; html += inCode ? "<pre><code>" : "</code></pre>"; continue; }
    if (inCode) { html += raw + "\n"; continue; }
    if (/^\|.*\|$/.test(line.trim())) { flushList(); tableBuf.push(line.trim()); continue; }
    flushTable();
    if (/^#{1,4}\s/.test(line)) {
      flushList();
      const m = line.match(/^(#{1,4})\s+(.*)/);
      html += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) { flushList(); html += "<hr>"; }
    else if (/^[-*]\s+/.test(line)) {
      if (inList !== "ul") { flushList(); html += "<ul>"; inList = "ul"; }
      html += `<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else if (/^\d+\.\s+/.test(line)) {
      if (inList !== "ol") { flushList(); html += "<ol>"; inList = "ol"; }
      html += `<li>${inline(line.replace(/^\d+\.\s+/, ""))}</li>`;
    } else if (line.trim() === "") { flushList(); }
    else { flushList(); html += `<p>${inline(line)}</p>`; }
  }
  flushList(); flushTable();
  return html;
}

/* ── tabs ──────────────────────────────────────────────────── */
$$(".tab").forEach(btn => btn.addEventListener("click", () => {
  $$(".tab").forEach(b => b.classList.remove("active"));
  $$(".tabpane").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  $(`#tab-${btn.dataset.tab}`).classList.add("active");
}));

/* ── dashboard ─────────────────────────────────────────────── */
function renderChips() {
  const box = $("#chips"); box.innerHTML = "";
  store.watchlist.forEach(sym => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${esc(sym)} <span class="x" title="remove">✕</span>`;
    chip.querySelector(".x").onclick = () => {
      store.watchlist = store.watchlist.filter(s => s !== sym);
      renderChips(); loadQuotes();
    };
    box.appendChild(chip);
  });
}

function sparkline(canvas, closes, up) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 220, h = 44;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  const col = up ? "#45dbaa" : "#ff5c72";
  grad.addColorStop(0, up ? "#45dbaa22" : "#ff5c7222");
  grad.addColorStop(1, "#0000");
  ctx.beginPath();
  closes.forEach((c, i) => {
    const x = (i / (closes.length - 1)) * w;
    const y = h - 4 - ((c - min) / span) * (h - 10);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
}

function sigClass(sig) {
  if (sig?.includes("BUY")) return "sig-buy";
  if (sig?.includes("SELL")) return "sig-sell";
  return "sig-hold";
}

function renderCards() {
  const inBox = $("#cards-in"), usBox = $("#cards-us");
  inBox.innerHTML = ""; usBox.innerHTML = "";
  const inSyms = QUOTES.filter(q => q.region === "IN");
  const usSyms = QUOTES.filter(q => q.region !== "IN");
  $("#grid-in").style.display = inSyms.length ? "" : "none";
  $("#grid-us").style.display = usSyms.length ? "" : "none";

  for (const q of [...inSyms, ...usSyms]) {
    const t = q.technicals;
    const up = q.change_pct >= 0;
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <span class="src-dot ${q.source === "demo" ? "demo" : "live"}"
            title="${q.source === "demo" ? "DEMO data" : "LIVE data"}"></span>
      <div class="top">
        <div><div class="sym">${esc(q.symbol)}</div><div class="nm">${esc(q.name)}</div></div>
        <span class="pill ${up ? "up" : "down"}">${q.change_pct >= 0 ? "+" : ""}${q.change_pct}%</span>
      </div>
      <div class="price">${fmtMoney(q.price, q.currency)}</div>
      <div class="chg ${up ? "up" : "down"}">${up ? "▲" : "▼"} ${fmtMoney(Math.abs(q.change), q.currency)} today</div>
      <canvas></canvas>
      <div class="foot">
        <span class="sig ${sigClass(t.signal)}">${t.signal}</span>
        <span class="mini">RSI ${t.rsi14 ?? "—"} · 52w ${t.pos_52w ?? "—"}%</span>
      </div>`;
    card.onclick = () => openDetail(q);
    (isIndia(q.symbol) ? inBox : usBox).appendChild(card);
    requestAnimationFrame(() => sparkline(card.querySelector("canvas"), q.spark, up));
  }
}

async function loadQuotes() {
  const syms = store.watchlist;
  if (!syms.length) { $("#cards-in").innerHTML = `<p class="muted">Watchlist khaali hai — upar se symbols add karo.</p>`; return; }
  try {
    const res = await api("/api/quotes", { symbols: syms });
    QUOTES = res.quotes; DATA_MODE = res.mode;
    renderCards(); updateBadges();
  } catch (e) {
    $("#cards-in").innerHTML = `<p class="muted">❌ Data load fail: ${esc(e.message)}</p>`;
  }
}

function updateBadges() {
  const d = $("#badge-data");
  if (DATA_MODE) { d.textContent = `DATA ${DATA_MODE.toUpperCase()}`; d.className = "badge " + DATA_MODE; }
  const s = store.settings;
  const aiOn = !!(s.apiKey);
  const a = $("#badge-ai");
  a.textContent = aiOn ? `AI ON (${s.provider || "groq"})` : "AI OFF — DEMO";
  a.className = "badge " + (aiOn ? "ai-on" : "demo");
  $("#rep-ai").disabled = !aiOn;
}

/* ── detail modal ──────────────────────────────────────────── */
async function openDetail(q) {
  const m = $("#modal"), box = $("#modal-content");
  const t = q.technicals;
  box.innerHTML = `
    <h2 style="margin-top:0">${esc(q.symbol)} <span class="muted small" style="font-weight:400">${esc(q.name)}</span></h2>
    <div class="price" style="font-size:26px;font-weight:800">${fmtMoney(q.price, q.currency)}
      <span class="chg ${q.change_pct >= 0 ? "up" : "down"}">${q.change_pct >= 0 ? "▲" : "▼"} ${q.change_pct}%</span></div>
    <div class="muted small">As of ${esc(q.date)} · ${q.source.toUpperCase()} data</div>
    <table class="ttable" style="margin-top:14px">
      ${[["Open", fmtMoney(q.open, q.currency)], ["Prev close", fmtMoney(q.prev_close, q.currency)],
         ["Day range", `${fmtMoney(q.day_low, q.currency)} – ${fmtMoney(q.day_high, q.currency)}`],
         ["RSI (14)", t.rsi14 ?? "—"], ["SMA 20 / 50 / 200",
         `${t.sma20 ?? "—"} / ${t.sma50 ?? "—"} / ${t.sma200 ?? "—"}`],
         ["MACD histogram", t.macd_hist ?? "—"],
         ["52W high / low", `${fmtMoney(t.high_52w, q.currency)} / ${fmtMoney(t.low_52w, q.currency)}`],
         ["% from 52W high", `${t.from_high_52w}%`],
         ["Volume vs 20d avg", t.vol_ratio ? `${t.vol_ratio}×` : "—"],
        ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}
    </table>
    <div style="margin:16px 0 8px"><span class="sig ${sigClass(t.signal)}" style="font-size:13px">${t.signal}</span>
      <span class="muted small"> (score ${t.score})</span></div>
    <ul class="reasons">${t.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul>
    <h3>📰 Latest news <span class="muted small" id="news-src"></span></h3>
    <div id="news-box"><span class="spin"></span> news load ho rahi hai…</div>
    <div class="btnrow"><button class="primary" id="detail-ai">🤖 Is symbol ko AI Team se analyze karo</button></div>`;
  m.classList.remove("hidden");
  $("#detail-ai").onclick = () => {
    m.classList.add("hidden");
    $("#ai-focus").value = `Focus on ${q.symbol} (${q.name}) — kya trend support karta hai?`;
    switchTab("ai"); runTeam(false);
  };
  try {
    const n = await api("/api/news", { symbol: q.symbol });
    $("#news-src").textContent = `(${n.source})`;
    $("#news-box").innerHTML = n.items.length
      ? n.items.map(i => `<div class="news-item">
          <a href="${esc(i.link || "#")}" ${i.link ? 'target="_blank" rel="noopener"' : ""}>${esc(i.title)}</a>
          <div class="meta">${esc(i.publisher)}${i.published ? " · " + esc(i.published) : ""}</div>
        </div>`).join("")
      : `<p class="muted small">Koi news nahi mili.</p>`;
  } catch {
    $("#news-box").innerHTML = `<p class="muted small">News load fail.</p>`;
  }
}
function switchTab(id) {
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === id));
  $$(".tabpane").forEach(p => p.classList.toggle("active", p.id === `tab-${id}`));
}

/* ── AI team ───────────────────────────────────────────────── */
const AGENT_META = [
  ["scout", "🛰️", "SCOUT", "Market scanner"],
  ["recon", "🔎", "RECON", "News extraction"],
  ["verify", "✅", "VERIFY", "Fact-checker"],
  ["signal", "📡", "SIGNAL", "Narrative mapper"],
  ["chief", "🧠", "CHIEF", "Final report"],
];

function agentStep(id, state) {
  let el = $(`#step-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.className = "step"; el.id = `step-${id}`;
    const meta = AGENT_META.find(a => a[0] === id);
    el.className += id === "chief" ? " final" : "";
    el.innerHTML = `
      <div class="step-head" onclick="this.parentNode.classList.toggle('open')">
        <span style="font-size:19px">${meta[1]}</span>
        <div><div class="a-name">${meta[2]}</div><div class="a-role">${meta[3]}</div></div>
        <span class="a-state"></span>
      </div>
      <div class="step-body md"></div>`;
    $("#ai-output").appendChild(el);
  }
  const head = el.querySelector(".a-state");
  el.classList.remove("done", "running");
  if (state === "running") { el.classList.add("running"); head.innerHTML = `<span class="spin"></span> working…`; }
  if (state === "waiting") { head.textContent = "⏳ queued"; }
  if (state === "done") { el.classList.add("done"); head.textContent = "✅"; }
  return el;
}

async function runTeam(demo) {
  if (aiRunning) return;
  const syms = store.watchlist.slice(0, 15);
  if (!syms.length) { $("#ai-status").textContent = "⚠️ Watchlist khaali hai."; return; }

  const s = store.settings;
  const hasKey = !!(s.apiKey);
  if (!demo && !hasKey) { demo = true; }

  aiRunning = true;
  $("#ai-output").innerHTML = "";
  $("#btn-run-ai").disabled = true; $("#btn-run-demo").disabled = true;
  $("#ai-status").textContent = demo
    ? " DEMO run — rule-based sample output (AI key nahi hai)…"
    : `▶ AI Team start — ${s.provider || "groq"} · ${s.model || "default model"}…`;

  AGENT_META.forEach(a => agentStep(a[0], "waiting"));

  try {
    const body = {
      symbols: syms,
      focus: $("#ai-focus").value.trim(),
      demo: !!demo,
      provider: s.provider || "groq",
      api_key: demo ? undefined : s.apiKey,
      model: s.model || undefined,
      base_url: s.base || undefined,
    };
    const res = await api("/api/analyze", body);
    $("#ai-status").textContent =
      res.mode === "demo"
        ? "✅ Demo run complete — Settings me free key daalo for full AI."
        : `✅ AI Team complete (${res.model || ""}) · data ${res.data_mode?.toUpperCase()}`;
    res.steps.forEach(st => {
      const el = agentStep(st.agent, "done");
      el.querySelector(".step-body").innerHTML = renderMD(st.content);
      el.classList.add("open");
      if (st.agent === "chief") el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } catch (e) {
    $("#ai-status").innerHTML = `❌ <b>${esc(e.message)}</b>`;
    AGENT_META.forEach(a => agentStep(a[0], "waiting"));
  } finally {
    aiRunning = false;
    $("#btn-run-ai").disabled = false; $("#btn-run-demo").disabled = false;
  }
}

/* ── report ────────────────────────────────────────────────── */
async function generateReport() {
  const syms = store.watchlist.slice(0, 15);
  if (!syms.length) { $("#rep-status").textContent = "⚠️ Watchlist khaali hai."; return; }
  const btn = $("#btn-report");
  btn.disabled = true;
  $("#rep-status").textContent = "⏳ Report ban rahi hai… (AI on ho to 1-2 min lag sakta hai)";
  const s = store.settings;
  try {
    const useAI = $("#rep-ai").checked && !!s.apiKey;
    const res = await api("/api/report", {
      symbols: syms, use_ai: useAI, focus: $("#ai-focus").value.trim(),
      provider: s.provider || "groq", api_key: useAI ? s.apiKey : undefined,
      model: s.model || undefined, base_url: s.base || undefined,
    });
    $("#rep-status").textContent = `✅ Ready (${res.filename}) · data ${res.data_mode.toUpperCase()} · AI ${res.ai_included ? "ON" : "OFF"}`;
    $("#rep-output").innerHTML = `
      <div class="panel">
        <div class="btnrow">
          <button class="primary" id="rep-dl">⬇ Download ${esc(res.filename)}</button>
        </div>
        <div class="md" style="margin-top:14px">${renderMD(res.markdown)}</div>
      </div>`;
    $("#rep-dl").onclick = () => {
      const blob = new Blob([res.markdown], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = res.filename; a.click();
      URL.revokeObjectURL(a.href);
    };
  } catch (e) {
    $("#rep-status").innerHTML = `❌ <b>${esc(e.message)}</b>`;
  } finally { btn.disabled = false; }
}

/* ── settings ──────────────────────────────────────────────── */
const PROVIDER_INFO = {
  groq: { base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyUrl: "https://console.groq.com/keys" },
  xai: { base: "https://api.x.ai/v1", model: "grok-4-fast", keyUrl: "https://console.x.ai" },
  custom: { base: "", model: "", keyUrl: "" },
};

function openSettings() {
  const s = store.settings;
  $("#set-provider").value = s.provider || "groq";
  $("#set-key").value = s.apiKey || "";
  $("#set-model").value = s.model || "";
  $("#set-base").value = s.base || "";
  providerHint();
  $("#settings").classList.remove("hidden");
}
function providerHint() {
  const p = $("#set-provider").value;
  const info = PROVIDER_INFO[p];
  $("#key-help").innerHTML = p === "groq"
    ? `— free key: <a href="${info.keyUrl}" target="_blank" rel="noopener">console.groq.com/keys</a>`
    : p === "xai" ? `— key: <a href="${info.keyUrl}" target="_blank" rel="noopener">console.x.ai</a>` : "";
  $("#set-model").placeholder = info.model || "model id";
  $("#set-base").placeholder = info.base || "https://…/v1";
}
function saveSettings() {
  const s = {
    provider: $("#set-provider").value,
    apiKey: $("#set-key").value.trim(),
    model: $("#set-model").value.trim(),
    base: $("#set-base").value.trim(),
  };
  store.settings = s;
  updateBadges();
  $("#settings").classList.add("hidden");
  if (!s.apiKey) switchTab("help");
}

/* ── search (Groww-jaisa autocomplete) ────────────────────────── */
let searchTimer = null;
let searchResults = [];

const REGION_FLAG = { IN: "🇮🇳", US: "🇺🇸", IDX: "📊", CRYPTO: "₿" };

function hideDrop() { $("#search-drop").classList.add("hidden"); }

function renderDrop() {
  const drop = $("#search-drop");
  if (!searchResults.length) {
    drop.innerHTML = `<div class="drop-row muted">Kuch nahi mila — exact symbol try karo (e.g. WIPRO.NS)</div>`;
  } else {
    drop.innerHTML = searchResults.map((r, i) => `
      <div class="drop-row ${i === 0 ? "first" : ""}" data-sym="${esc(r.symbol)}">
        <span class="d-flag">${REGION_FLAG[r.region] || "🔹"}</span>
        <span class="d-sym">${esc(r.symbol.replace(".NS", "").replace(".BO", ""))}</span>
        <span class="d-name">${esc(r.name)}</span>
        ${r.exch ? `<span class="d-exch">${esc(r.exch)}</span>` : ""}
      </div>`).join("");
    drop.querySelectorAll(".drop-row[data-sym]").forEach(row => {
      row.onclick = () => addSymbol(row.dataset.sym);
    });
  }
  drop.classList.remove("hidden");
}

function addSymbol(sym) {
  sym = (sym || "").trim().toUpperCase();
  if (!sym) return;
  if (!store.watchlist.includes(sym)) {
    store.watchlist = [...store.watchlist, sym];
    renderChips(); loadQuotes();
  }
  const inp = $("#add-symbol");
  inp.value = ""; hideDrop(); inp.blur();
}

$("#add-symbol").addEventListener("input", (e) => {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  if (q.length < 1) { hideDrop(); return; }
  searchTimer = setTimeout(async () => {
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      searchResults = d.results || [];
      renderDrop();
    } catch { hideDrop(); }
  }, 250);
});
$("#add-symbol").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (!$("#search-drop").classList.contains("hidden") && searchResults.length)
      addSymbol(searchResults[0].symbol);
    else addSymbol(e.target.value);
  }
  if (e.key === "Escape") hideDrop();
});
$("#add-symbol").addEventListener("blur", () => setTimeout(hideDrop, 200));
$("#add-symbol").addEventListener("focus", (e) => {
  if (e.target.value.trim() && searchResults.length) renderDrop();
});

/* ── phone connect ───────────────────────────────────────────── */
async function openPhone() {
  $("#phone").classList.remove("hidden");
  const urlEl = $("#lan-url");
  urlEl.textContent = "pata kar rahe hain…";
  try {
    const r = await fetch("/api/network");
    const d = await r.json();
    const url = d.url || "http://localhost:8000";
    urlEl.textContent = url;
    $("#lan-qr").src = "https://api.qrserver.com/v1/create-qr-code/?size=190x190&data=" +
                        encodeURIComponent(url);
    $("#lan-copy").onclick = () => {
      navigator.clipboard?.writeText(url);
      $("#lan-copy").textContent = "✓ Copied";
      setTimeout(() => { $("#lan-copy").textContent = "Copy"; }, 1500);
    };
  } catch {
    urlEl.textContent = "http://<computer-ka-IP>:8000 (server se pooch nahi paaya)";
  }
}

/* ── wire up ───────────────────────────────────────────────── */
$("#btn-add").onclick = () => addSymbol($("#add-symbol").value);
$("#btn-reset").onclick = () => { store.watchlist = [...DEFAULT_WATCHLIST]; renderChips(); loadQuotes(); };
$("#btn-refresh").onclick = loadQuotes;
$("#btn-run-ai").onclick = () => runTeam(false);
$("#btn-run-demo").onclick = () => runTeam(true);
$("#btn-report").onclick = generateReport;
$("#btn-settings").onclick = openSettings;
$("#btn-phone").onclick = openPhone;
$("#phone-close").onclick = () => $("#phone").classList.add("hidden");
$("#phone").onclick = (e) => { if (e.target.id === "phone") $("#phone").classList.add("hidden"); };
$("#set-provider").onchange = providerHint;
$("#set-save").onclick = saveSettings;
$("#set-clear").onclick = () => { $("#set-key").value = ""; saveSettings(); };
$("#modal-close").onclick = () => $("#modal").classList.add("hidden");
$("#settings-close").onclick = () => $("#settings").classList.add("hidden");
$("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").classList.add("hidden"); };
$("#settings").onclick = (e) => { if (e.target.id === "settings") $("#settings").classList.add("hidden"); };

/* boot */
renderChips();
loadQuotes();
updateBadges();
setInterval(() => { if (!aiRunning && $("#tab-dashboard").classList.contains("active")) loadQuotes(); }, 90000);
