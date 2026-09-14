(function () {
  "use strict";

  var CHARTS = "/charts/";
  var SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT"];
  var NAMES = {
    BTCUSDT: "Bitcoin",
    ETHUSDT: "Ethereum",
    SOLUSDT: "Solana",
    BNBUSDT: "BNB",
    XRPUSDT: "XRP",
    DOGEUSDT: "Dogecoin",
  };

  function fmtPrice(n) {
    if (!Number.isFinite(n)) return "—";
    var abs = Math.abs(n);
    if (abs >= 1000) {
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (abs >= 1) {
      return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
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
    var sign = pct > 0 ? "+" : "";
    return sign + pct.toFixed(2) + "%";
  }

  function chartUrl(symbol) {
    return CHARTS + "?symbol=" + encodeURIComponent(symbol);
  }

  function sparkPath(closes, w, h) {
    if (!closes.length) return "";
    var min = Math.min.apply(null, closes);
    var max = Math.max.apply(null, closes);
    var span = max - min || 1;
    return closes
      .map(function (c, i) {
        var x = (i / Math.max(closes.length - 1, 1)) * (w - 4) + 2;
        var y = h - ((c - min) / span) * (h - 6) - 3;
        return (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1);
      })
      .join(" ");
  }

  async function fetchQuote(symbol) {
    var res = await fetch("/crypto-api/prices/" + encodeURIComponent(symbol) + "/?timeframe=1d", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("quote " + res.status);
    var raw = await res.json();
    var price = Number(raw.price);
    var open = Number(raw.open);
    var changePct = open ? ((price - open) / open) * 100 : 0;
    return {
      symbol: symbol,
      price: price,
      open: open,
      high: Number(raw.high),
      low: Number(raw.low),
      volume: Number(raw.volume),
      changePct: changePct,
    };
  }

  async function fetchHistory(symbol, limit) {
    var url =
      "/crypto-chart/history?symbol=" +
      encodeURIComponent(symbol.toLowerCase()) +
      "&timeframe=1h&limit=" +
      (limit || 48) +
      "&group=1";
    var res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("history " + res.status);
    var raw = await res.json();
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.bars)) return raw.bars;
    if (raw && Array.isArray(raw.data)) return raw.data;
    return [];
  }

  function setChg(el, pct) {
    if (!el) return;
    el.textContent = pctText(pct);
    el.classList.remove("up", "down");
    var cls = pctClass(pct);
    if (cls) el.classList.add(cls);
  }

  function applyQuote(q) {
    document.querySelectorAll('.mini-card[data-symbol="' + q.symbol + '"]').forEach(function (card) {
      var price = card.querySelector(".mini-price, [data-price]");
      var chg = card.querySelector("[data-chg], .chg");
      if (price) price.textContent = "$" + fmtPrice(q.price);
      if (chg) setChg(chg, q.changePct);
    });

    document.querySelectorAll('.pv-row[data-symbol="' + q.symbol + '"]').forEach(function (row) {
      var b = row.querySelector("b[data-price], b");
      var i = row.querySelector("i[data-chg], i");
      if (b) b.textContent = fmtPrice(q.price);
      if (i) setChg(i, q.changePct);
    });

    if (q.symbol === "BTCUSDT") {
      document.querySelectorAll("[data-preview-price]").forEach(function (el) {
        el.textContent = "$" + fmtPrice(q.price);
      });
      document.querySelectorAll("[data-preview-chg]").forEach(function (el) {
        setChg(el, q.changePct);
      });
    }

    document.querySelectorAll('#markets-body tr[data-symbol="' + q.symbol + '"]').forEach(function (row) {
      var cells = row.querySelectorAll("td");
      if (cells.length < 7) return;
      cells[1].textContent = "$" + fmtPrice(q.price);
      setChg(cells[2], q.changePct);
      cells[3].textContent = "$" + fmtPrice(q.high);
      cells[4].textContent = "$" + fmtPrice(q.low);
      cells[5].textContent = fmtVol(q.volume);
    });

    document.querySelectorAll('.ft-item[data-symbol="' + q.symbol + '"]').forEach(function (item) {
      var price = item.querySelector(".ft-price");
      var chg = item.querySelector(".ft-chg");
      if (price) price.textContent = "$" + fmtPrice(q.price);
      if (chg) setChg(chg, q.changePct);
    });

    document.querySelectorAll('[data-mover="' + q.symbol + '"]').forEach(function (mover) {
      var i = mover.querySelector("i[data-chg], i");
      if (i) setChg(i, q.changePct);
      var bar = mover.querySelector(".bar");
      if (bar) {
        var w = Math.min(100, Math.max(12, Math.abs(q.changePct) * 12));
        bar.style.setProperty("--w", w.toFixed(0) + "%");
      }
    });
  }

  function buildMarketsTable() {
    var body = document.getElementById("markets-body");
    if (!body) return;
    body.innerHTML = SYMBOLS.map(function (sym) {
      var short = sym.replace("USDT", "");
      var coin = short.toLowerCase();
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
    var el = document.getElementById("footer-ticker");
    if (!el) return;
    var once = SYMBOLS.map(function (sym) {
      var short = sym.replace("USDT", "");
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
      SYMBOLS.slice(0, 4).map(async function (sym) {
        try {
          var bars = await fetchHistory(sym, 24);
          var closes = bars
            .map(function (b) {
              return Number(b[4]);
            })
            .filter(Number.isFinite);
          if (!closes.length) return;
          var path = sparkPath(closes, 72, 24);
          var card = document.querySelector('.mini-card[data-symbol="' + sym + '"]');
          if (!card) return;
          var spark = card.querySelector("[data-spark]");
          if (spark) {
            spark.setAttribute("d", path);
            var up = closes[closes.length - 1] >= closes[0];
            spark.style.stroke = up ? "var(--green)" : "var(--red)";
          }
        } catch (err) {
          console.warn("spark", sym, err);
        }
      })
    );
  }

  async function renderPreviewChart(symbol) {
    var line = document.getElementById("preview-line");
    var area = document.getElementById("preview-area");
    if (!line || !area) return;
    try {
      var bars = await fetchHistory(symbol, 48);
      var closes = bars
        .map(function (b) {
          return Number(b[4]);
        })
        .filter(Number.isFinite);
      if (!closes.length) return;
      var d = sparkPath(closes, 520, 220);
      line.setAttribute("d", d);
      area.setAttribute("d", d + " L520 220 L0 220 Z");
      var last = closes[closes.length - 1];
      var first = closes[0];
      var pct = first ? ((last - first) / first) * 100 : 0;
      document.querySelectorAll("[data-preview-price]").forEach(function (el) {
        el.textContent = "$" + fmtPrice(last);
      });
      document.querySelectorAll("[data-preview-chg]").forEach(function (el) {
        setChg(el, pct);
      });
      var score = document.getElementById("sentiment-score");
      if (score) {
        var s = Math.max(0, Math.min(99, Math.round(50 + pct * 4)));
        score.textContent = String(s);
        var ring = score.closest(".gauge-ring");
        if (ring) {
          ring.style.background =
            "conic-gradient(#2f7bff 0 " + s + "%, rgba(255,255,255,0.08) " + s + "% 100%)";
        }
      }
    } catch (err) {
      console.warn("preview chart", err);
    }
  }

  async function refreshQuotes() {
    var results = await Promise.allSettled(
      SYMBOLS.map(function (s) {
        return fetchQuote(s);
      })
    );
    results.forEach(function (r) {
      if (r.status === "fulfilled") applyQuote(r.value);
    });
  }

  function hydrateProfileChip() {
    var chip = document.getElementById("nav-avatar");
    if (!chip) return;
    try {
      var profile = JSON.parse(localStorage.getItem("forge.userProfile") || "null");
      if (!profile) return;
      var name = profile.displayName || profile.name || "";
      if (!name) return;
      var parts = String(name).trim().split(/\s+/);
      chip.textContent = parts
        .slice(0, 2)
        .map(function (p) {
          return p.charAt(0).toUpperCase();
        })
        .join("") || "F";
      chip.title = name;
    } catch (_) {}
  }

  function wireHeroSearch() {
    var form = document.querySelector(".hero-search");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = form.querySelector('input[name="symbol"]');
      var q = (input && input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")) || "";
      if (!q) {
        window.location.href = CHARTS;
        return;
      }
      if (!q.endsWith("USDT") && q.length <= 6) q += "USDT";
      window.location.href = chartUrl(q);
    });
  }

  function wireGetStarted() {
    var btn = document.querySelector('.btn-primary[href="/charts/"]');
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      try {
        var profile = JSON.parse(localStorage.getItem("forge.userProfile") || "null");
        if (profile && profile.defaultSymbol) {
          e.preventDefault();
          window.location.href = chartUrl(profile.defaultSymbol);
        }
      } catch (_) {}
    });
  }

  function wireNavSearch() {
    var input = document.querySelector(".nav-search input");
    if (!input) return;
    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      var q = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!q) return;
      if (!q.endsWith("USDT") && q.length <= 6) q += "USDT";
      window.location.href = chartUrl(q);
    });
  }

  function wireMarketsRows() {
    var body = document.getElementById("markets-body");
    if (!body) return;
    body.addEventListener("click", function (e) {
      if (e.target.closest("a")) return;
      var row = e.target.closest("tr[data-symbol]");
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
