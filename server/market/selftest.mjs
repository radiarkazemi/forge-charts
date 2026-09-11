import { createMarketService } from "./index.mjs";
import { fxproTvSymbol } from "./symbols.mjs";
import { tvResolution } from "./interval.mjs";

if (fxproTvSymbol("XAUUSD") !== "FXPRO:XAUUSD") throw new Error("XAUUSD map");
if (fxproTvSymbol("USOIL") !== "FXPRO:XTIUSD") throw new Error("USOIL -> XTIUSD");
if (tvResolution("15") !== "15" || tvResolution("1D") !== "1D" || tvResolution("240") !== "240") {
  throw new Error("tvResolution");
}

const svc = createMarketService();
const hist = await svc.history("XAUUSD", "15", 80);
if (hist.items.length < 20) throw new Error(`too few FXPro bars: ${hist.items.length}`);
const last = hist.items.at(-1);
if (!last || last.close < 1000 || last.close > 10000) throw new Error(`unexpected gold price ${last?.close}`);
const q = await svc.quote("XAUUSD");
if (!Number.isFinite(q.price)) throw new Error("quote");

const eurusd = await svc.history("EURUSD", "60", 40);
if (eurusd.items.length < 10) throw new Error("EURUSD history");

console.log(
  JSON.stringify(
    {
      ok: true,
      xauusd: { count: hist.items.length, last: last.close, quote: q.price, tvSymbol: hist.tvSymbol },
      eurusd: { count: eurusd.items.length, last: eurusd.items.at(-1)?.close },
    },
    null,
    2,
  ),
);
