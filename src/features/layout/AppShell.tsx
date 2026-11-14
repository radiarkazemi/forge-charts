import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useServices } from "@/app/use-services";
import { AlertToaster } from "@/features/alerts/AlertToaster";
import { CreateAlertDialog } from "@/features/alerts/CreateAlertDialog";
import { ChartWorkspace } from "@/features/chart/ChartWorkspace";
import { IndicatorsDialog } from "@/features/chart/IndicatorsDialog";
import { SymbolSearchDialog } from "@/features/chart/SymbolSearchDialog";
import { ProfileDialog } from "@/features/profile/ProfileDialog";
import { ProfileMenu } from "@/features/profile/ProfileMenu";
import { activeProfile } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import { MobileBottomBar } from "./MobileBottomBar";
import { MobileTopBar } from "./MobileTopBar";
import { SidePanel } from "./SidePanel";
import { SideRail } from "./SideRail";
import { SubscriptionPage } from "@/features/billing/SubscriptionPage";

interface AppShellProps {
  readonly onSignOut: () => void;
}

interface ProfileAnchorRect {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

/**
 * Chart shell matching TradingView Supercharts.
 * Mobile: Faraz top chrome (scrollable symbol + TFs) + bottom tool/app bars.
 */
export function AppShell({ onSignOut }: AppShellProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { settings, chart, alerts } = useServices();
  const sidePanel = useStore(settings.settings, (s) => s.sidePanel);
  const appTheme = useStore(settings.settings, (s) => s.theme);
  const language = useStore(settings.settings, (s) => s.language);
  const settingsSnap = useStore(settings.settings, (s) => s);
  const profile = activeProfile(settingsSnap);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const alertCount = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const [profileMenuPos, setProfileMenuPos] = useState<ProfileAnchorRect | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);

  useEffect(() => {
    document.title = `${symbol} — Forge Charts`;
  }, [symbol]);

  useEffect(() => {
    // Keep chart chrome LTR (TradingView); menus/dialogs set their own `dir`.
    document.documentElement.lang = language === "fa" ? "fa" : "en";
  }, [language]);

  useEffect(() => {
    if (!isMobile) return;
    // Phones: reclaim plot area — single pane + no docked side panels.
    if (settings.settings.get().chartLayout !== "s") {
      settings.setChartLayout("s");
    }
    if (settings.settings.get().sidePanel) {
      settings.setSidePanel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mobile breakpoint only
  }, [isMobile]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<Partial<ProfileAnchorRect>>).detail;
      if (
        detail &&
        typeof detail.top === "number" &&
        typeof detail.left === "number" &&
        typeof detail.bottom === "number" &&
        typeof detail.right === "number"
      ) {
        setProfileMenuPos({
          top: detail.top,
          left: detail.left,
          bottom: detail.bottom,
          right: detail.right,
        });
        return;
      }
      setProfileMenuPos({ top: 8, left: 12, bottom: 40, right: 44 });
    };
    window.addEventListener("forge:open-profile-menu", onOpen);
    return () => window.removeEventListener("forge:open-profile-menu", onOpen);
  }, []);

  useEffect(() => {
    const onOpen = () => setSymbolSearchOpen(true);
    window.addEventListener("forge:open-symbol-search", onOpen);
    return () => window.removeEventListener("forge:open-symbol-search", onOpen);
  }, []);

  // Indicators UI is painted inside the chart iframe overlay (see
  // indicators-intercept.ts). Keep the React dialog closed to avoid a second
  // empty/white shell in the parent page.
  useEffect(() => {
    const onOpen = () => setIndicatorsOpen(false);
    window.addEventListener("forge:open-indicators", onOpen);
    return () => window.removeEventListener("forge:open-indicators", onOpen);
  }, []);

  const openAlertDialog = () => setAlertDialogOpen(true);
  const openProfileMenu = () =>
    setProfileMenuPos({ top: 8, left: 12, bottom: 40, right: 44 });

  const overlayPanel = isMobile && sidePanel ? sidePanel : null;
  const desktopSideDock = !isMobile && sidePanel && sidePanel !== "pine" ? sidePanel : null;
  const desktopPine = !isMobile && sidePanel === "pine";

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
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {isMobile ? <MobileTopBar /> : null}
          <Box sx={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, position: "relative" }}>
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
          {isMobile ? (
            <MobileBottomBar
              onCreateAlert={openAlertDialog}
              onOpenWatchlist={() => settings.toggleSidePanel("watchlist")}
              onOpenAlerts={() => settings.toggleSidePanel("alerts")}
            />
          ) : null}
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
      <SymbolSearchDialog open={symbolSearchOpen} onClose={() => setSymbolSearchOpen(false)} />
      <IndicatorsDialog open={indicatorsOpen} onClose={() => setIndicatorsOpen(false)} />
      <ProfileMenu
        anchorPosition={
          profileMenuPos
            ? { top: profileMenuPos.bottom, left: profileMenuPos.left }
            : null
        }
        open={Boolean(profileMenuPos)}
        onClose={() => setProfileMenuPos(null)}
        profile={profile}
        darkTheme={appTheme === "dark"}
        language={language}
        onToggleTheme={() => settings.toggleTheme()}
        onCycleLanguage={() => settings.cycleLanguage()}
        onOpenProfile={() => {
          setProfileMenuPos(null);
          setProfileOpen(true);
        }}
        onOpenSubscription={() => {
          setProfileMenuPos(null);
          setSubscribeOpen(true);
        }}
        onSignOut={onSignOut}
        alertCount={alertCount}
      />
      <AlertToaster />
      {subscribeOpen ? (
        <SubscriptionPage
          signedIn
          onBack={() => setSubscribeOpen(false)}
          onSignIn={() => setSubscribeOpen(false)}
        />
      ) : null}
    </Box>
  );
}
