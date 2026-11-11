import ButtonBase from "@mui/material/ButtonBase";
import SvgIcon from "@mui/material/SvgIcon";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useServices } from "@/app/use-services";
import { OrderTicketPanel } from "@/features/demo-trading/OrderTicketPanel";

/**
 * TradingView mobile price-scale corner: purple lightning that opens the order ticket.
 * Sits on the right edge, just above the Date Range footer.
 */
export function MobilePriceRail() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const { demoTrading } = useServices();
  if (!isMobile) return null;

  return (
    <>
      <ButtonBase
        aria-label="Trade"
        onClick={() => demoTrading.setTicketOpen(true)}
        sx={{
          position: "absolute",
          right: 6,
          bottom: 42,
          zIndex: 5,
          width: 36,
          height: 36,
          borderRadius: "50%",
          bgcolor: "#8B5CF6",
          color: "#fff",
          boxShadow: "0 1px 4px rgba(19, 23, 34, 0.28)",
          "&:active": { bgcolor: "#7C4FE0" },
        }}
      >
        <SvgIcon viewBox="0 0 24 24" sx={{ fontSize: 20 }}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
        </SvgIcon>
      </ButtonBase>
      <OrderTicketPanel mobile />
    </>
  );
}
