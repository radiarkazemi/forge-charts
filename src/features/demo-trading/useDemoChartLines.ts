import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId, IPositionLineAdapter, IOrderLineAdapter } from "@/infrastructure/tradingview";
import { formatUsd, unrealizedPnl } from "./types";

type NativeBundle = {
  mode: "native";
  pos?: IPositionLineAdapter;
  tp?: IOrderLineAdapter;
  sl?: IOrderLineAdapter;
};

type ShapeBundle = {
  mode: "shape";
  pos?: EntityId;
  tp?: EntityId;
  sl?: EntityId;
  /** Last painted label text (avoid thrashing recreates). */
  posText?: string;
  tpText?: string;
  slText?: string;
};

type LineBundle = NativeBundle | ShapeBundle;

/**
 * TradingView-style on-chart position / TP / SL / pending-order lines.
 *
 * Prefers Charting Library Trading Platform APIs (`createPositionLine` /
 * `createOrderLine`). On Advanced Charts builds where those are unavailable
 * (v29+), falls back to locked horizontal_line shapes with P/L labels.
 */
export function useDemoChartLines(enabled = true): void {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);

  const linesRef = useRef<Map<string, LineBundle>>(new Map());
  const orderLinesRef = useRef<Map<string, IOrderLineAdapter | EntityId>>(new Map());
  const orderModeRef = useRef<"native" | "shape" | null>(null);
  const nativeOkRef = useRef<boolean | null>(null);
  const midRef = useRef<number | null>(null);
  midRef.current = snap.space.lastPrice ?? quote?.price ?? null;

  useEffect(() => {
    if (!enabled) return;
    if (snap.space.active) return;
    if (quote?.price == null) return;
    demoTrading.onMarkPrice(symbol, quote.price);
  }, [demoTrading, enabled, quote?.price, snap.space.active, symbol]);

  useEffect(() => {
    if (!enabled || !ready) return;
    const widget = chart.getWidget();
    const api = widget?.activeChart();
    if (!api) return;

    let cancelled = false;

    const removeBundle = (bundle: LineBundle) => {
      try {
        if (bundle.mode === "native") {
          bundle.pos?.remove();
          bundle.tp?.remove();
          bundle.sl?.remove();
        } else {
          if (bundle.pos) chart.removeEntity(bundle.pos);
          if (bundle.tp) chart.removeEntity(bundle.tp);
          if (bundle.sl) chart.removeEntity(bundle.sl);
        }
      } catch {
        /* ignore */
      }
    };

    const ensureNativeCapable = async (): Promise<boolean> => {
      if (nativeOkRef.current != null) return nativeOkRef.current;
      try {
        const probe = await api.createPositionLine();
        probe.remove();
        nativeOkRef.current = true;
      } catch {
        nativeOkRef.current = false;
      }
      return nativeOkRef.current;
    };

    const sync = async () => {
      const open = demoTrading.openPositionsForSymbol(symbol);
      const keep = new Set(open.map((p) => p.id));
      const useNative = await ensureNativeCapable();
      if (cancelled) return;

      for (const [id, bundle] of [...linesRef.current.entries()]) {
        if (keep.has(id)) continue;
        removeBundle(bundle);
        linesRef.current.delete(id);
      }

      for (const pos of open) {
        if (cancelled) return;
        const color = pos.side === "buy" ? "#2962ff" : "#f23645";
        let bundle = linesRef.current.get(pos.id);

        if (useNative) {
          if (!bundle || bundle.mode !== "native") {
            if (bundle) removeBundle(bundle);
            bundle = { mode: "native" };
            try {
              bundle.pos = await api.createPositionLine();
              if (cancelled) {
                bundle.pos.remove();
                return;
              }
              bundle.pos
                .setText(`${pos.side === "buy" ? "L" : "S"}`)
                .setQuantity(String(pos.qty))
                .setPrice(pos.entryPrice)
                .setExtendLeft(false)
                .setLineStyle(2)
                .setLineLength(80)
                .setBodyBackgroundColor(color)
                .setBodyTextColor("#ffffff")
                .setQuantityBackgroundColor(color)
                .setQuantityTextColor("#ffffff")
                .setLineColor(color)
                .onClose(() => {
                  const m = midRef.current;
                  if (m != null) demoTrading.closePosition(pos.id, m);
                })
                .onReverse(() => {
                  const m = midRef.current;
                  if (m != null) demoTrading.reversePosition(pos.id, m);
                });
              linesRef.current.set(pos.id, bundle);
            } catch {
              nativeOkRef.current = false;
              continue;
            }
          }

          // TP / SL native order lines
          if (pos.takeProfit != null) {
            if (!bundle.tp) {
              try {
                bundle.tp = await api.createOrderLine();
                if (cancelled) {
                  bundle.tp.remove();
                  return;
                }
                bundle.tp
                  .setText("TP")
                  .setLineColor("#089981")
                  .setBodyBackgroundColor("#089981")
                  .setBodyTextColor("#fff")
                  .setQuantityBackgroundColor("#089981")
                  .setQuantityTextColor("#fff")
                  .setLineStyle(2)
                  .setLineLength(80)
                  .onCancel(() => demoTrading.updatePositionExits(pos.id, null, pos.stopLoss));
              } catch {
                /* ignore */
              }
            }
          } else if (bundle.tp) {
            try {
              bundle.tp.remove();
            } catch {
              /* ignore */
            }
            bundle.tp = undefined;
          }

          if (pos.stopLoss != null) {
            if (!bundle.sl) {
              try {
                bundle.sl = await api.createOrderLine();
                if (cancelled) {
                  bundle.sl.remove();
                  return;
                }
                bundle.sl
                  .setText("SL")
                  .setLineColor("#ff9800")
                  .setBodyBackgroundColor("#ff9800")
                  .setBodyTextColor("#fff")
                  .setQuantityBackgroundColor("#ff9800")
                  .setQuantityTextColor("#fff")
                  .setLineStyle(2)
                  .setLineLength(80)
                  .onCancel(() => demoTrading.updatePositionExits(pos.id, pos.takeProfit, null));
              } catch {
                /* ignore */
              }
            }
          } else if (bundle.sl) {
            try {
              bundle.sl.remove();
            } catch {
              /* ignore */
            }
            bundle.sl = undefined;
          }
        } else {
          // Shape fallback (Advanced Charts)
          if (!bundle || bundle.mode !== "shape") {
            if (bundle) removeBundle(bundle);
            bundle = { mode: "shape" };
            linesRef.current.set(pos.id, bundle);
          }
          // Thin price guides only — interactive qty/P/L/× chips live in TradeLinesOverlay.
          const posKey = `pos:${pos.entryPrice}`;
          if (bundle.posText !== posKey || !bundle.pos) {
            if (bundle.pos) chart.removeEntity(bundle.pos);
            const id = await chart.addHorizontalLine({
              price: pos.entryPrice,
              text: "",
              color,
            });
            if (cancelled) {
              if (id) chart.removeEntity(id);
              return;
            }
            bundle.pos = id ?? undefined;
            bundle.posText = posKey;
          }

          if (pos.takeProfit != null) {
            const tpKey = `tp:${pos.takeProfit}`;
            if (bundle.tpText !== tpKey || !bundle.tp) {
              if (bundle.tp) chart.removeEntity(bundle.tp);
              const id = await chart.addHorizontalLine({
                price: pos.takeProfit,
                text: "",
                color: "#089981",
              });
              if (cancelled) {
                if (id) chart.removeEntity(id);
                return;
              }
              bundle.tp = id ?? undefined;
              bundle.tpText = tpKey;
            }
          } else if (bundle.tp) {
            chart.removeEntity(bundle.tp);
            bundle.tp = undefined;
            bundle.tpText = undefined;
          }

          if (pos.stopLoss != null) {
            const slKey = `sl:${pos.stopLoss}`;
            if (bundle.slText !== slKey || !bundle.sl) {
              if (bundle.sl) chart.removeEntity(bundle.sl);
              const id = await chart.addHorizontalLine({
                price: pos.stopLoss,
                text: "",
                color: "#ff9800",
              });
              if (cancelled) {
                if (id) chart.removeEntity(id);
                return;
              }
              bundle.sl = id ?? undefined;
              bundle.slText = slKey;
            }
          } else if (bundle.sl) {
            chart.removeEntity(bundle.sl);
            bundle.sl = undefined;
            bundle.slText = undefined;
          }
        }
      }

      paintPl();
    };

    const paintPl = () => {
      const mid = midRef.current;
      const contract = demoTrading.state.get().instrument.contractSize;
      for (const pos of demoTrading.openPositionsForSymbol(symbol)) {
        const bundle = linesRef.current.get(pos.id);
        if (!bundle) continue;
        const mark = mid ?? pos.entryPrice;
        const pnl = unrealizedPnl(pos.side, pos.qty, pos.entryPrice, mark, contract);
        if (bundle.mode === "native") {
          try {
            bundle.pos?.setPrice(pos.entryPrice).setQuantity(String(pos.qty)).setText(formatUsd(pnl));
          } catch {
            /* ignore */
          }
          if (pos.takeProfit != null && bundle.tp) {
            const tpPnl = unrealizedPnl(pos.side, pos.qty, pos.entryPrice, pos.takeProfit, contract);
            try {
              bundle.tp.setPrice(pos.takeProfit).setQuantity(String(pos.qty)).setText(formatUsd(tpPnl));
            } catch {
              /* ignore */
            }
          }
          if (pos.stopLoss != null && bundle.sl) {
            const slPnl = unrealizedPnl(pos.side, pos.qty, pos.entryPrice, pos.stopLoss, contract);
            try {
              bundle.sl.setPrice(pos.stopLoss).setQuantity(String(pos.qty)).setText(formatUsd(slPnl));
            } catch {
              /* ignore */
            }
          }
        }
        // Shape-mode P/L is shown by TradeLinesOverlay chips (no line recreate).
      }
    };

    void sync();
    const tick = window.setInterval(() => {
      paintPl();
      // Re-sync shapes when positions/exits change infrequently is handled by deps;
      // also refresh shape labels every few seconds for live P/L.
    }, 400);
    const resync = window.setInterval(() => {
      void sync();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(resync);
    };
  }, [chart, demoTrading, enabled, ready, snap.positions, symbol]);

  // Working Limit / Stop order lines.
  useEffect(() => {
    if (!enabled || !ready) return;
    const widget = chart.getWidget();
    const api = widget?.activeChart();
    if (!api) return;

    let cancelled = false;

    const syncOrders = async () => {
      const bare = symbol.includes(":") ? symbol.slice(symbol.lastIndexOf(":") + 1) : symbol;
      const working = snap.orders.filter(
        (o) =>
          o.status === "working" &&
          (o.symbol === symbol || o.symbol === bare || o.symbol.endsWith(bare)) &&
          o.price != null,
      );
      const keep = new Set(working.map((o) => o.id));
      for (const [id, line] of [...orderLinesRef.current.entries()]) {
        if (keep.has(id)) continue;
        try {
          if (typeof line === "object" && line && "remove" in line) {
            (line as IOrderLineAdapter).remove();
          } else {
            chart.removeEntity(line as EntityId);
          }
        } catch {
          /* ignore */
        }
        orderLinesRef.current.delete(id);
      }

      const preferNative = nativeOkRef.current !== false;

      for (const order of working) {
        if (cancelled || order.price == null) continue;
        let line = orderLinesRef.current.get(order.id);
        if (!line) {
          const color = order.side === "buy" ? "#2962ff" : "#f23645";
          const label = `${order.type.toUpperCase()} ${order.qty}`;
          if (preferNative) {
            try {
              const native = await api.createOrderLine();
              if (cancelled) {
                native.remove();
                return;
              }
              native
                .setText(order.type.toUpperCase())
                .setQuantity(String(order.qty))
                .setPrice(order.price)
                .setLineColor(color)
                .setBodyBackgroundColor(color)
                .setBodyTextColor("#fff")
                .setQuantityBackgroundColor(color)
                .setQuantityTextColor("#fff")
                .setLineStyle(2)
                .setLineLength(70)
                .onCancel(() => demoTrading.cancelOrder(order.id));
              orderLinesRef.current.set(order.id, native);
              orderModeRef.current = "native";
              continue;
            } catch {
              nativeOkRef.current = false;
            }
          }
          const id = await chart.addHorizontalLine({
            price: order.price,
            text: label,
            color,
          });
          if (cancelled) {
            if (id) chart.removeEntity(id);
            return;
          }
          if (id) {
            orderLinesRef.current.set(order.id, id);
            orderModeRef.current = "shape";
          }
        } else if (typeof line === "object" && line && "setPrice" in line) {
          try {
            (line as IOrderLineAdapter).setPrice(order.price).setQuantity(String(order.qty));
          } catch {
            /* ignore */
          }
        }
      }
    };

    void syncOrders();
    return () => {
      cancelled = true;
    };
  }, [chart, demoTrading, enabled, ready, snap.orders, symbol]);

  useEffect(() => {
    return () => {
      if (!enabled) return;
      for (const bundle of linesRef.current.values()) {
        try {
          if (bundle.mode === "native") {
            bundle.pos?.remove();
            bundle.tp?.remove();
            bundle.sl?.remove();
          } else {
            if (bundle.pos) chart.removeEntity(bundle.pos);
            if (bundle.tp) chart.removeEntity(bundle.tp);
            if (bundle.sl) chart.removeEntity(bundle.sl);
          }
        } catch {
          /* ignore */
        }
      }
      linesRef.current.clear();
      for (const line of orderLinesRef.current.values()) {
        try {
          if (typeof line === "object" && line && "remove" in line) {
            (line as IOrderLineAdapter).remove();
          } else {
            chart.removeEntity(line as EntityId);
          }
        } catch {
          /* ignore */
        }
      }
      orderLinesRef.current.clear();
    };
  }, [chart, enabled]);
}
