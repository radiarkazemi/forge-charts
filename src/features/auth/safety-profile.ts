/** Post-signup safety + authorization profile collected before chart access. */

export const SAFETY_PROFILE_KEY = "forge.auth.safetyProfile.v1";

export interface SafetyAuthorizationProfile {
  readonly fullName: string;
  readonly phone: string;
  readonly nationalId: string;
  readonly country: string;
  readonly acceptedTerms: boolean;
  readonly acceptedRisk: boolean;
  readonly completedAt: number;
}

export function isSafetyProfileComplete(
  value: Partial<SafetyAuthorizationProfile> | null | undefined,
): value is SafetyAuthorizationProfile {
  if (!value) return false;
  return (
    Boolean(value.fullName?.trim()) &&
    Boolean(value.country?.trim()) &&
    value.acceptedTerms === true &&
    value.acceptedRisk === true &&
    typeof value.completedAt === "number" &&
    Number.isFinite(value.completedAt)
  );
}

/** Iran-friendly mobile: 09xxxxxxxxx or +989xxxxxxxxx (digits only check). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "").trim();
  return digits.slice(0, 16);
}

export function isValidPhone(raw: string): boolean {
  const phone = normalizePhone(raw);
  if (/^\+989\d{9}$/.test(phone)) return true;
  if (/^09\d{9}$/.test(phone)) return true;
  if (/^\+?\d{8,15}$/.test(phone)) return true;
  return false;
}

/** National ID / authorization code — 8–16 digits (Iranian national ID is 10). */
export function normalizeNationalId(raw: string): string {
  return raw.replace(/[^\d]/g, "").trim().slice(0, 16);
}

export function isValidNationalId(raw: string): boolean {
  const id = normalizeNationalId(raw);
  return id.length >= 8 && id.length <= 16;
}

export function validateSafetyDraft(input: {
  fullName: string;
  phone: string;
  nationalId: string;
  country: string;
  acceptedTerms: boolean;
  acceptedRisk: boolean;
}): SafetyAuthorizationProfile {
  const fullName = input.fullName.trim().replace(/\s+/g, " ").slice(0, 80);
  if (fullName.length < 3) {
    throw new Error("Enter your full legal name (at least 3 characters).");
  }
  // Phone and national ID are not collected for now. Keep the fields on the
  // stored profile so older accounts still load.
  const phone = input.phone ? normalizePhone(input.phone) : "";
  const nationalId = input.nationalId ? normalizeNationalId(input.nationalId) : "";
  const country = input.country.trim().replace(/\s+/g, " ").slice(0, 56);
  if (country.length < 2) {
    throw new Error("Enter your country or city of residence.");
  }
  if (!input.acceptedTerms) {
    throw new Error("You must accept the Terms of Use to continue.");
  }
  if (!input.acceptedRisk) {
    throw new Error("You must accept the risk disclosure to continue.");
  }
  return {
    fullName,
    phone,
    nationalId,
    country,
    acceptedTerms: true,
    acceptedRisk: true,
    completedAt: Date.now(),
  };
}
