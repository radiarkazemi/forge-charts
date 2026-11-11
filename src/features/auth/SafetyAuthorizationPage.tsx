import { useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ForgeMark } from "@/brand/ForgeMark";
import {
  validateSafetyDraft,
  type SafetyAuthorizationProfile,
} from "./safety-profile";

interface SafetyAuthorizationPageProps {
  readonly username: string;
  readonly displayName?: string;
  readonly initial?: Partial<SafetyAuthorizationProfile> | null;
  readonly onComplete: (profile: SafetyAuthorizationProfile) => void | Promise<void>;
  readonly onBack?: () => void;
}

/**
 * Required after username/password signup (and for accounts missing safety data).
 * Collects identity details used for account safety and authorization.
 */
export function SafetyAuthorizationPage({
  username,
  displayName,
  initial,
  onComplete,
  onBack,
}: SafetyAuthorizationPageProps) {
  const [fullName, setFullName] = useState(initial?.fullName ?? displayName ?? "");
  const [country, setCountry] = useState(initial?.country ?? "Iran");
  const [acceptedTerms, setAcceptedTerms] = useState(initial?.acceptedTerms === true);
  const [acceptedRisk, setAcceptedRisk] = useState(initial?.acceptedRisk === true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const profile = validateSafetyDraft({
        fullName,
        phone: initial?.phone ?? "",
        nationalId: initial?.nationalId ?? "",
        country,
        acceptedTerms,
        acceptedRisk,
      });
      await onComplete(profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
        py: 3,
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(41,98,255,0.22), transparent 55%), radial-gradient(900px 500px at 90% 110%, rgba(92,225,255,0.12), transparent 50%), #0b0e14",
      }}
    >
      <Box
        component="form"
        onSubmit={(e) => void submit(e)}
        sx={{
          width: "100%",
          maxWidth: 460,
          bgcolor: "#1e222d",
          border: "1px solid #2a2e39",
          borderRadius: 2,
          p: { xs: 2.5, sm: 3.5 },
          boxShadow: "0 24px 64px rgba(0,0,0,0.45)",
        }}
      >
        <Stack spacing={2.25}>
          <Stack spacing={1.25} sx={{ alignItems: "center", textAlign: "center" }}>
            <ForgeMark theme="dark" size={44} />
            <Typography variant="h5" sx={{ fontWeight: 700, color: "#f5f7fb" }}>
              Safety & authorization
            </Typography>
            <Typography variant="body2" sx={{ color: "#787b86", maxWidth: 360 }}>
              Account <strong style={{ color: "#d1d4dc" }}>{username}</strong> is created.
              Complete this step so we can protect your charts and authorize your access.
            </Typography>
          </Stack>

          <Stack spacing={1.5}>
            <TextField
              label="Full legal name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="name"
              placeholder="First and last name"
            />
            <TextField
              label="Country / city"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="country-name"
            />

            <FormControlLabel
              sx={{ alignItems: "flex-start", ml: 0, mr: 0, color: "#d1d4dc" }}
              control={
                <Checkbox
                  checked={acceptedTerms}
                  onChange={(_, v) => setAcceptedTerms(v)}
                  sx={{ pt: 0.25, color: "#787b86", "&.Mui-checked": { color: "#2962ff" } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: "#b2b5be" }}>
                  I confirm this information is accurate and I accept the Forge Charts Terms of Use
                  for authorized account access.
                </Typography>
              }
            />
            <FormControlLabel
              sx={{ alignItems: "flex-start", ml: 0, mr: 0, color: "#d1d4dc" }}
              control={
                <Checkbox
                  checked={acceptedRisk}
                  onChange={(_, v) => setAcceptedRisk(v)}
                  sx={{ pt: 0.25, color: "#787b86", "&.Mui-checked": { color: "#2962ff" } }}
                />
              }
              label={
                <Typography variant="body2" sx={{ color: "#b2b5be" }}>
                  I understand trading involves risk of loss and Forge Charts does not provide
                  financial advice. Demo balances are not real money.
                </Typography>
              }
            />

            {error ? (
              <Alert severity="error" sx={{ py: 0.5 }}>
                {error}
              </Alert>
            ) : null}

            <Button
              type="submit"
              variant="contained"
              disabled={busy}
              fullWidth
              sx={{
                mt: 0.5,
                py: 1.1,
                bgcolor: "#2962ff",
                textTransform: "none",
                fontWeight: 600,
                "&:hover": { bgcolor: "#1e4fd6" },
              }}
            >
              {busy ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : "Continue to charts"}
            </Button>
            {onBack ? (
              <Button
                type="button"
                onClick={onBack}
                disabled={busy}
                fullWidth
                sx={{ textTransform: "none", color: "#787b86" }}
              >
                Back
              </Button>
            ) : null}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
