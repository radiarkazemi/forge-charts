import Box from "@mui/material/Box";
import type { CSSProperties } from "react";
import { useEffect, useState, type RefObject } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";

interface Anchor {
  readonly top: number;
  readonly left: number;
  readonly height: number;
}

/**
 * TradingView legend Buy/Sell — sits on the main-series legend row,
 * AFTER the symbol/exchange titles and BEFORE studies / “N” indicator menu.
 * Lots live only in the Order ticket (the white “11▾” control is TV’s
 * compressed studies menu — not our qty picker).
 */
export function QuickTradeOverlay({
  containerRef,
}: {
  readonly containerRef: RefObject<HTMLElement | null>;
}) {
  const { demoTrading, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const mid = snap.space.lastPrice ?? quote?.price ?? null;
  const q = demoTrading.quotes(mid);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    let alive = true;

    const measure = () => {
      const host = containerRef.current;
      if (!host || !alive) return;
      const hostRect = host.getBoundingClientRect();
      const titles = findMainSeriesTitlesRect();
      if (!titles) {
        // Fallback: legend row under TV header, after left toolbar.
        setAnchor({ top: 46, left: 200, height: 24 });
        return;
      }
      setAnchor({
        top: Math.max(0, titles.top - hostRect.top),
        left: Math.max(0, titles.right - hostRect.left + 6),
        height: Math.max(20, titles.height),
      });
    };

    measure();
    const id = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, symbol, snap.dockOpen, snap.ticketOpen, snap.space.active]);

  if (!snap.dockOpen && !snap.ticketOpen && !snap.space.active) return null;
  if (!anchor) return null;

  const openTicket = (side: "buy" | "sell") => {
    demoTrading.setSide(side);
    if (mid != null && snap.orderType !== "market") {
      demoTrading.setEntryPrice(mid);
    }
    demoTrading.setTicketOpen(true);
  };

  const h = Math.min(28, Math.max(22, anchor.height + 2));
  const btn: CSSProperties = {
    border: 0,
    cursor: "pointer",
    height: h,
    minWidth: 68,
    padding: "1px 6px",
    borderRadius: 2,
    color: "#fff",
    textAlign: "center",
    fontFamily: '"Trebuchet MS","Segoe UI",sans-serif',
    lineHeight: 1.05,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };

  return (
    <Box
      sx={{
        position: "absolute",
        top: anchor.top,
        left: anchor.left,
        zIndex: 6,
        display: "flex",
        alignItems: "center",
        gap: "2px",
        height: h,
        pointerEvents: "auto",
        // Keep a single legend-row band — never stack under studies.
        maxWidth: "calc(100% - 120px)",
      }}
      data-testid="forge-legend-trade"
    >
      <button type="button" onClick={() => openTicket("sell")} style={{ ...btn, background: "#f23645" }}>
        <span style={{ fontWeight: 700, fontSize: 11 }}>{q?.bid.toFixed(2) ?? "—"}</span>
        <span style={{ fontWeight: 600, fontSize: 8, letterSpacing: 0.2 }}>SELL</span>
      </button>
      <Box
        sx={{
          px: "4px",
          py: "1px",
          bgcolor: "#131722",
          color: "#d1d4dc",
          fontSize: 10,
          fontWeight: 700,
          border: "1px solid #2a2e39",
          lineHeight: 1.2,
          fontFamily: '"Trebuchet MS","Segoe UI",sans-serif',
        }}
      >
        {(q?.spreadPoints ?? snap.instrument.spreadPoints).toFixed(1)}
      </Box>
      <button type="button" onClick={() => openTicket("buy")} style={{ ...btn, background: "#2962ff" }}>
        <span style={{ fontWeight: 700, fontSize: 11 }}>{q?.ask.toFixed(2) ?? "—"}</span>
        <span style={{ fontWeight: 600, fontSize: 8, letterSpacing: 0.2 }}>BUY</span>
      </button>
    </Box>
  );
}

/** Main-series titles chip (symbol · interval · exchange) inside Charting Library. */
function findMainSeriesTitlesRect(): DOMRect | null {
  const docs: Document[] = [document];
  for (const iframe of document.querySelectorAll("iframe")) {
    try {
      if (iframe.contentDocument) docs.push(iframe.contentDocument);
    } catch {
      /* cross-origin */
    }
  }

  for (const doc of docs) {
    // Prefer the series titles wrapper that includes the exchange (main series).
    const wrappers = [...doc.querySelectorAll<HTMLElement>('[class*="titlesWrapper"]')];
    for (const el of wrappers) {
      const text = (el.textContent || "").trim();
      if (!text || /volume/i.test(text)) continue;
      if (!/[A-Za-z]{2,}/.test(text)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 10 || r.top > 160) continue;
      // Main series is the topmost titles row.
      if (r.top < 120) return r;
    }

    const exchange = doc.querySelector<HTMLElement>('[data-name="legend-source-exchange"]');
    if (exchange) {
      const r = exchange.getBoundingClientRect();
      if (r.width > 0 && r.top < 120) return r;
    }
  }
  return null;
}
