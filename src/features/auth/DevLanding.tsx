import Box from "@mui/material/Box";
import Button from "@mui/material/Button";

/** Public Forge landing, reachable on the development site before and after login. */
export function DevLanding({ signedIn }: { readonly signedIn: boolean }) {
  return (
    <Box sx={{ height: "100dvh", display: "flex", flexDirection: "column", bgcolor: "#050810" }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <Button
          component="a"
          href="?view=login"
          sx={{ color: "#f0d2a8", textTransform: "none", fontWeight: 700 }}
        >
          Log in
        </Button>
        {signedIn ? (
          <Button
            component="a"
            href={window.location.pathname}
            sx={{ color: "#fff", textTransform: "none", fontWeight: 700 }}
          >
            Chart
          </Button>
        ) : null}
      </Box>
      <Box
        component="iframe"
        title="Forge landing"
        src="https://forgechart.ir/"
        sx={{ flex: 1, width: "100%", border: 0, bgcolor: "#050810" }}
      />
    </Box>
  );
}
