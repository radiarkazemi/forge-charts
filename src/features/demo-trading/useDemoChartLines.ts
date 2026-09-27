import { useEffect, useRef } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { IPositionLineAdapter, IOrderLineAdapter } from "@/infrastructure/tradingview";
import { formatUsd, unrealizedPnl } from "./types";

/**
 * Draw TradingView-style position / TP / SL lines on the active chart.
 * No-ops when the primary chart widget is not ready.
 */
export function useDemoChartLines(enabled = true): void {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const mid = snap.space.lastPrice ?? quote?.price ?? null;

  const linesRef = useRef<Map<string, { pos?: IPositionLineAdapter; tp?: IOrderLineAdapter; sl?: IOrderLineAdapter }>>(
    new Map(),
  );

  // Feed live quotes into the broker when not in demo space.
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

    const sync = async () => {
      const open = demoTrading.openPositionsForSymbol(symbol);
      const keep = new Set(open.map((p) => p.id));

      // Remove stale
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
            bundle.pos = await api.createPositionLine();
            bundle.pos
              .setText(`${pos.side === "buy" ? "+" : "-"}${pos.qty}`)
              .setQuantity(String(pos.qty))
              .setPrice(pos.entryPrice)
              .setExtendLeft(false)
              .setLineStyle(0)
              .setLineLength(60)
              .setBodyBackgroundColor(pos.side === "buy" ? "#2962ff" : "#ef5350")
              .setBodyTextColor("#ffffff")
              .setQuantityBackgroundColor(pos.side === "buy" ? "#2962ff" : "#ef5350")
              .setQuantityTextColor("#ffffff")
              .setLineColor(pos.side === "buy" ? "#2962ff" : "#ef5350")
              .onClose(() => {
                const m = demoTrading.state.get().space.lastPrice ?? quote?.price;
                if (m != null) demoTrading.closePosition(pos.id, m);
              })
              .onReverse(() => {
                const m = demoTrading.state.get().space.lastPrice ?? quote?.price;
                if (m != null) demoTrading.reversePosition(pos.id, m);
              });
          } catch {
            continue;
          }
          linesRef.current.set(pos.id, bundle);
        }

        const mark = mid ?? pos.entryPrice;
        const pnl = unrealizedPnl(pos.side, pos.qty, pos.entryPrice, mark, snap.instrument.contractSize);
        try {
          bundle.pos
            ?.setPrice(pos.entryPrice)
            .setText(`${pos.side === "buy" ? "L" : "S"} ${formatUsd(pnl)}`)
            .setQuantity(`${pos.side === "buy" ? "+" : "-"}${pos.qty}`);
        } catch {
          /* ignore */
        }

        // TP line
        if (pos.takeProfit != null) {
          if (!bundle.tp) {
            try {
              bundle.tp = await api.createOrderLine();
              bundle.tp
                .setText("TP")
                .setLineColor("#26a69a")
                .setBodyBackgroundColor("#26a69a")
                .setBodyTextColor("#fff")
                .setQuantityBackgroundColor("#26a69a")
                .setQuantityTextColor("#fff")
                .onCancel(() => demoTrading.updatePositionExits(pos.id, null, pos.stopLoss));
            } catch {
              /* ignore */
            }
          }
          const tpPnl = unrealizedPnl(
            pos.side,
            pos.qty,
            pos.entryPrice,
            pos.takeProfit,
            snap.instrument.contractSize,
          );
          try {
            bundle.tp
              ?.setPrice(pos.takeProfit)
              .setQuantity(String(pos.qty))
              .setText(formatUsd(tpPnl));
          } catch {
            /* ignore */
          }
        } else if (bundle.tp) {
          try {
            bundle.tp.remove();
          } catch {
            /* ignore */
          }
          bundle.tp = undefined;
        }

        // SL line
        if (pos.stopLoss != null) {
          if (!bundle.sl) {
            try {
              bundle.sl = await api.createOrderLine();
              bundle.sl
                .setText("SL")
                .setLineColor("#ff9800")
                .setBodyBackgroundColor("#ff9800")
                .setBodyTextColor("#fff")
                .setQuantityBackgroundColor("#ff9800")
                .setQuantityTextColor("#fff")
                .onCancel(() => demoTrading.updatePositionExits(pos.id, pos.takeProfit, null));
            } catch {
              /* ignore */
            }
          }
          const slPnl = unrealizedPnl(
            pos.side,
            pos.qty,
            pos.entryPrice,
            pos.stopLoss,
            snap.instrument.contractSize,
          );
          try {
            bundle.sl
              ?.setPrice(pos.stopLoss)
              .setQuantity(String(pos.qty))
              .setText(formatUsd(slPnl));
          } catch {
            /* ignore */
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
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [chart, demoTrading, enabled, mid, ready, snap.instrument.contractSize, snap.positions, snap.orders, symbol, quote?.price]);

  // Working Limit / Stop order lines on chart (TV pending orders).
  useEffect(() => {
    if (!enabled || !ready) return;
    const widget = chart.getWidget();
    const api = widget?.activeChart();
    if (!api) return;

    const orderLines = new Map<string, IOrderLineAdapter>();
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
      for (const [id, line] of [...orderLines.entries()]) {
        if (keep.has(id)) continue;
        try {
          line.remove();
        } catch {
          /* ignore */
        }
        orderLines.delete(id);
      }
      for (const order of working) {
        if (cancelled || order.price == null) continue;
        let line = orderLines.get(order.id);
        if (!line) {
          try {
            line = await api.createOrderLine();
            const color = order.side === "buy" ? "#2962ff" : "#f23645";
            line
              .setText(`${order.type.toUpperCase()}`)
              .setQuantity(String(order.qty))
              .setPrice(order.price)
              .setLineColor(color)
              .setBodyBackgroundColor(color)
              .setBodyTextColor("#fff")
              .setQuantityBackgroundColor(color)
              .setQuantityTextColor("#fff")
              .onCancel(() => demoTrading.cancelOrder(order.id));
            orderLines.set(order.id, line);
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
      for (const line of orderLines.values()) {
        try {
          line.remove();
        } catch {
          /* ignore */
        }
      }
      orderLines.clear();
    };
  }, [chart, demoTrading, enabled, ready, snap.orders, symbol]);

  // Cleanup all lines on unmount
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
    };
  }, [enabled]);
}
