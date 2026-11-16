import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { LandingMark } from "@/brand/LandingMark";

/**
 * Dev home. The public site root opens the chart sign-in, so the landing
 * and the data admin both live here (/team/ and /dev/).
 */
export function DevLanding({ signedIn }: { readonly signedIn: boolean }) {
  const [gold, setGold] = useState<number | null>(null);
  const [board, setBoard] = useState<number | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/iran-gold/quote", { signal: ctrl.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { prices?: { price_18k_per_gram?: number } } | null) => {
        const price = Number(data?.prices?.price_18k_per_gram);
        if (Number.isFinite(price) && price > 0) setGold(price);
      })
      .catch(() => undefined);
    void fetch("/iran-gold/tsetmc/catalog", { signal: ctrl.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { total?: number } | null) => {
        const total = Number(data?.total);
        if (Number.isFinite(total) && total > 0) setBoard(total);
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const chartHref = signedIn ? window.location.pathname : "?view=login";

  return (
    <Box
      dir="rtl"
      sx={{
        minHeight: "100dvh",
        bgcolor: "#050810",
        color: "#f4f7ff",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 2,
          py: 1.25,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Box sx={{ color: "#f0d2a8", display: "flex" }}>
          <LandingMark size={28} />
        </Box>
        <Box sx={{ fontWeight: 800, letterSpacing: 0.2 }}>Forge</Box>
        <Box sx={{ flex: 1 }} />
        {signedIn ? null : (
          <Button component="a" href="?view=login" sx={{ color: "#f0d2a8", textTransform: "none", fontWeight: 700 }}>
            ورود
          </Button>
        )}
      </Box>

      <Box sx={{ flex: 1, display: "grid", placeItems: "center", px: 2, py: 4 }}>
        <Box sx={{ width: "min(560px, 100%)" }}>
          <Box sx={{ fontSize: 34, fontWeight: 800, lineHeight: 1.25 }}>میز توسعه فورج</Box>
          <Box sx={{ color: "#8b97ad", mt: 1.25, fontSize: 16, lineHeight: 1.6 }}>
            صفحهٔ اصلی و مدیریت داده اینجاست. نمودار عمومی از forgechart.ir مستقیم به ورود نمودار می‌رود.
          </Box>

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, mt: 3 }}>
            <Button
              component="a"
              href={chartHref}
              sx={{
                px: 2.25,
                py: 1.1,
                borderRadius: "12px",
                textTransform: "none",
                fontWeight: 800,
                color: "#fff",
                background: "linear-gradient(180deg, #4d9fff 0%, #2f7bff 100%)",
              }}
            >
              نمودار
            </Button>
            <Button
              component="a"
              href="?view=admin#system"
              sx={{
                px: 2.25,
                py: 1.1,
                borderRadius: "12px",
                textTransform: "none",
                fontWeight: 800,
                color: "#f4f7ff",
                border: "1px solid rgba(255,255,255,0.16)",
              }}
            >
              مدیریت داده
            </Button>
          </Box>

          <Box
            sx={{
              mt: 3.5,
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
              gap: 1.25,
            }}
          >
            <LiveCard label="گرم ۱۸" value={gold == null ? "…" : formatFa(gold)} />
            <LiveCard label="نماد تهران" value={board == null ? "…" : formatFa(board)} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function LiveCard({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <Box
      sx={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px",
        bgcolor: "rgba(14, 20, 34, 0.92)",
        px: 1.75,
        py: 1.4,
      }}
    >
      <Box sx={{ color: "#8b97ad", fontSize: 13 }}>{label}</Box>
      <Box sx={{ fontSize: 22, fontWeight: 800, mt: 0.4 }}>{value}</Box>
    </Box>
  );
}

function formatFa(value: number): string {
  return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 }).format(value);
}
