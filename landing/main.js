(() => {
  "use strict";

  const CHARTS = "/charts/";
  const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
  const NAMES = {
    BTCUSDT: "Bitcoin",
    ETHUSDT: "Ethereum",
    SOLUSDT: "Solana",
    BNBUSDT: "BNB",
    XRPUSDT: "XRP",
    DOGEUSDT: "Dogecoin",
  };
  const PROFILE_KEY = "forge.userProfile";

  function fmtPrice(n) {
    if (!Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1000) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 1) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  }

  function fmtVol(n) {
    if (!Number.isFinite(n)) return "—";
    if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return String(Math.round(n));
  }

  function pctClass(pct) {
    if (!Number.isFinite(pct) || pct === 0) return "";
    return pct > 0 ? "up" : "down";
  }

  function pctText(pct) {
    if (!Number.isFinite(pct)) return "—";
    return (pct > 0 ? "+" : "") + pct.toFixed(2) + "%";
  }

  function chartUrl(symbol) {
    return CHARTS + "?symbol=" + encodeURIComponent(symbol);
  }

  function sparkPath(closes, w, h) {
    if (!closes.length) return "";
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    return closes
      .map((c, i) => {
        const x = (i / Math.max(closes.length - 1, 1)) * (w - 4) + 2;
        const y = h - ((c - min) / span) * (h - 6) - 3;
        return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
      })
      .join(" ");
  }

  async function fetchQuote(symbol) {
    const res = await fetch("/crypto-api/prices/" + encodeURIComponent(symbol) + "/?timeframe=1d", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("quote " + res.status);
    const raw = await res.json();
    const price = Number(raw.price);
    const open = Number(raw.open);
    return {
      symbol,
      price,
      open,
      high: Number(raw.high),
      low: Number(raw.low),
      volume: Number(raw.volume),
      changePct: open ? ((price - open) / open) * 100 : 0,
    };
  }

  async function fetchHistory(symbol, limit = 48) {
    const url =
      "/crypto-chart/history?symbol=" +
      encodeURIComponent(symbol.toLowerCase()) +
      "&timeframe=1h&limit=" +
      limit +
      "&group=1";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("history " + res.status);
    const raw = await res.json();
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.bars)) return raw.bars;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }

  function setChg(el, pct) {
    if (!el) return;
    el.textContent = pctText(pct);
    el.classList.remove("up", "down");
    const cls = pctClass(pct);
    if (cls) el.classList.add(cls);
  }

  function applyQuote(q) {
    document.querySelectorAll('.mini-card[data-symbol="' + q.symbol + '"]').forEach((card) => {
      const price = card.querySelector(".mini-price, [data-price]");
      const chg = card.querySelector("[data-chg], .chg");
      if (price) price.textContent = "$" + fmtPrice(q.price);
      if (chg) setChg(chg, q.changePct);
    });

    document.querySelectorAll('.pv-row[data-symbol="' + q.symbol + '"]').forEach((row) => {
      const b = row.querySelector("b[data-price], b");
      const i = row.querySelector("i[data-chg], i");
      if (b) b.textContent = fmtPrice(q.price);
      if (i) setChg(i, q.changePct);
    });

    if (q.symbol === "BTCUSDT") {
      document.querySelectorAll("[data-preview-price]").forEach((el) => {
        el.textContent = "$" + fmtPrice(q.price);
      });
      document.querySelectorAll("[data-preview-chg]").forEach((el) => {
        setChg(el, q.changePct);
      });
    }

    document.querySelectorAll('#markets-body tr[data-symbol="' + q.symbol + '"]').forEach((row) => {
      const cells = row.querySelectorAll("td");
      if (cells.length < 7) return;
      cells[1].textContent = "$" + fmtPrice(q.price);
      setChg(cells[2], q.changePct);
      cells[3].textContent = "$" + fmtPrice(q.high);
      cells[4].textContent = "$" + fmtPrice(q.low);
      cells[5].textContent = fmtVol(q.volume);
    });

    document.querySelectorAll('.ft-item[data-symbol="' + q.symbol + '"]').forEach((item) => {
      const price = item.querySelector(".ft-price");
      const chg = item.querySelector(".ft-chg");
      if (price) price.textContent = "$" + fmtPrice(q.price);
      if (chg) setChg(chg, q.changePct);
    });

    document.querySelectorAll('[data-mover="' + q.symbol + '"]').forEach((mover) => {
      const i = mover.querySelector("i[data-chg], i");
      if (i) setChg(i, q.changePct);
      const bar = mover.querySelector(".bar");
      if (bar) {
        const w = Math.min(100, Math.max(12, Math.abs(q.changePct) * 12));
        bar.style.setProperty("--w", w.toFixed(0) + "%");
      }
    });
  }

  function buildMarketsTable() {
    const body = document.getElementById("markets-body");
    if (!body) return;
    body.innerHTML = SYMBOLS.map((sym) => {
      const short = sym.replace("USDT", "");
      const coin = short.toLowerCase();
      return (
        '<tr data-symbol="' +
        sym +
        '">' +
        '<td><span class="mkt-sym"><span class="coin coin-' +
        coin +
        '">' +
        short.charAt(0) +
        "</span><span><strong>" +
        (NAMES[sym] || short) +
        "</strong><small>" +
        sym +
        "</small></span></span></td>" +
        "<td>…</td>" +
        '<td class="chg">—</td>' +
        "<td>…</td>" +
        "<td>…</td>" +
        "<td>…</td>" +
        '<td><a class="mkt-link" href="' +
        chartUrl(sym) +
        '">Chart</a></td>' +
        "</tr>"
      );
    }).join("");
  }

  function buildFooterTicker() {
    const el = document.getElementById("footer-ticker");
    if (!el) return;
    const once = SYMBOLS.map((sym) => {
      const short = sym.replace("USDT", "");
      return (
        '<a class="ft-item" href="' +
        chartUrl(sym) +
        '" data-symbol="' +
        sym +
        '"><strong>' +
        short +
        '</strong> <span class="ft-price">…</span> <i class="ft-chg">—</i></a>'
      );
    }).join("");
    el.innerHTML = once + once;
  }

  async function renderSparks() {
    await Promise.all(
      SYMBOLS.slice(0, 4).map(async (sym) => {
        try {
          const bars = await fetchHistory(sym, 24);
          const closes = bars.map((b) => Number(b[4])).filter(Number.isFinite);
          if (!closes.length) return;
          const card = document.querySelector('.mini-card[data-symbol="' + sym + '"]');
          if (!card) return;
          const spark = card.querySelector("[data-spark]");
          if (!spark) return;
          spark.setAttribute("d", sparkPath(closes, 72, 24));
          spark.style.stroke = closes[closes.length - 1] >= closes[0] ? "var(--green)" : "var(--red)";
        } catch (err) {
          console.warn("spark", sym, err);
        }
      })
    );
  }

  async function renderPreviewChart(symbol) {
    const line = document.getElementById("preview-line");
    const area = document.getElementById("preview-area");
    if (!line || !area) return;
    try {
      const bars = await fetchHistory(symbol, 48);
      const closes = bars.map((b) => Number(b[4])).filter(Number.isFinite);
      if (!closes.length) return;
      const d = sparkPath(closes, 520, 220);
      line.setAttribute("d", d);
      area.setAttribute("d", d + " L520 220 L0 220 Z");
      const last = closes[closes.length - 1];
      const first = closes[0];
      const pct = first ? ((last - first) / first) * 100 : 0;
      document.querySelectorAll("[data-preview-price]").forEach((el) => {
        el.textContent = "$" + fmtPrice(last);
      });
      document.querySelectorAll("[data-preview-chg]").forEach((el) => {
        setChg(el, pct);
      });
      const score = document.getElementById("sentiment-score");
      if (score) {
        const s = Math.max(0, Math.min(99, Math.round(50 + pct * 4)));
        score.textContent = String(s);
        const ring = score.closest(".gauge-ring");
        if (ring) {
          ring.style.background =
            "conic-gradient(var(--blue, #2f7bff) 0 " + s + "%, rgba(255,255,255,0.08) " + s + "% 100%)";
        }
      }
    } catch (err) {
      console.warn("preview chart", err);
    }
  }

  async function refreshQuotes() {
    const results = await Promise.allSettled(SYMBOLS.map((s) => fetchQuote(s)));
    results.forEach((r) => {
      if (r.status === "fulfilled") applyQuote(r.value);
    });
  }

  function hydrateProfileChip() {
    const chip = document.getElementById("nav-avatar");
    if (!chip) return;
    try {
      const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      if (!profile) return;
      const name = profile.displayName || profile.name || "";
      if (!name) return;
      const parts = String(name).trim().split(/\s+/);
      chip.textContent =
        parts
          .slice(0, 2)
          .map((p) => p.charAt(0).toUpperCase())
          .join("") || "F";
      chip.title = name;
    } catch (_) {}
  }

  function normalizeSymbol(raw) {
    let q = String(raw || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (!q) return "";
    if (!q.endsWith("USDT") && q.length <= 6) q += "USDT";
    return q;
  }

  function wireHeroSearch() {
    const form = document.querySelector(".hero-search");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector('input[name="symbol"]');
      const q = normalizeSymbol(input && input.value);
      window.location.href = q ? chartUrl(q) : CHARTS;
    });
  }

  function wireGetStarted() {
    const btn = document.querySelector('.btn-primary[href="/charts/"]');
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      try {
        const profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
        if (profile && profile.defaultSymbol) {
          e.preventDefault();
          window.location.href = chartUrl(profile.defaultSymbol);
        }
      } catch (_) {}
    });
  }

  function wireNavSearch() {
    const input = document.querySelector(".nav-search input");
    if (!input) return;
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const q = normalizeSymbol(input.value);
      if (!q) return;
      window.location.href = chartUrl(q);
    });
  }

  function wireMarketsRows() {
    const body = document.getElementById("markets-body");
    if (!body) return;
    body.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const row = e.target.closest("tr[data-symbol]");
      if (!row) return;
      window.location.href = chartUrl(row.getAttribute("data-symbol"));
    });
  }

  async function boot() {
    buildMarketsTable();
    buildFooterTicker();
    hydrateProfileChip();
    wireHeroSearch();
    wireGetStarted();
    wireNavSearch();
    wireMarketsRows();
    await Promise.all([refreshQuotes(), renderSparks(), renderPreviewChart("BTCUSDT")]);
    setInterval(refreshQuotes, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
