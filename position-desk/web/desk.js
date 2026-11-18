const tokenInput = document.querySelector("#token");
const symbolSelect = document.querySelector("#symbol");
const feed = document.querySelector("#feed");
const clock = document.querySelector("#clock");
const sides = document.querySelector("#sides");
const entryInput = document.querySelector("#entry");
const stopInput = document.querySelector("#stop");
const targetInput = document.querySelector("#target");
const saveButton = document.querySelector("#save");
const ticketError = document.querySelector("#ticket-error");
const banner = document.querySelector("#banner");
const kicker = document.querySelector("#kicker");
const headline = document.querySelector("#headline");
const summary = document.querySelector("#summary");
const scoreEl = document.querySelector("#score");
const scoreBar = document.querySelector("#score-bar");
const scores = document.querySelector("#scores");
const reasons = document.querySelector("#reasons");
const metrics = document.querySelector("#metrics");
const canvas = document.querySelector("#spark");

const storeKey = "forge-seat-token";
let side = "flat";
let digits = 5;
let lastPositionKey = "";

tokenInput.value = localStorage.getItem(storeKey) || "";
tokenInput.addEventListener("change", () => {
  localStorage.setItem(storeKey, tokenInput.value.trim());
  refreshSymbols();
});

sides.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  side = button.dataset.side;
  for (const item of sides.querySelectorAll("button")) item.classList.toggle("on", item === button);
});

saveButton.addEventListener("click", async () => {
  ticketError.hidden = true;
  const symbol = symbolSelect.value.trim();
  if (!symbol) {
    showTicketError("Wait until a symbol arrives from MT5, or type one after the bridge connects.");
    return;
  }
  const body = {
    symbol,
    side,
    entry: numberOrNull(entryInput.value),
    stop: numberOrNull(stopInput.value),
    target: numberOrNull(targetInput.value),
    digits,
  };
  if (side !== "flat" && (body.entry == null || body.stop == null)) {
    showTicketError("A long or short needs both an entry and a stop.");
    return;
  }
  if (side === "long" && body.stop != null && body.entry != null && body.stop >= body.entry) {
    showTicketError("For a long, the stop has to be below the entry.");
    return;
  }
  if (side === "short" && body.stop != null && body.entry != null && body.stop <= body.entry) {
    showTicketError("For a short, the stop has to be above the entry.");
    return;
  }
  const response = await api("/api/position", { method: "POST", body: JSON.stringify(body) });
  if (!response.ok) {
    showTicketError("The desk rejected the ticket.");
    return;
  }
  paint(await response.json());
});

function showTicketError(text) {
  ticketError.hidden = false;
  ticketError.textContent = text;
}

function numberOrNull(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${tokenInput.value.trim()}`,
    "Content-Type": "application/json",
  };
}

async function api(path, options = {}) {
  return fetch(path, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
}

async function refreshSymbols() {
  if (!tokenInput.value.trim()) return;
  const response = await api("/api/symbols");
  if (!response.ok) {
    feed.textContent = response.status === 401 ? "bad token" : "desk unreachable";
    feed.className = "feed stale";
    return;
  }
  const payload = await response.json();
  const current = symbolSelect.value;
  const names = payload.symbols || [];
  symbolSelect.innerHTML = "";
  if (!names.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "waiting for MT5";
    symbolSelect.appendChild(option);
    return;
  }
  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    symbolSelect.appendChild(option);
  }
  if (names.includes(current)) symbolSelect.value = current;
}

async function poll() {
  tickClock();
  if (!tokenInput.value.trim()) {
    feed.textContent = "token needed";
    feed.className = "feed";
    return;
  }
  const symbol = symbolSelect.value;
  const path = symbol ? `/api/desk?symbol=${encodeURIComponent(symbol)}` : "/api/desk";
  let response;
  try {
    response = await api(path);
  } catch {
    feed.textContent = "desk unreachable";
    feed.className = "feed stale";
    return;
  }
  if (response.status === 401) {
    feed.textContent = "bad token";
    feed.className = "feed stale";
    return;
  }
  if (!response.ok) return;
  paint(await response.json());
}

function paint(desk) {
  digits = desk.digits || digits;
  const age = desk.metrics && desk.metrics.feed_age_sec;
  if (!desk.symbol) {
    feed.textContent = "no feed";
    feed.className = "feed";
  } else if (desk.connected) {
    feed.textContent = `${desk.symbol} live`;
    feed.className = "feed live";
  } else if (age == null) {
    feed.textContent = "no feed";
    feed.className = "feed";
  } else {
    feed.textContent = `stale ${Math.round(age)}s`;
    feed.className = "feed stale";
  }
  kicker.textContent = (desk.verdict || "WARMING").replaceAll("_", " ");
  headline.textContent = desk.headline || "";
  summary.textContent = desk.summary || "";
  const tone = toneFor(desk.verdict);
  banner.className = `banner ${tone}`;
  const score = Number(desk.score || 0);
  scoreEl.textContent = desk.verdict === "WARMING" ? "—" : String(score);
  scoreBar.style.width = `${Math.max(0, Math.min(100, score))}%`;
  const m = desk.metrics || {};
  scores.textContent = m.long_score == null ? "" : `long ${m.long_score} · short ${m.short_score}`;
  reasons.innerHTML = "";
  for (const reason of desk.reasons || []) {
    const item = document.createElement("li");
    item.className = reason.tone || "neutral";
    item.textContent = reason.text;
    reasons.appendChild(item);
  }
  fillMetrics(m);
  drawSpark(desk);
  syncTicket(desk);
}

function syncTicket(desk) {
  const position = desk.position;
  if (!position) return;
  const key = JSON.stringify(position);
  if (key === lastPositionKey) return;
  lastPositionKey = key;
  if (document.activeElement && ["entry", "stop", "target"].includes(document.activeElement.id)) return;
  side = position.side || "flat";
  for (const button of sides.querySelectorAll("button")) {
    button.classList.toggle("on", button.dataset.side === side);
  }
  entryInput.value = position.entry ?? "";
  stopInput.value = position.stop ?? "";
  targetInput.value = position.target ?? "";
}

function toneFor(verdict) {
  if (verdict === "SEAT_OK" || verdict === "LOCATION_VALID") return "good";
  if (verdict === "THESIS_BROKEN" || verdict === "SPREAD_STRESS") return "bad";
  if (verdict === "REVIEW_STOP" || verdict === "DO_NOT_CHASE" || verdict === "WEAK_LOCATION") return "warn";
  return "";
}

function fillMetrics(m) {
  const rows = [
    ["Price", num(m.price)],
    ["ATR 14", num(m.atr)],
    ["Structure", m.structure_text || "—"],
    ["Swing equilibrium", num(m.dealing_eq)],
    ["Volume profile", m.profile_where || "—"],
    ["POC", num(m.poc)],
    ["Value area", m.val == null ? "—" : `${num(m.val)} – ${num(m.vah)}`],
    ["Session VWAP", num(m.vwap)],
    ["VWAP z-score", m.vwap_z == null ? "—" : Number(m.vwap_z).toFixed(2)],
    ["Efficiency H1", m.efficiency_h1 == null ? "—" : Number(m.efficiency_h1).toFixed(2)],
    ["Efficiency M15", m.efficiency_m15 == null ? "—" : Number(m.efficiency_m15).toFixed(2)],
    ["Vol percentile", m.rv_percentile == null ? "—" : `${Math.round(m.rv_percentile * 100)}th`],
    ["Buy pressure", m.buy_pressure == null ? "—" : `${Math.round(m.buy_pressure * 100)}%`],
    ["Delta divergence", divergenceLabel(m.divergence)],
    ["Heat p70", m.heat_p70_atr == null ? "—" : `${Number(m.heat_p70_atr).toFixed(2)} ATR`],
    ["Your stop", m.stop_atr == null ? "—" : `${Number(m.stop_atr).toFixed(2)} ATR`],
    ["Zone", m.zone || "—"],
    ["Spread", m.spread == null ? "—" : num(m.spread)],
    ["Reward / risk", m.rr == null ? "—" : Number(m.rr).toFixed(2)],
  ];
  metrics.innerHTML = "";
  for (const [name, value] of rows) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = name;
    dd.textContent = value;
    metrics.append(dt, dd);
  }
}

function divergenceLabel(value) {
  if (value === 1) return "bullish";
  if (value === -1) return "bearish";
  if (value == null) return "—";
  return "none";
}

function num(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

function drawSpark(desk) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const points = desk.spark || [];
  if (points.length < 2) return;
  const closes = points.map((point) => point.c);
  let min = Math.min(...closes);
  let max = Math.max(...closes);
  const position = desk.position || {};
  for (const level of [position.entry, position.stop, position.target]) {
    if (level != null && level !== "") {
      min = Math.min(min, Number(level));
      max = Math.max(max, Number(level));
    }
  }
  if (max <= min) max = min + 1;
  const x = (index) => (index / (points.length - 1)) * (width - 16) + 8;
  const y = (price) => height - 12 - ((price - min) / (max - min)) * (height - 24);
  ctx.strokeStyle = "#e4ff6a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((point, index) => {
    const px = x(index);
    const py = y(point.c);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  drawLevel(ctx, y, position.entry, "#f3f1e6", width);
  drawLevel(ctx, y, position.stop, "#ff8d7a", width);
  drawLevel(ctx, y, position.target, "#c6f27a", width);
}

function drawLevel(ctx, y, level, color, width) {
  if (level == null || level === "") return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(8, y(Number(level)));
  ctx.lineTo(width - 8, y(Number(level)));
  ctx.stroke();
  ctx.setLineDash([]);
}

function tickClock() {
  clock.textContent = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()) + " Tehran";
}

symbolSelect.addEventListener("change", poll);
refreshSymbols();
poll();
setInterval(poll, 1000);
setInterval(refreshSymbols, 5000);
