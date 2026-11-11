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
import { LandingMark } from "@/brand/LandingMark";
import { AuthCard, AuthShell, authButtonSx, authFieldSx } from "./AuthShell";
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
    <AuthShell>
      <AuthCard>
        <Box component="form" onSubmit={(e) => void submit(e)}>
        <Stack spacing={2.25}>
          <Stack spacing={1.25} sx={{ alignItems: "center", textAlign: "center" }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", color: "#f4f7ff" }}>
              <LandingMark size={26} />
              <Typography sx={{ fontWeight: 700, letterSpacing: "0.28em", fontSize: 14 }}>
                FORGE
              </Typography>
            </Stack>
            <Typography sx={{ fontWeight: 700, fontSize: 22, color: "#f4f7ff" }}>
              Safety & authorization
            </Typography>
            <Typography variant="body2" sx={{ color: "#8b97ad", maxWidth: 360 }}>
              Account <strong style={{ color: "#f4f7ff" }}>{username}</strong> is created.
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
              sx={authFieldSx}
            />
            <TextField
              label="Country / city"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="country-name"
              sx={authFieldSx}
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

            <Button type="submit" variant="contained" disabled={busy} fullWidth sx={authButtonSx}>
              {busy ? <CircularProgress size={22} sx={{ color: "#fff" }} /> : "Continue to charts"}
            </Button>
            {onBack ? (
              <Button
                type="button"
                onClick={onBack}
                disabled={busy}
                fullWidth
                sx={{ textTransform: "none", color: "#8b97ad" }}
              >
                Back
              </Button>
            ) : null}
          </Stack>
        </Stack>
        </Box>
      </AuthCard>
    </AuthShell>
  );
}
