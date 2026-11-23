import { useSyncExternalStore, type ReactElement } from "react";
import { Box, Typography } from "@mui/material";
import {
  getFractalTimeDashboard,
  subscribeFractalTimeDashboard,
  type FractalTimeDashboardState,
} from "./runtime";

function useDash(): FractalTimeDashboardState | null {
  return useSyncExternalStore(subscribeFractalTimeDashboard, getFractalTimeDashboard, () => null);
}

export function FractalTimeDashboard(): ReactElement | null {
  const state = useDash();
  if (!state) return null;

  return (
    <Box
      data-testid="fractal-time-dashboard"
      sx={{
        position: "absolute",
        zIndex: 4,
        top: 48,
        left: 12,
        minWidth: 280,
        bgcolor: "#161616",
        border: "1px solid #2E2E2E",
        borderRadius: 0.5,
        overflow: "hidden",
        pointerEvents: "none",
        fontFamily: "Outfit, Vazirmatn, sans-serif",
        boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
      }}
    >
      <Typography
        sx={{
          px: 1.25,
          py: 0.75,
          textAlign: "center",
          color: state.aligned ? "#3dcc8c" : "#DBDBDB",
          fontSize: 12,
          fontWeight: 700,
          borderBottom: "1px solid #2E2E2E",
        }}
      >
        {state.title} · {state.reason}
      </Typography>
      <Typography sx={{ px: 1.25, py: 0.4, color: "#808080", fontSize: 10 }}>
        Tehran {state.tehran} · {state.mode === "sameQ" ? "Same Q" : "Phase Match"}
      </Typography>
      <Box
        component="table"
        sx={{
          width: "100%",
          borderCollapse: "collapse",
          "& th, & td": {
            px: 1,
            py: 0.4,
            fontSize: 11,
            color: "#DBDBDB",
            whiteSpace: "nowrap",
          },
          "& th": { color: "#808080", fontWeight: 500, textAlign: "left" },
        }}
      >
        <thead>
          <tr>
            <th>Layer</th>
            <th>Now</th>
            <th>Match</th>
          </tr>
        </thead>
        <tbody>
          {state.rows.map((row) => (
            <tr key={row.layer}>
              <td>{row.layer}</td>
              <td>{row.current}</td>
              <td
                style={{
                  color:
                    row.match === "yes"
                      ? "#3dcc8c"
                      : row.match === "no"
                        ? "#e06c75"
                        : "#808080",
                }}
              >
                {row.match}
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}
