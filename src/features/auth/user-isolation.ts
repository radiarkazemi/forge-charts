/**
 * Per-account key helpers — keep PII and chart state out of the shared auth registry.
 */

import { SAFETY_PROFILE_KEY } from "./safety-profile";

/** Sanitize userId for localStorage key segments. */
export function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "anon";
}

/** Absolute (unscoped) localStorage key for one user’s safety/authorization PII. */
export function safetyProfileStorageKey(userId: string): string {
  return `forge.u.${sanitizeUserId(userId)}.${SAFETY_PROFILE_KEY}`;
}

/** Absolute prefix for every scoped chart/settings key belonging to a user. */
export function userScopePrefix(userId: string): string {
  return `forge.u.${sanitizeUserId(userId)}.`;
}

/** Public auth fields safe to show in UI — never include safety PII or hashes. */
export type PublicAccountView = {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
};
