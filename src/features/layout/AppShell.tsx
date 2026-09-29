import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useServices } from "@/app/use-services";
import { AlertToaster } from "@/features/alerts/AlertToaster";
import { CreateAlertDialog } from "@/features/alerts/CreateAlertDialog";
import { ChartWorkspace } from "@/features/chart/ChartWorkspace";
import { DemoTradingDock, OrderTicketPanel } from "@/features/demo-trading";
import { ProfileDialog } from "@/features/profile/ProfileDialog";
import { ProfileMenu } from "@/features/profile/ProfileMenu";
import { activeProfile } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import { MobileForgeShell } from "./MobileForgeShell";
import { SidePanel } from "./SidePanel";
import { SideRail } from "./SideRail";
import { MF } from "./mobile-forge-theme";

/**
 * Chart shell matching TradingView Supercharts on desktop.
 * Mobile: Forge mockup chrome — branded header, instrument cards, TF pills, overview, app nav.
 */
export function AppShell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { settings, chart, alerts, demoTrading } = useServices();
  const sidePanel = useStore(settings.settings, (s) => s.sidePanel);
  const appTheme = useStore(settings.settings, (s) => s.theme);
  const settingsSnap = useStore(settings.settings, (s) => s);
  const ticketOpen = useStore(demoTrading.state, (s) => s.ticketOpen);
  const profile = activeProfile(settingsSnap);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const alertCount = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<HTMLElement | null>(null);
  const profileAnchorRef = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;top:6px;right:48px;width:1px;height:28px;pointer-events:none;z-index:40;";
    document.body.appendChild(el);
    return el;
  })[0];

  useEffect(() => {
    return () => {
      profileAnchorRef?.remove();
    };
  }, [profileAnchorRef]);

  useEffect(() => {
    document.title = `${symbol} — Forge Charts`;
  }, [symbol]);

  useEffect(() => {
    if (!isMobile) return;
    if (settings.settings.get().chartLayout !== "s") {
      settings.setChartLayout("s");
    }
    if (settings.settings.get().sidePanel) {
      settings.setSidePanel(null);
    }
    if (demoTrading.state.get().dockOpen) {
      demoTrading.setDockOpen(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mobile breakpoint only
  }, [isMobile]);

  useEffect(() => {
    const onOpen = () => setProfileMenuAnchor(profileAnchorRef);
    window.addEventListener("forge:open-profile-menu", onOpen);
    return () => window.removeEventListener("forge:open-profile-menu", onOpen);
  }, [profileAnchorRef]);

  useEffect(() => {
    if (profileAnchorRef) {
      profileAnchorRef.style.right = isMobile ? "12px" : "56px";
    }
  }, [isMobile, profileAnchorRef]);

  const openAlertDialog = () => setAlertDialogOpen(true);
  const openProfileMenu = () => setProfileMenuAnchor(profileAnchorRef);
  const openProfile = () => setProfileOpen(true);

  const overlayPanel = isMobile && sidePanel ? sidePanel : null;
  const desktopSideDock = !isMobile && sidePanel && sidePanel !== "pine" ? sidePanel : null;
  const desktopPine = !isMobile && sidePanel === "pine";

  const initials = (profile.displayName || "JD")
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "JD";

  const chartArea = (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
        height: "100%",
        position: "relative",
      }}
    >
      <ChartWorkspace onCreateAlert={openAlertDialog} onOpenProfile={openProfileMenu} />
      {desktopSideDock ? (
        <SidePanel
          panel={desktopSideDock}
          onClose={() => settings.setSidePanel(null)}
          onCreateAlert={openAlertDialog}
          onOpenObjectTree={() => chart.openObjectTree()}
          onRunPine={(code) => chart.runPineDraft(code)}
        />
      ) : null}
      {ticketOpen ? <OrderTicketPanel mobile={isMobile} /> : null}
      {overlayPanel ? (
        <>
          <Box
            onClick={() => settings.setSidePanel(null)}
            sx={{
              position: "absolute",
              inset: 0,
              bgcolor: "rgba(0,0,0,0.5)",
              zIndex: 19,
            }}
          />
          <SidePanel
            panel={overlayPanel}
            onClose={() => settings.setSidePanel(null)}
            onCreateAlert={openAlertDialog}
            onOpenObjectTree={() => chart.openObjectTree()}
            onRunPine={(code) => chart.runPineDraft(code)}
            overlay
            overlayRight={0}
          />
        </>
      ) : null}
    </Box>
  );

  return (
    <Box
      sx={{
        height: { xs: "100dvh", md: "100%" },
        maxHeight: { xs: "100dvh", md: "none" },
        display: "flex",
        flexDirection: "column",
        bgcolor: isMobile ? MF.bg : "background.default",
        overflow: "hidden",
      }}
    >
      <Box component="main" sx={{ flex: 1, display: "flex", minHeight: 0, position: "relative" }}>
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {isMobile ? (
            <MobileForgeShell
              onOpenWatchlist={() => settings.toggleSidePanel("watchlist")}
              onOpenAlerts={() => settings.toggleSidePanel("alerts")}
              onOpenProfile={openProfile}
              onOpenExplore={() => chart.openSymbolSearch()}
              alertCount={alertCount}
              profileInitials={initials}
            >
              {chartArea}
            </MobileForgeShell>
          ) : (
            <>
              {chartArea}
              <DemoTradingDock mobile={false} />
            </>
          )}
        </Box>

        {desktopPine ? (
          <Box
            sx={{
              width: { md: "min(48vw, 640px)" },
              flexShrink: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              zIndex: 18,
            }}
          >
            <SidePanel
              panel="pine"
              onClose={() => settings.setSidePanel(null)}
              onCreateAlert={openAlertDialog}
              onOpenObjectTree={() => chart.openObjectTree()}
              onRunPine={(code) => chart.runPineDraft(code)}
            />
          </Box>
        ) : null}

        {!isMobile ? (
          <SideRail
            active={sidePanel}
            onToggle={(id) => settings.toggleSidePanel(id)}
            onOpenObjectTree={() => chart.openObjectTree()}
            onOpenPine={() => settings.toggleSidePanel("pine")}
          />
        ) : null}
      </Box>
      <CreateAlertDialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)} />
      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ProfileMenu
        anchorEl={profileMenuAnchor}
        open={Boolean(profileMenuAnchor)}
        onClose={() => setProfileMenuAnchor(null)}
        profile={profile}
        darkTheme={appTheme === "dark"}
        onToggleTheme={() => settings.toggleTheme()}
        onOpenProfile={() => {
          setProfileMenuAnchor(null);
          setProfileOpen(true);
        }}
        alertCount={alertCount}
      />
      <AlertToaster />
    </Box>
  );
}
