import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import { useServices } from "@/app/use-services";
import { AlertToaster } from "@/features/alerts/AlertToaster";
import { CreateAlertDialog } from "@/features/alerts/CreateAlertDialog";
import { TradingViewChart } from "@/features/chart/TradingViewChart";
import { useStore } from "@/shared/hooks/useStore";
import { SidePanel } from "./SidePanel";
import { SideRail } from "./SideRail";

/**
 * Chart shell: TradingView's own top toolbar is the primary navbar
 * (symbol, intervals, indicators, save, etc.). Side rail stays for watchlist/alerts.
 */
export function AppShell() {
  const { settings, chart } = useServices();
  const sidePanel = useStore(settings.settings, (s) => s.sidePanel);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);

  useEffect(() => {
    document.title = `${symbol} — Forge Charts`;
  }, [symbol]);

  const openAlertDialog = () => setAlertDialogOpen(true);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
      <Box component="main" sx={{ flex: 1, display: "flex", minHeight: 0 }}>
        <TradingViewChart onCreateAlert={openAlertDialog} />
        {sidePanel ? (
          <SidePanel panel={sidePanel} onClose={() => settings.setSidePanel(null)} onCreateAlert={openAlertDialog} />
        ) : null}
        <SideRail active={sidePanel} onToggle={(id) => settings.toggleSidePanel(id)} />
      </Box>
      <CreateAlertDialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)} />
      <AlertToaster />
    </Box>
  );
}
