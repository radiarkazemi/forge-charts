import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useServices } from "@/app/use-services";
import { AlertToaster } from "@/features/alerts/AlertToaster";
import { CreateAlertDialog } from "@/features/alerts/CreateAlertDialog";
import { ChartWorkspace } from "@/features/chart/ChartWorkspace";
import { ProfileDialog } from "@/features/profile/ProfileDialog";
import { ProfileMenu } from "@/features/profile/ProfileMenu";
import { activeProfile } from "@/application";
import { useStore } from "@/shared/hooks/useStore";
import { SidePanel } from "./SidePanel";
import { SideRail } from "./SideRail";

/**
 * Chart shell: TradingView toolbar is the primary chrome.
 * On mobile the right panel overlays the chart so the canvas stays usable.
 * Pine Editor docks at the bottom (TradingView parity).
 */
export function AppShell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { settings, chart, alerts } = useServices();
  const sidePanel = useStore(settings.settings, (s) => s.sidePanel);
  const appTheme = useStore(settings.settings, (s) => s.theme);
  const settingsSnap = useStore(settings.settings, (s) => s);
  const profile = activeProfile(settingsSnap);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const alertCount = useStore(alerts.alerts, (list) => list.filter((a) => a.status === "active").length);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<HTMLElement | null>(null);
  const profileAnchorRef = useState(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:6px;right:56px;width:1px;height:28px;pointer-events:none;z-index:40;";
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
    if (isMobile && settings.settings.get().sidePanel && settings.settings.get().sidePanel !== "pine") {
      settings.setSidePanel(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: mobile breakpoint only
  }, [isMobile]);

  useEffect(() => {
    const onOpen = () => setProfileMenuAnchor(profileAnchorRef);
    window.addEventListener("forge:open-profile-menu", onOpen);
    return () => window.removeEventListener("forge:open-profile-menu", onOpen);
  }, [profileAnchorRef]);

  const openAlertDialog = () => setAlertDialogOpen(true);
  const openProfileMenu = () => setProfileMenuAnchor(profileAnchorRef);

  const sideDock = sidePanel && sidePanel !== "pine" ? sidePanel : null;
  const pineOpen = sidePanel === "pine";

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
          <Box sx={{ flex: pineOpen ? "1 1 45%" : 1, minHeight: 0, position: "relative", display: "flex" }}>
            <ChartWorkspace onCreateAlert={openAlertDialog} onOpenProfile={openProfileMenu} />
            {sideDock ? (
              <>
                {isMobile ? (
                  <Box
                    onClick={() => settings.setSidePanel(null)}
                    sx={{
                      position: "absolute",
                      inset: 0,
                      right: 48,
                      bgcolor: "rgba(0,0,0,0.45)",
                      zIndex: 19,
                    }}
                  />
                ) : null}
                <SidePanel
                  panel={sideDock}
                  onClose={() => settings.setSidePanel(null)}
                  onCreateAlert={openAlertDialog}
                  onOpenObjectTree={() => chart.openObjectTree()}
                  overlay={isMobile}
                />
              </>
            ) : null}
          </Box>
          {pineOpen ? (
            <Box
              sx={{
                flex: "0 0 42%",
                minHeight: { xs: 220, md: 280 },
                maxHeight: "55%",
                borderTop: 1,
                borderColor: "divider",
                zIndex: 18,
              }}
            >
              <SidePanel
                panel="pine"
                onClose={() => settings.setSidePanel(null)}
                onCreateAlert={openAlertDialog}
                onOpenObjectTree={() => chart.openObjectTree()}
              />
            </Box>
          ) : null}
        </Box>
        <SideRail
          active={sidePanel}
          onToggle={(id) => settings.toggleSidePanel(id)}
          onOpenObjectTree={() => chart.openObjectTree()}
          onOpenPine={() => settings.toggleSidePanel("pine")}
          compact={isMobile}
        />
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
