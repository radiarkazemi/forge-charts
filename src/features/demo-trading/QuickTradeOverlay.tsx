import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import type { CSSProperties, ChangeEvent } from "react";
import { useEffect, useState, type RefObject } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

/** Height of the legend band reserved for Sell/Buy (TV broker slot). */
const TRADE_BAND_PX = 36;
const SPACER_ATTR = "data-forge-trade-spacer";

interface Anchor {
  /** Top of Sell/Buy band (between symbol titles and indicator rows). */
  readonly top: number;
  /** Left aligned with legend start. */
  readonly left: number;
}

/**
 * TradingView on-chart Buy/Sell (always visible on the primary chart).
 *
 * Legend stack (matches TV FxPro):
 *   [Symbol · TF · Exchange]          ← Charting Library titles
 *   [SELL] [lots] [BUY]               ← this widget (injected band)
 *   [studies / “N▾” indicator menu]   ← Charting Library sources
 *
 * Limit / Stop / SL / TP stay in the Order ticket.
 */
export function QuickTradeOverlay({
  containerRef,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
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
    // Phones: hide on-chart Sell/Buy (use More → Trade / order ticket instead).
    if (!ready || isMobile) {
      removeLegendTradeSlots();
      setAnchor(null);
      return;
    }
    let alive = true;

    const measure = () => {
      const host = containerRef.current;
      if (!host || !alive) return;
      const hostRect = host.getBoundingClientRect();
      const slot = ensureLegendTradeSlot();
      if (!slot) {
        setAnchor({ top: 70, left: 56 });
        return;
      }
      setAnchor({
        top: Math.max(0, slot.top - hostRect.top),
        left: Math.max(48, slot.left - hostRect.left),
      });
    };

    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
      removeLegendTradeSlots();
    };
  }, [containerRef, symbol, ready, isMobile]);

  if (!ready || !anchor || isMobile) return null;

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
    height: 32,
    minWidth: 72,
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
        height: TRADE_BAND_PX,
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
          height: 32,
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

function chartDocs(): Document[] {
  const docs: Document[] = [document];
  for (const iframe of document.querySelectorAll("iframe")) {
    try {
      if (iframe.contentDocument) docs.push(iframe.contentDocument);
    } catch {
      /* cross-origin */
    }
  }
  return docs;
}

/**
 * Reserve a legend band between the main-series titles and the studies /
 * indicators list (TradingView broker slot). Returns the spacer rect in
 * viewport coordinates, or null if the legend is not ready.
 */
function ensureLegendTradeSlot(): DOMRect | null {
  for (const doc of chartDocs()) {
    const legend = doc.querySelector<HTMLElement>('[data-name="legend"]');
    if (!legend) continue;

    const main =
      legend.querySelector<HTMLElement>('[class*="legendMainSourceWrapper"]') ||
      legend.querySelector<HTMLElement>('[data-name="legend-series-item"]');
    if (!main) continue;

    const sources =
      legend.querySelector<HTMLElement>('[class*="sourcesWrapper"]') ||
      [...legend.querySelectorAll<HTMLElement>('[data-name="legend-source-item"]')][0]?.parentElement;

    let spacer = legend.querySelector<HTMLElement>(`[${SPACER_ATTR}]`);
    if (!spacer) {
      spacer = doc.createElement("div");
      spacer.setAttribute(SPACER_ATTR, "1");
      spacer.style.cssText = [
        `height:${TRADE_BAND_PX}px`,
        "width:100%",
        "min-height:" + TRADE_BAND_PX + "px",
        "flex-shrink:0",
        "pointer-events:none",
        "box-sizing:border-box",
      ].join(";");
      // Insert between symbol titles and indicator/studies list.
      if (sources && sources.parentElement === legend) {
        legend.insertBefore(spacer, sources);
      } else if (main.nextSibling) {
        legend.insertBefore(spacer, main.nextSibling);
      } else {
        legend.appendChild(spacer);
      }
    } else {
      // Keep spacer glued between main series and sources if the library reorders.
      if (sources && spacer.nextElementSibling !== sources) {
        legend.insertBefore(spacer, sources);
      } else if (!sources && main.nextElementSibling !== spacer) {
        if (main.nextSibling) legend.insertBefore(spacer, main.nextSibling);
        else legend.appendChild(spacer);
      }
      spacer.style.height = `${TRADE_BAND_PX}px`;
      spacer.style.minHeight = `${TRADE_BAND_PX}px`;
    }

    const r = spacer.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;

    // Spacer not laid out yet — fall back to just under titles.
    const titles = main.getBoundingClientRect();
    return new DOMRect(titles.left, titles.bottom, titles.width, TRADE_BAND_PX);
  }
  return null;
}

function removeLegendTradeSlots(): void {
  for (const doc of chartDocs()) {
    for (const el of doc.querySelectorAll(`[${SPACER_ATTR}]`)) {
      el.remove();
    }
  }
}
