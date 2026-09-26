import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useServices } from "@/app/use-services";
import { AlertToaster } from "@/features/alerts/AlertToaster";
import { CreateAlertDialog } from "@/features/alerts/CreateAlertDialog";
import { ChartWorkspace } from "@/features/chart/ChartWorkspace";
import { ProfileDialog } from "@/features/profile/ProfileDialog";
import { useStore } from "@/shared/hooks/useStore";
import { SidePanel } from "./SidePanel";
import { SideRail } from "./SideRail";

/**
 * Chart shell: TradingView toolbar is the primary chrome.
 * On mobile the right panel overlays the chart so the canvas stays usable.
 */
export function AppShell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { settings, chart } = useServices();
  const sidePanel = useStore(settings.settings, (s) => s.sidePanel);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    document.title = `${symbol} — Forge Charts`;
  }, [symbol]);

  // Give the chart full width on phones; watchlist stays one tap away via the rail.
  useEffect(() => {
    if (isMobile && settings.settings.get().sidePanel) {
      settings.setSidePanel(null);
    }
    // Only when crossing into mobile — not on every panel toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mobile breakpoint only
  }, [isMobile]);

  const openAlertDialog = () => setAlertDialogOpen(true);

  return (
    <Box
      sx={{
        height: { xs: "100dvh", md: "100%" },
        maxHeight: { xs: "100dvh", md: "none" },
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
        overflow: "hidden",
      }}
    >
      <Box component="main" sx={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <ChartWorkspace onCreateAlert={openAlertDialog} onOpenProfile={() => setProfileOpen(true)} />
        {sidePanel ? (
          <>
            {isMobile ? (
              <Box
                onClick={() => settings.setSidePanel(null)}
                sx={{
                  position: "absolute",
                  inset: 0,
                  right: 44,
                  bgcolor: "rgba(0,0,0,0.45)",
                  zIndex: 19,
                }}
              />
            ) : null}
            <SidePanel
              panel={sidePanel}
              onClose={() => settings.setSidePanel(null)}
              onCreateAlert={openAlertDialog}
              overlay={isMobile}
            />
          </>
        ) : null}
        <SideRail
          active={sidePanel}
          onToggle={(id) => settings.toggleSidePanel(id)}
          onOpenObjectTree={() => chart.openObjectTree()}
          compact={isMobile}
        />
      </Box>
      <CreateAlertDialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)} />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <AlertToaster />
    </Box>
  );
}
