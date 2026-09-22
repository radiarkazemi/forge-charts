import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import ReplayIcon from "@mui/icons-material/Replay";
import { useServices } from "@/app/use-services";
import { ALERT_CONDITION_LABELS, type PriceAlert } from "@/domain";
import { useStore } from "@/shared/hooks/useStore";
import { EmptyState } from "@/shared/ui/EmptyState";
import { PanelHeader } from "@/shared/ui/PanelHeader";
import { formatPrice, formatRelative } from "@/shared/utils/format";

interface AlertsPanelProps {
  readonly onClose: () => void;
  readonly onCreate: () => void;
}

export function AlertsPanel({ onClose, onCreate }: AlertsPanelProps) {
  const { alerts, symbols, chart } = useServices();
  const list = useStore(alerts.alerts);
  const active = list.filter((a) => a.status === "active");
  const triggered = list.filter((a) => a.status === "triggered");

  const precisionOf = (alert: PriceAlert) => symbols.findByTicker(alert.ticker)?.pricePrecision ?? 2;

  const renderRow = (alert: PriceAlert) => (
    <ListItem
      key={alert.id}
      disablePadding
      secondaryAction={
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {alert.status === "triggered" ? (
            <Tooltip title="Re-arm">
              <IconButton size="small" aria-label="Re-arm alert" onClick={() => alerts.reactivate(alert.id)}>
                <ReplayIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : null}
          <Tooltip title="Delete">
            <IconButton size="small" aria-label="Delete alert" onClick={() => alerts.remove(alert.id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      }
    >
      <ListItemButton onClick={() => chart.setSymbol(alert.ticker)} sx={{ pr: 10, alignItems: "flex-start" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {alert.ticker}{" "}
            <Typography component="span" variant="body2" color="text.secondary">
              {ALERT_CONDITION_LABELS[alert.condition].toLowerCase()}
            </Typography>{" "}
            <Typography component="span" variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {formatPrice(alert.price, precisionOf(alert))}
            </Typography>
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {alert.note ? `${alert.note} · ` : ""}
            {alert.status === "triggered" && alert.triggeredAt
              ? `Triggered ${formatRelative(alert.triggeredAt)}`
              : `Created ${formatRelative(alert.createdAt)}`}
          </Typography>
        </Box>
      </ListItemButton>
    </ListItem>
  );

  return (
    <>
      <PanelHeader
        title="Alerts"
        onClose={onClose}
        actions={
          <Tooltip title="Create alert">
            <IconButton size="small" color="primary" aria-label="Create alert" onClick={onCreate}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        }
      />
      {list.length === 0 ? (
        <EmptyState
          title="No alerts yet"
          description="Get notified when a symbol crosses a price level."
          action={
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onCreate}>
              Create alert
            </Button>
          }
        />
      ) : (
        <Box sx={{ overflowY: "auto", flex: 1 }}>
          <SectionLabel label="Active" count={active.length} />
          <List dense disablePadding>
            {active.map(renderRow)}
          </List>
          {triggered.length > 0 ? (
            <>
              <SectionLabel
                label="Triggered"
                count={triggered.length}
                action={
                  <Button size="small" onClick={() => alerts.clearTriggered()}>
                    Clear
                  </Button>
                }
              />
              <List dense disablePadding>
                {triggered.map(renderRow)}
              </List>
            </>
          ) : null}
        </Box>
      )}
    </>
  );
}

function SectionLabel({ label, count, action }: { label: string; count: number; action?: React.ReactNode }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, pt: 1.5, pb: 0.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ flex: 1, lineHeight: 1.6 }}>
        {label}
      </Typography>
      <Chip size="small" label={count} variant="outlined" />
      {action}
    </Box>
  );
}
