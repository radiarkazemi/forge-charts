import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { useMemo, useState } from "react";
import { useServices } from "@/app/use-services";
import { useStore } from "@/shared/hooks/useStore";
import { formatUsd, unrealizedPnl, type DemoOrder, type DemoPosition } from "./types";
import { ActivateDemoSpaceDialog, CreateDemoAccountDialog } from "./ActivateDemoSpaceDialog";

type DockTab = "positions" | "orders" | "account";

/**
 * TradingView-style bottom trading dock (demo / paper account strip).
 */
export function DemoTradingDock() {
  const { demoTrading, demoSpace, chart, quotes } = useServices();
  const snap = useStore(demoTrading.state);
  const spaceCtrl = useStore(demoSpace.state);
  const symbol = useStore(chart.state, (s) => s.symbol);
  const quote = useStore(quotes.quotes, (q) => q[symbol]);
  const [tab, setTab] = useState<DockTab>("positions");
  const [activateOpen, setActivateOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const mid = snap.space.lastPrice ?? quote?.price ?? null;
  const acct = demoTrading.activeAccount();
  const openPositions = snap.positions.filter((p) => p.status === "open");
  const workingOrders = snap.orders.filter((o) => o.status === "working");

  const unrealized = useMemo(() => {
    if (mid == null) return 0;
    return openPositions.reduce(
      (sum, p) => sum + unrealizedPnl(p.side, p.qty, p.entryPrice, mid, snap.instrument.contractSize),
      0,
    );
  }, [openPositions, mid, snap.instrument.contractSize]);

  if (!snap.dockOpen) {
    return (
      <Box
        sx={{
          height: 36,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: 1.5,
          bgcolor: "#1e222d",
          borderTop: "1px solid #2a2e39",
          color: "#d1d4dc",
        }}
      >
        <Button
          size="small"
          onClick={() => demoTrading.setDockOpen(true)}
          sx={{ textTransform: "none", color: "#d1d4dc", fontWeight: 600 }}
        >
          Demo Trading
        </Button>
        <Typography variant="caption" sx={{ color: "#787b86" }}>
          {acct.name} · Equity {acct.equity.toFixed(2)} {acct.currency}
        </Typography>
        {snap.space.active ? (
          <Typography variant="caption" sx={{ color: "#f44336", fontWeight: 600 }}>
            SPACE ACTIVE
          </Typography>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={() => demoTrading.setDockOpen(true)} sx={{ color: "#787b86" }}>
          <KeyboardArrowUpIcon fontSize="small" />
        </IconButton>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: 220,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        bgcolor: "#131722",
        borderTop: "1px solid #2a2e39",
        color: "#d1d4dc",
        minHeight: 0,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.25,
          py: 0.5,
          bgcolor: "#1e222d",
          borderBottom: "1px solid #2a2e39",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mr: 1 }}>
          Demo Trading
        </Typography>
        <Select
          size="small"
          value={snap.activeAccountId}
          onChange={(e) => demoTrading.selectAccount(String(e.target.value))}
          sx={{
            minWidth: 160,
            height: 28,
            color: "#d1d4dc",
            fontSize: 12,
            ".MuiOutlinedInput-notchedOutline": { borderColor: "#363a45" },
          }}
        >
          {snap.accounts.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}
            </MenuItem>
          ))}
        </Select>
        <Button size="small" onClick={() => setCreateOpen(true)} sx={{ textTransform: "none", color: "#2962ff" }}>
          + New demo account
        </Button>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: "#787b86" }}>
          Balance {acct.balance.toFixed(2)} · Equity{" "}
          <Box component="span" sx={{ color: unrealized >= 0 ? "#26a69a" : "#ef5350", fontWeight: 600 }}>
            {acct.equity.toFixed(2)}
          </Box>{" "}
          {acct.currency}
        </Typography>
        {snap.space.active ? (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => void demoSpace.deactivate()}
            sx={{ textTransform: "none", ml: 1 }}
          >
            Deactivate space
          </Button>
        ) : (
          <Button
            size="small"
            variant="contained"
            onClick={() => setActivateOpen(true)}
            sx={{ textTransform: "none", ml: 1, bgcolor: "#2962ff" }}
          >
            Activate demo space
          </Button>
        )}
        <IconButton size="small" onClick={() => demoTrading.setDockOpen(false)} sx={{ color: "#787b86" }}>
          <KeyboardArrowDownIcon fontSize="small" />
        </IconButton>
      </Box>

      {spaceCtrl.error ? (
        <Typography variant="caption" sx={{ px: 1.5, py: 0.5, color: "#ef5350" }}>
          {spaceCtrl.error}
        </Typography>
      ) : null}
      {snap.space.active ? (
        <Typography variant="caption" sx={{ px: 1.5, py: 0.35, color: "#f9a825", bgcolor: "#1e222d" }}>
          Demo space from {snap.space.startTimeSec ? new Date(snap.space.startTimeSec * 1000).toUTCString() : "—"} —
          candles advance live (no pause). Deactivate to return to the real-time chart.
        </Typography>
      ) : null}

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as DockTab)}
        sx={{
          minHeight: 32,
          px: 1,
          borderBottom: "1px solid #2a2e39",
          "& .MuiTab-root": { minHeight: 32, textTransform: "none", fontSize: 12, color: "#787b86" },
          "& .Mui-selected": { color: "#d1d4dc !important" },
          "& .MuiTabs-indicator": { bgcolor: "#2962ff" },
        }}
      >
        <Tab value="positions" label={`Positions (${openPositions.length})`} />
        <Tab value="orders" label={`Orders (${workingOrders.length})`} />
        <Tab value="account" label="Account" />
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", fontSize: 12 }}>
        {tab === "positions" ? (
          <PositionsTable
            positions={openPositions}
            mid={mid}
            contractSize={snap.instrument.contractSize}
            onClose={(id) => mid != null && demoTrading.closePosition(id, mid)}
            onReverse={(id) => mid != null && demoTrading.reversePosition(id, mid)}
          />
        ) : null}
        {tab === "orders" ? (
          <OrdersTable orders={workingOrders} onCancel={(id) => demoTrading.cancelOrder(id)} />
        ) : null}
        {tab === "account" ? (
          <AccountPane
            leverage={acct.leverage}
            spreadPoints={acct.spreadPoints}
            onSave={(lev, spread) => demoTrading.updateAccountSettings({ leverage: lev, spreadPoints: spread })}
            onReset={() => {
              const bal = Number(window.prompt("Reset balance to", "100000"));
              if (Number.isFinite(bal) && bal > 0) demoTrading.resetBalance(bal);
            }}
            onOpenTicket={() => demoTrading.setTicketOpen(true)}
          />
        ) : null}
      </Box>

      <ActivateDemoSpaceDialog open={activateOpen} onClose={() => setActivateOpen(false)} />
      <CreateDemoAccountDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  );
}

function PositionsTable({
  positions,
  mid,
  contractSize,
  onClose,
  onReverse,
}: {
  positions: readonly DemoPosition[];
  mid: number | null;
  contractSize: number;
  onClose: (id: string) => void;
  onReverse: (id: string) => void;
}) {
  if (positions.length === 0) {
    return (
      <Typography variant="caption" sx={{ display: "block", p: 2, color: "#787b86" }}>
        No open positions. Use Buy / Sell on the chart or open the Order ticket.
      </Typography>
    );
  }

  return (
    <Box
      component="table"
      sx={{
        width: "100%",
        borderCollapse: "collapse",
        "& td, & th": { px: 1, py: 0.6, borderBottom: "1px solid #2a2e39", textAlign: "left" },
      }}
    >
      <thead>
        <tr style={{ color: "#787b86" }}>
          <th>Symbol</th>
          <th>Side</th>
          <th>Qty</th>
          <th>Entry</th>
          <th>TP / SL</th>
          <th>P&amp;L</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const pnl = mid == null ? 0 : unrealizedPnl(p.side, p.qty, p.entryPrice, mid, contractSize);
          return (
            <tr key={p.id}>
              <td>{p.symbol}</td>
              <td style={{ color: p.side === "buy" ? "#2962ff" : "#ef5350", fontWeight: 600 }}>
                {p.side === "buy" ? "Long" : "Short"}
              </td>
              <td>{p.qty}</td>
              <td>{p.entryPrice.toFixed(2)}</td>
              <td>
                {p.takeProfit?.toFixed(2) ?? "—"} / {p.stopLoss?.toFixed(2) ?? "—"}
              </td>
              <td style={{ color: pnl >= 0 ? "#26a69a" : "#ef5350", fontWeight: 600 }}>{formatUsd(pnl)}</td>
              <td>
                <Button
                  size="small"
                  onClick={() => onReverse(p.id)}
                  sx={{ textTransform: "none", minWidth: 0, color: "#787b86" }}
                >
                  Reverse
                </Button>
                <IconButton size="small" onClick={() => onClose(p.id)} sx={{ color: "#ef5350" }}>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Box>
  );
}

function OrdersTable({
  orders,
  onCancel,
}: {
  orders: readonly DemoOrder[];
  onCancel: (id: string) => void;
}) {
  if (orders.length === 0) {
    return (
      <Typography variant="caption" sx={{ display: "block", p: 2, color: "#787b86" }}>
        No working orders.
      </Typography>
    );
  }
  return (
    <Box
      component="table"
      sx={{
        width: "100%",
        borderCollapse: "collapse",
        "& td, & th": { px: 1, py: 0.6, borderBottom: "1px solid #2a2e39", textAlign: "left" },
      }}
    >
      <thead>
        <tr style={{ color: "#787b86" }}>
          <th>Symbol</th>
          <th>Side</th>
          <th>Type</th>
          <th>Qty</th>
          <th>Price</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td>{o.symbol}</td>
            <td>{o.side}</td>
            <td>{o.type}</td>
            <td>{o.qty}</td>
            <td>{o.price?.toFixed(2) ?? "—"}</td>
            <td>
              <IconButton size="small" onClick={() => onCancel(o.id)} sx={{ color: "#ef5350" }}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </td>
          </tr>
        ))}
      </tbody>
    </Box>
  );
}

function AccountPane({
  leverage,
  spreadPoints,
  onSave,
  onReset,
  onOpenTicket,
}: {
  leverage: number;
  spreadPoints: number;
  onSave: (leverage: number, spreadPoints: number) => void;
  onReset: () => void;
  onOpenTicket: () => void;
}) {
  const [lev, setLev] = useState(String(leverage));
  const [spread, setSpread] = useState(String(spreadPoints));
  return (
    <Box sx={{ p: 1.5, display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center" }}>
      <TextField
        size="small"
        label="Leverage"
        value={lev}
        onChange={(e) => setLev(e.target.value)}
        sx={{ width: 120, input: { color: "#d1d4dc" }, label: { color: "#787b86" } }}
      />
      <TextField
        size="small"
        label="Spread (points)"
        value={spread}
        onChange={(e) => setSpread(e.target.value)}
        sx={{ width: 140, input: { color: "#d1d4dc" }, label: { color: "#787b86" } }}
      />
      <Button
        size="small"
        variant="outlined"
        onClick={() => onSave(Number(lev) || 10000, Number(spread) || 6)}
        sx={{ textTransform: "none", borderColor: "#434651", color: "#d1d4dc" }}
      >
        Save broker settings
      </Button>
      <Button size="small" onClick={onReset} sx={{ textTransform: "none", color: "#ef5350" }}>
        Reset balance…
      </Button>
      <Button
        size="small"
        variant="contained"
        onClick={onOpenTicket}
        sx={{ textTransform: "none", bgcolor: "#2962ff" }}
      >
        Open order ticket
      </Button>
    </Box>
  );
}
