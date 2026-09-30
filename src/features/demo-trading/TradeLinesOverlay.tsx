import Box from "@mui/material/Box";
import { useEffect, useState, type RefObject } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { formatUsd, markPriceForSide, unrealizedPnl, type DemoPosition } from "./types";

interface ChipLayout {
  readonly id: string;
  readonly top: number;
  readonly kind: "position" | "tp" | "sl" | "order";
  readonly color: string;
  readonly qty: string;
  readonly text: string;
}

/**
 * TradingView-style interactive chips (qty | P/L | ×) along the right side of
 * the chart for open positions, TP/SL, and working orders.
 */
export function TradeLinesOverlay({
  containerRef,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
}) {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const ready = useStore(chart.state, (s) => s.ready);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const mid = demoTrading.midForSymbol(symbol, quote?.price ?? null);
  const [chips, setChips] = useState<ChipLayout[]>([]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    const measure = () => {
      if (!alive) return;
      const host = containerRef.current;
      if (!host) return;
      const range = chart.getVisiblePriceRange();
      const hostRect = host.getBoundingClientRect();
      // Chart pane: below legend / SellBuy (~110px), above bottom toolbar (~36px).
      const paneTop = 110;
      const paneBottom = Math.max(paneTop + 80, hostRect.height - 36);
      const paneHeight = paneBottom - paneTop;
      if (!range || paneHeight < 40) {
        setChips([]);
        return;
      }

      const contract = snap.instrument.contractSize;
      const next: ChipLayout[] = [];
      const open = demoTrading.openPositionsForSymbol(symbol);
      const span = range.to - range.from;

      const yFor = (price: number): number | null => {
        const t = (price - range.from) / span;
        if (!Number.isFinite(t)) return null;
        const y = paneTop + (1 - t) * paneHeight;
        if (y < paneTop - 8 || y > paneBottom + 8) return null;
        return y;
      };

      for (const pos of open) {
        const px = mid == null ? pos.entryPrice : markPriceForSide(pos.side, mid, snap.instrument);
        const pnl = unrealizedPnl(pos.side, pos.qty, pos.entryPrice, px, contract);
        const y = yFor(pos.entryPrice);
        if (y != null) {
          next.push({
            id: `pos-${pos.id}`,
            kind: "position",
            color: pos.side === "buy" ? "#2962ff" : "#f23645",
            qty: String(pos.qty),
            text: formatUsd(pnl),
            top: y,
          });
        }
        if (pos.takeProfit != null) {
          const tpY = yFor(pos.takeProfit);
          if (tpY != null) {
            next.push({
              id: `tp-${pos.id}`,
              kind: "tp",
              color: "#089981",
              qty: String(pos.qty),
              text: formatUsd(unrealizedPnl(pos.side, pos.qty, pos.entryPrice, pos.takeProfit, contract)),
              top: tpY,
            });
          }
        }
        if (pos.stopLoss != null) {
          const slY = yFor(pos.stopLoss);
          if (slY != null) {
            next.push({
              id: `sl-${pos.id}`,
              kind: "sl",
              color: "#ff9800",
              qty: String(pos.qty),
              text: formatUsd(unrealizedPnl(pos.side, pos.qty, pos.entryPrice, pos.stopLoss, contract)),
              top: slY,
            });
          }
        }
      }

      const working = demoTrading.workingOrdersForSymbol(symbol);
      for (const order of working) {
        if (order.price == null) continue;
        const y = yFor(order.price);
        if (y != null) {
          next.push({
            id: `ord-${order.id}`,
            kind: "order",
            color: order.side === "buy" ? "#2962ff" : "#f23645",
            qty: String(order.qty),
            text: order.type.toUpperCase(),
            top: y,
          });
        }
        if (order.takeProfit != null) {
          const tpY = yFor(order.takeProfit);
          if (tpY != null) {
            next.push({
              id: `otp-${order.id}`,
              kind: "tp",
              color: "#089981",
              qty: String(order.qty),
              text: "TP",
              top: tpY,
            });
          }
        }
        if (order.stopLoss != null) {
          const slY = yFor(order.stopLoss);
          if (slY != null) {
            next.push({
              id: `osl-${order.id}`,
              kind: "sl",
              color: "#ff9800",
              qty: String(order.qty),
              text: "SL",
              top: slY,
            });
          }
        }
      }

      setChips(next);
    };

    measure();
    const id = window.setInterval(measure, 350);
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [
    chart,
    containerRef,
    demoTrading,
    mid,
    quote?.price,
    ready,
    snap.instrument.contractSize,
    snap.orders,
    snap.positions,
    symbol,
  ]);

  if (!ready || chips.length === 0) return null;

  const onClose = (chip: ChipLayout) => {
    const m = mid ?? quote?.price;
    if (chip.kind === "position") {
      const posId = chip.id.replace(/^pos-/, "");
      if (m != null) demoTrading.closePosition(posId, m);
      return;
    }
    if (chip.kind === "tp") {
      const posId = chip.id.replace(/^tp-/, "");
      if (chip.id.startsWith("otp-")) {
        const orderId = chip.id.replace(/^otp-/, "");
        const order = snap.orders.find((o) => o.id === orderId);
        if (order) demoTrading.updateOrderExits(orderId, null, order.stopLoss);
        return;
      }
      const pos = findPos(snap.positions, posId);
      if (pos) demoTrading.updatePositionExits(posId, null, pos.stopLoss);
      return;
    }
    if (chip.kind === "sl") {
      if (chip.id.startsWith("osl-")) {
        const orderId = chip.id.replace(/^osl-/, "");
        const order = snap.orders.find((o) => o.id === orderId);
        if (order) demoTrading.updateOrderExits(orderId, order.takeProfit, null);
        return;
      }
      const posId = chip.id.replace(/^sl-/, "");
      const pos = findPos(snap.positions, posId);
      if (pos) demoTrading.updatePositionExits(posId, pos.takeProfit, null);
      return;
    }
    if (chip.kind === "order") {
      demoTrading.cancelOrder(chip.id.replace(/^ord-/, ""));
    }
  };

  return (
    <Box
      sx={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 6 }}
      data-testid="forge-trade-lines"
    >
      {chips.map((chip) => (
        <Box
          key={chip.id}
          sx={{
            position: "absolute",
            right: 58,
            top: chip.top,
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "stretch",
            pointerEvents: "auto",
            fontFamily: '"Trebuchet MS","Segoe UI",sans-serif',
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <Box sx={{ bgcolor: chip.color, color: "#fff", px: "6px", py: "5px" }}>{chip.qty}</Box>
          <Box sx={{ bgcolor: chip.color, color: "#fff", px: "7px", py: "5px", opacity: 0.95 }}>{chip.text}</Box>
          <Box
            component="button"
            type="button"
            onClick={() => onClose(chip)}
            title={chip.kind === "position" ? "Close" : "Cancel"}
            sx={{
              border: 0,
              cursor: "pointer",
              bgcolor: "#131722",
              color: "#d1d4dc",
              px: "7px",
              py: "5px",
              fontWeight: 700,
              fontSize: 12,
              "&:hover": { color: "#f23645" },
            }}
          >
            ×
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function findPos(positions: readonly DemoPosition[], id: string): DemoPosition | undefined {
  return positions.find((p) => p.id === id);
}
