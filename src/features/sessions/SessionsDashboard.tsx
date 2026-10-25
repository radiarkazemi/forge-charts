/**
 * LuxAlgo-style Sessions dashboard overlay (Pine `table.new` is unsupported in CL).
 */

import { useSyncExternalStore, type ReactElement } from "react";
import { Box, Typography } from "@mui/material";
import {
  getSessionsDashboard,
  subscribeSessionsDashboard,
  type SessionsDashboardState,
} from "./runtime";

const SIZE_PX = [10, 12, 14, 16, 18] as const;

function useDash(): SessionsDashboardState | null {
  return useSyncExternalStore(subscribeSessionsDashboard, getSessionsDashboard, () => null);
}

export function SessionsDashboard(): ReactElement | null {
  const state = useDash();
  if (!state || state.rows.length === 0) return null;

  const fontSize = SIZE_PX[state.size] ?? 12;
  const anchor =
    state.position === 1
      ? { bottom: 48, right: 12, top: "auto", left: "auto" }
      : state.position === 2
        ? { bottom: 48, left: 12, top: "auto", right: "auto" }
        : { top: 48, right: 12, bottom: "auto", left: "auto" };

  return (
    <Box
      data-testid="sessions-dashboard"
      sx={{
        position: "absolute",
        zIndex: 4,
        ...anchor,
        minWidth: state.advanced ? 280 : 180,
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
          color: "#DBDBDB",
          fontSize,
          fontWeight: 600,
          borderBottom: "1px solid #2E2E2E",
        }}
      >
        {state.title}
      </Typography>
      <Box
        component="table"
        sx={{
          width: "100%",
          borderCollapse: "collapse",
          "& th, & td": {
            px: 1,
            py: 0.45,
            fontSize,
            color: "#DBDBDB",
            whiteSpace: "nowrap",
          },
          "& th": { color: "#808080", fontWeight: 500, textAlign: "left" },
        }}
      >
        <thead>
          <tr>
            <th>Session</th>
            <th>Status</th>
            {state.advanced ? (
              <>
                <th>Trend</th>
                <th>Volume</th>
                <th>σ</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {state.rows.map((row) => {
            const statusBg =
              row.status === "Active" ? "#089981" : row.status === "Inactive" ? "#f23645" : "#808080";
            const trendBg =
              row.trend == null ? "transparent" : row.trend >= 0 ? "#089981" : "#f23645";
            return (
              <tr key={row.name}>
                <td style={{ color: row.color, fontWeight: 600 }}>{row.name}</td>
                <td>
                  <Box
                    component="span"
                    sx={{
                      display: "inline-block",
                      px: 0.75,
                      py: 0.15,
                      bgcolor: statusBg,
                      color: "#DBDBDB",
                      borderRadius: 0.25,
                      minWidth: 64,
                      textAlign: "center",
                    }}
                  >
                    {row.status}
                  </Box>
                </td>
                {state.advanced ? (
                  <>
                    <td style={{ background: trendBg }}>
                      {row.trend == null ? "—" : row.trend.toFixed(2)}
                    </td>
                    <td>
                      {row.volume == null
                        ? "—"
                        : row.volume >= 1_000_000
                          ? `${(row.volume / 1_000_000).toFixed(2)}M`
                          : row.volume >= 1000
                            ? `${(row.volume / 1000).toFixed(2)}K`
                            : String(Math.round(row.volume))}
                    </td>
                    <td>{row.sigma == null ? "—" : row.sigma.toFixed(4)}</td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}
