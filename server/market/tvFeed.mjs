/**
 * TradingView chart socket client used for FXPro (and any EXCHANGE:SYMBOL).
 * Supercharts resolves FXPRO:XAUUSD here; the public scanner does not list FXPRO.
 */

const WS_URL = "wss://data.tradingview.com/socket.io/websocket";
const ORIGIN = "https://www.tradingview.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function pack(type, params) {
  const msg = JSON.stringify({ m: type, p: params });
  return `~m~${msg.length}~m~${msg}`;
}

function unpack(raw) {
  const out = [];
  const re = /~m~(\d+)~m~/g;
  let m;
  while ((m = re.exec(String(raw)))) {
    const chunk = String(raw).slice(m.index + m[0].length, m.index + m[0].length + Number(m[1]));
    if (chunk.startsWith("~h~")) out.push({ ping: chunk.slice(3) });
    else {
      try {
        out.push(JSON.parse(chunk));
      } catch {
        /* ignore truncated frames */
      }
    }
  }
  return out;
}

function replyPing(ws, token) {
  const body = `~h~${token}`;
  ws.send(`~m~${body.length}~m~${body}`);
}

function specFor(tvSymbol) {
  return `={"symbol":"${tvSymbol}","adjustment":"splits"}`;
}

function rowsToBars(rows) {
  const bars = [];
  for (const row of rows || []) {
    const v = row.v || [];
    const time = Number(v[0]);
    const open = Number(v[1]);
    const high = Number(v[2]);
    const low = Number(v[3]);
    const close = Number(v[4]);
    const volume = Number(v[5]) || 0;
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
    bars.push({
      time: time > 1e12 ? Math.floor(time / 1000) : time,
      open,
      high: Number.isFinite(high) ? high : Math.max(open, close),
      low: Number.isFinite(low) ? low : Math.min(open, close),
      close,
      volume,
    });
  }
  return bars.sort((a, b) => a.time - b.time);
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      headers: { Origin: ORIGIN, "User-Agent": UA },
    });
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* */
      }
      reject(new Error("TradingView socket timeout"));
    }, 8000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("TradingView socket error"));
    });
  });
}

export async function fetchTvHistory(tvSymbol, resolution = "15", count = 400, timeoutMs = 10000) {
  const ws = await openSocket();
  const cs = `cs_${Math.random().toString(36).slice(2, 10)}`;
  const barsByTime = new Map();
  let done = false;
  let error = null;

  const finish = () => {
    if (done) return;
    done = true;
    try {
      ws.close();
    } catch {
      /* */
    }
  };

  const collected = new Promise((resolve, reject) => {
    const killer = setTimeout(() => {
      finish();
      if (barsByTime.size) resolve([...barsByTime.values()].sort((a, b) => a.time - b.time));
      else reject(error || new Error(`FXPro history timeout ${tvSymbol}`));
    }, timeoutMs);

    ws.addEventListener("message", (ev) => {
      for (const msg of unpack(ev.data)) {
        if (msg.ping) {
          replyPing(ws, msg.ping);
          continue;
        }
        if (msg.m === "symbol_error" || msg.m === "series_error") {
          error = new Error(`${tvSymbol}: ${msg.p?.[2] || msg.m}`);
          clearTimeout(killer);
          finish();
          reject(error);
          return;
        }
        if (msg.m === "timescale_update" || msg.m === "du") {
          const rows = msg.p?.[1]?.sds_1?.s;
          for (const bar of rowsToBars(rows)) barsByTime.set(bar.time, bar);
        }
        if (msg.m === "series_completed") {
          clearTimeout(killer);
          finish();
          resolve([...barsByTime.values()].sort((a, b) => a.time - b.time));
        }
      }
    });

    ws.addEventListener("close", () => {
      if (done) return;
      clearTimeout(killer);
      if (barsByTime.size) resolve([...barsByTime.values()].sort((a, b) => a.time - b.time));
      else reject(error || new Error("socket closed"));
    });
  });

  ws.send(pack("set_auth_token", ["unauthorized_user_token"]));
  ws.send(pack("chart_create_session", [cs, ""]));
  ws.send(pack("resolve_symbol", [cs, "sds_sym_1", specFor(tvSymbol)]));
  ws.send(pack("create_series", [cs, "sds_1", "s1", "sds_sym_1", String(resolution), Math.min(5000, Math.max(50, count))]));

  const bars = await collected;
  if (!bars.length) throw new Error(`FXPro empty history ${tvSymbol}`);
  return bars;
}

export async function fetchTvQuote(tvSymbol, timeoutMs = 6000) {
  const ws = await openSocket();
  const qs = `qs_${Math.random().toString(36).slice(2, 10)}`;
  return new Promise((resolve, reject) => {
    const killer = setTimeout(() => {
      ws.close();
      reject(new Error(`FXPro quote timeout ${tvSymbol}`));
    }, timeoutMs);
    let quote = null;
    ws.addEventListener("message", (ev) => {
      for (const msg of unpack(ev.data)) {
        if (msg.ping) {
          replyPing(ws, msg.ping);
          continue;
        }
        if (msg.m === "symbol_error") {
          clearTimeout(killer);
          ws.close();
          reject(new Error(`${tvSymbol}: ${msg.p?.[2] || "invalid"}`));
          return;
        }
        if (msg.m === "qsd" && msg.p?.[1]?.v) {
          const v = msg.p[1].v;
          quote = {
            price: num(v.lp ?? v.bid ?? v.ask),
            change: num(v.chp),
            bid: num(v.bid),
            ask: num(v.ask),
            open: num(v.open_price),
            high: num(v.high_price),
            low: num(v.low_price),
            volume: num(v.volume),
          };
          if (Number.isFinite(quote.price)) {
            clearTimeout(killer);
            ws.close();
            resolve(quote);
          }
        }
      }
    });
    ws.addEventListener("error", () => {
      clearTimeout(killer);
      reject(new Error("quote socket error"));
    });
    ws.send(pack("set_auth_token", ["unauthorized_user_token"]));
    ws.send(pack("quote_create_session", [qs]));
    ws.send(pack("quote_set_fields", [qs, "lp", "ch", "chp", "bid", "ask", "open_price", "high_price", "low_price", "volume"]));
    ws.send(pack("quote_add_symbols", [qs, tvSymbol]));
  });
}

export function subscribeTv(tvSymbol, resolution, onBar) {
  let ws = null;
  let closed = false;
  let retry = 0;
  let timer = 0;
  let last = null;

  const apply = (bar) => {
    if (!bar) return;
    last = last && last.time === bar.time ? { ...last, ...bar, high: Math.max(last.high, bar.high), low: Math.min(last.low, bar.low) } : bar;
    onBar(last);
  };

  const connect = async () => {
    if (closed) return;
    try {
      ws = await openSocket();
    } catch {
      schedule();
      return;
    }
    retry = 0;
    const cs = `cs_${Math.random().toString(36).slice(2, 10)}`;
    const qs = `qs_${Math.random().toString(36).slice(2, 10)}`;
    ws.addEventListener("message", (ev) => {
      if (closed) return;
      for (const msg of unpack(ev.data)) {
        if (msg.ping) {
          replyPing(ws, msg.ping);
          continue;
        }
        if (msg.m === "timescale_update" || msg.m === "du") {
          for (const bar of rowsToBars(msg.p?.[1]?.sds_1?.s)) apply(bar);
        }
        if (msg.m === "qsd" && last && Number.isFinite(msg.p?.[1]?.v?.lp)) {
          const lp = Number(msg.p[1].v.lp);
          apply({
            ...last,
            close: lp,
            high: Math.max(last.high, lp),
            low: Math.min(last.low, lp),
          });
        }
      }
    });
    ws.addEventListener("close", () => {
      if (!closed) schedule();
    });
    ws.send(pack("set_auth_token", ["unauthorized_user_token"]));
    ws.send(pack("chart_create_session", [cs, ""]));
    ws.send(pack("quote_create_session", [qs]));
    ws.send(pack("quote_set_fields", [qs, "lp", "ch", "chp"]));
    ws.send(pack("quote_add_symbols", [qs, tvSymbol]));
    ws.send(pack("resolve_symbol", [cs, "sds_sym_1", specFor(tvSymbol)]));
    ws.send(pack("create_series", [cs, "sds_1", "s1", "sds_sym_1", String(resolution), 80]));
  };

  const schedule = () => {
    if (closed) return;
    const wait = Math.min(12000, 400 * 2 ** retry++);
    timer = setTimeout(() => void connect(), wait);
  };

  void connect();
  return () => {
    closed = true;
    clearTimeout(timer);
    try {
      ws?.close();
    } catch {
      /* */
    }
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
