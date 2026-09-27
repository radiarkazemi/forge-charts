import Box from "@mui/material/Box";
import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useState, type RefObject } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

interface Anchor {
  /** Top of Sell/Buy band (below symbol titles). */
  readonly top: number;
  /** Left aligned with legend start. */
  readonly left: number;
}

/**
 * TradingView on-chart Buy/Sell (always visible on the primary chart).
 *
 * Layout (matches TV FxPro sample):
 *   [Symbol · TF · Exchange]          ← Charting Library legend
 *   [SELL] [lots] [BUY]               ← this widget (under titles)
 *   [studies / “N▾” indicator menu]   ← Charting Library (untouched)
 *
 * Limit / Stop / SL / TP stay in the Order ticket.
 */
export function QuickTradeOverlay({
  containerRef,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
}) {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const ready = useStore(chart.state, (s) => s.ready);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const mid = snap.space.lastPrice ?? quote?.price ?? null;
  const q = demoTrading.quotes(mid);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [qtyDraft, setQtyDraft] = useState(String(snap.qty));

  useEffect(() => {
    setQtyDraft(String(snap.qty));
  }, [snap.qty]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;

    const measure = () => {
      const host = containerRef.current;
      if (!host || !alive) return;
      const hostRect = host.getBoundingClientRect();
      const titles = findMainSeriesTitlesRect();
      if (!titles) {
        setAnchor({ top: 72, left: 56 });
        return;
      }
      // Place the widget on the next legend band under the symbol titles
      // (TV: Sell/Buy sit between the title row and the studies / “N▾” row).
      setAnchor({
        top: Math.max(0, titles.bottom - hostRect.top + 2),
        left: Math.max(48, titles.left - hostRect.left),
      });
    };

    measure();
    const id = window.setInterval(measure, 500);
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, symbol, ready]);

  // Always on chart once the widget is ready (TV broker buttons stay visible).
  if (!ready || !anchor) return null;

  const openTicket = (side: "buy" | "sell") => {
    demoTrading.setSide(side);
    if (mid != null && snap.orderType !== "market") {
      demoTrading.setEntryPrice(mid);
    }
    demoTrading.setTicketOpen(true);
    if (!snap.dockOpen) demoTrading.setDockOpen(true);
  };

  const commitQty = () => {
    const n = Number(qtyDraft);
    if (!Number.isFinite(n)) {
      setQtyDraft(String(snap.qty));
      return;
    }
    demoTrading.setQty(n);
  };

  const onQtyChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQtyDraft(e.target.value);
  };

  const btn: CSSProperties = {
    border: 0,
    cursor: "pointer",
    height: 34,
    minWidth: 76,
    padding: "2px 8px",
    borderRadius: 3,
    color: "#fff",
    textAlign: "center",
    fontFamily: '"Trebuchet MS","Segoe UI",sans-serif',
    lineHeight: 1.05,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: anchor.top,
        left: anchor.left,
        zIndex: 7,
        display: "flex",
        alignItems: "center",
        gap: "3px",
        pointerEvents: "auto",
      }}
      data-testid="forge-chart-trade"
    >
      <button type="button" onClick={() => openTicket("sell")} style={{ ...btn, background: "#f23645" }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>{formatPrice(q?.bid)}</span>
        <span style={{ fontWeight: 600, fontSize: 9, letterSpacing: 0.3 }}>SELL</span>
      </button>
      <Box
        component="input"
        type="text"
        inputMode="decimal"
        value={qtyDraft}
        onChange={onQtyChange}
        onBlur={commitQty}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitQty();
            (e.target as HTMLInputElement).blur();
          }
        }}
        title="Lots"
        sx={{
          width: 44,
          height: 34,
          boxSizing: "border-box",
          px: "4px",
          backgroundColor: "#ffffff !important",
          color: "#131722 !important",
          fontSize: 13,
          fontWeight: 700,
          border: "1px solid #d1d4dc",
          borderRadius: "2px",
          lineHeight: 1.2,
          textAlign: "center",
          fontFamily: '"Trebuchet MS","Segoe UI",sans-serif',
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          outline: "none",
          WebkitTextFillColor: "#131722",
          "&:focus": { borderColor: "#2962ff" },
        }}
      />
      <button type="button" onClick={() => openTicket("buy")} style={{ ...btn, background: "#2962ff" }}>
        <span style={{ fontWeight: 700, fontSize: 12 }}>{formatPrice(q?.ask)}</span>
        <span style={{ fontWeight: 600, fontSize: 9, letterSpacing: 0.3 }}>BUY</span>
      </button>
    </Box>
  );
}

function formatPrice(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function findMainSeriesTitlesRect(): (DOMRect & { bottom: number; left: number }) | null {
  const docs: Document[] = [document];
  for (const iframe of document.querySelectorAll("iframe")) {
    try {
      if (iframe.contentDocument) docs.push(iframe.contentDocument);
    } catch {
      /* cross-origin */
    }
  }

  for (const doc of docs) {
    const wrappers = [...doc.querySelectorAll<HTMLElement>('[class*="titlesWrapper"]')];
    for (const el of wrappers) {
      const text = (el.textContent || "").trim();
      if (!text || /volume/i.test(text)) continue;
      if (!/[A-Za-z]{2,}/.test(text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 10 || r.top > 160) continue;
      if (r.top < 120) return r;
    }
  }
  return null;
}
