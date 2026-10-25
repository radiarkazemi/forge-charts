/**
 * “+ Add session” control for Forge Sessions — CL study dialog cannot host
 * custom buttons, so we surface this next to the chart when the study is on.
 */

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Button, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import type { EntityId } from "@/infrastructure/tradingview";
import { SESSIONS_MAX_COUNT } from "@/features/chart/sessions-indicator";

function findSessionsStudyId(widget: {
  activeChart?: () =>
    | {
        getAllStudies?: () => ReadonlyArray<{ name?: string; id?: string | EntityId }>;
      }
    | null
    | undefined;
}): EntityId | null {
  try {
    const studies = widget.activeChart()?.getAllStudies?.() ?? [];
    const hit = studies.find((s) => {
      const name = `${s.name ?? ""} ${s.id ?? ""}`;
      return /forge\s*sessions/i.test(name) || /ForgeSessions@/i.test(name);
    });
    return (hit?.id as EntityId) ?? null;
  } catch {
    return null;
  }
}

export function SessionsAddControl(): ReactElement | null {
  const { chart } = useServices();
  const ready = useStore(chart.state, (s) => s.ready);
  const [count, setCount] = useState(0);
  const [studyId, setStudyId] = useState<EntityId | null>(null);

  const refresh = useCallback(() => {
    const widget = chart.getWidget();
    if (!widget) {
      setStudyId(null);
      setCount(0);
      return;
    }
    const id = findSessionsStudyId(widget);
    setStudyId(id);
    if (!id) {
      setCount(0);
      return;
    }
    try {
      const api = widget.activeChart()?.getStudyById(id);
      const values = api?.getInputValues() ?? [];
      const item = values.find((v) => String(v.id) === "sessionCount");
      const n = Number(item?.value);
      setCount(Number.isFinite(n) ? Math.max(1, Math.min(SESSIONS_MAX_COUNT, Math.floor(n))) : 4);
    } catch {
      setCount(4);
    }
  }, [chart]);

  useEffect(() => {
    if (!ready) return;
    const widget = chart.getWidget();
    if (!widget) return;
    const onEvt = () => {
      window.setTimeout(refresh, 0);
    };
    try {
      widget.subscribe("study_event", onEvt as never);
      widget.subscribe("study_properties_changed", onEvt as never);
    } catch {
      /* ignore */
    }
    const kick = window.setTimeout(refresh, 0);
    const poll = window.setInterval(refresh, 4000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(poll);
      try {
        widget.unsubscribe("study_event", onEvt as never);
        widget.unsubscribe("study_properties_changed", onEvt as never);
      } catch {
        /* ignore */
      }
    };
  }, [chart, ready, refresh]);

  const setSessionCount = (next: number) => {
    const widget = chart.getWidget();
    if (!widget || !studyId) return;
    const n = Math.max(1, Math.min(SESSIONS_MAX_COUNT, next));
    try {
      const api = widget.activeChart()?.getStudyById(studyId);
      api?.setInputValues([{ id: "sessionCount" as never, value: n }]);
      // Enable the newly revealed slot so it paints immediately.
      if (n > count) {
        const labels = "ABCDEFGHIJKL";
        const L = labels[n - 1]!;
        api?.setInputValues([
          { id: "sessionCount" as never, value: n },
          { id: `s${L}Enable` as never, value: true },
        ]);
      }
      setCount(n);
    } catch (err) {
      console.warn("[forge-sessions] add session failed", err);
    }
  };

  if (!studyId || count < 1) return null;

  return (
    <Stack
      data-testid="sessions-add-control"
      direction="row"
      alignItems="center"
      spacing={0.75}
      sx={{
        position: "absolute",
        top: 44,
        left: { xs: 8, sm: 56 },
        zIndex: 5,
        px: 1,
        py: 0.5,
        bgcolor: "rgba(22,22,22,0.92)",
        border: "1px solid #2E2E2E",
        borderRadius: 1,
        pointerEvents: "auto",
      }}
    >
      <Typography sx={{ color: "#DBDBDB", fontSize: 12, fontWeight: 600, mr: 0.5 }}>
        Sessions {count}/{SESSIONS_MAX_COUNT}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        disabled={count <= 1}
        onClick={() => setSessionCount(count - 1)}
        startIcon={<RemoveIcon sx={{ fontSize: 16 }} />}
        sx={{
          minWidth: 0,
          color: "#DBDBDB",
          borderColor: "#2E2E2E",
          textTransform: "none",
          fontSize: 12,
          py: 0.25,
        }}
      >
        Remove
      </Button>
      <Button
        size="small"
        variant="contained"
        disabled={count >= SESSIONS_MAX_COUNT}
        onClick={() => setSessionCount(count + 1)}
        startIcon={<AddIcon sx={{ fontSize: 16 }} />}
        sx={{
          minWidth: 0,
          textTransform: "none",
          fontSize: 12,
          py: 0.25,
          bgcolor: "#2157f3",
          "&:hover": { bgcolor: "#1a46c7" },
        }}
      >
        + Add session
      </Button>
    </Stack>
  );
}
