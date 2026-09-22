import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PanelHeader } from "@/shared/ui/PanelHeader";
import { formatTime } from "@/shared/utils/format";

interface DataWindowPanelProps {
  readonly onClose: () => void;
}

/** Live read-out of the bar under the crosshair, sourced from the chart itself. */
export function DataWindowPanel({ onClose }: DataWindowPanelProps) {
  const { chart } = useServices();
  const snapshot = useStore(chart.crosshair);
  const { symbol, interval } = useStore(chart.state);

  return (
    <>
      <PanelHeader title="Data Window" onClose={onClose} />
      <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {symbol} · {interval}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {snapshot ? formatTime(snapshot.time) : "Hover the chart to inspect a bar"}
        </Typography>
      </Box>
      {!snapshot || snapshot.values.length === 0 ? (
        <EmptyState title="No bar selected" description="Move the crosshair over the chart." />
      ) : (
        <Table size="small">
          <TableBody>
            {snapshot.values.map((row) => (
              <TableRow key={row.title} hover>
                <TableCell sx={{ color: "text.secondary", textTransform: "capitalize" }}>{row.title}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                  {row.value}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
