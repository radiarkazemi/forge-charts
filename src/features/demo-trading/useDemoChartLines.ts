import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { IPositionLineAdapter, IOrderLineAdapter } from "@/infrastructure/tradingview";
import { formatUsd, unrealizedPnl } from "./types";

type LineBundle = {
  pos?: IPositionLineAdapter;
  tp?: IOrderLineAdapter;
  sl?: IOrderLineAdapter;
};

/**
 * TradingView-style on-chart position / TP / SL / pending-order lines.
 * Create/destroy only when the position set changes; P/L text updates on a timer
 * so live ticks do not thrash createPositionLine().
 */
export function useDemoChartLines(enabled = true): void {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);

  const linesRef = useRef<Map<string, LineBundle>>(new Map());
  const orderLinesRef = useRef<Map<string, IOrderLineAdapter>>(new Map());
  const midRef = useRef<number | null>(null);
  midRef.current = snap.space.lastPrice ?? quote?.price ?? null;

  // Feed live quotes into the broker when not in demo space.
  useEffect(() => {
    if (!enabled) return;
    if (snap.space.active) return;
    if (quote?.price == null) return;
    demoTrading.onMarkPrice(symbol, quote.price);
  }, [demoTrading, enabled, quote?.price, snap.space.active, symbol]);

  // Create / remove position + TP/SL lines when the open set changes.
  useEffect(() => {
    if (!enabled || !ready) return;
    const widget = chart.getWidget();
    const api = widget?.activeChart();
    if (!api) return;

    let cancelled = false;

    const sync = async () => {
      const open = demoTrading.openPositionsForSymbol(symbol);
      const keep = new Set(open.map((p) => p.id));

      for (const [id, bundle] of [...linesRef.current.entries()]) {
        if (keep.has(id)) continue;
        try {
          bundle.pos?.remove();
          bundle.tp?.remove();
          bundle.sl?.remove();
        } catch {
          /* ignore */
        }
        linesRef.current.delete(id);
      }

      for (const pos of open) {
        if (cancelled) return;
        let bundle = linesRef.current.get(pos.id);
        if (!bundle) {
          bundle = {};
          try {
            const color = pos.side === "buy" ? "#2962ff" : "#f23645";
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
          } catch {
            continue;
          }
          linesRef.current.set(pos.id, bundle);
        }

        // TP
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

        // SL
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
        try {
          bundle.pos
            ?.setPrice(pos.entryPrice)
            .setQuantity(String(pos.qty))
            .setText(formatUsd(pnl));
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
    };

    void sync();
    const tick = window.setInterval(paintPl, 400);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
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
          line.remove();
        } catch {
          /* ignore */
        }
        orderLinesRef.current.delete(id);
      }
      for (const order of working) {
        if (cancelled || order.price == null) continue;
        let line = orderLinesRef.current.get(order.id);
        if (!line) {
          try {
            line = await api.createOrderLine();
            if (cancelled) {
              line.remove();
              return;
            }
            const color = order.side === "buy" ? "#2962ff" : "#f23645";
            line
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
            orderLinesRef.current.set(order.id, line);
          } catch {
            continue;
          }
        }
        try {
          line.setPrice(order.price).setQuantity(String(order.qty));
        } catch {
          /* ignore */
        }
      }
    };

    void syncOrders();
    return () => {
      cancelled = true;
    };
  }, [chart, demoTrading, enabled, ready, snap.orders, symbol]);

  // Cleanup on unmount / disable.
  useEffect(() => {
    return () => {
      if (!enabled) return;
      for (const bundle of linesRef.current.values()) {
        try {
          bundle.pos?.remove();
          bundle.tp?.remove();
          bundle.sl?.remove();
        } catch {
          /* ignore */
        }
      }
      linesRef.current.clear();
      for (const line of orderLinesRef.current.values()) {
        try {
          line.remove();
        } catch {
          /* ignore */
        }
      }
      orderLinesRef.current.clear();
    };
  }, [enabled]);
}
