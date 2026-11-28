import { describe, expect, it } from "vitest";
import { MIN_NEW_PASSWORD, passwordPolicyError } from "../src/features/auth/password";

describe("new account password", () => {
  it("accepts a standard 8 character password", () => {
    expect(MIN_NEW_PASSWORD).toBe(8);
    expect(passwordPolicyError("forge-8c")).toBeNull();
  });

  it("rejects a shorter password", () => {
    expect(passwordPolicyError("short7c")).toMatch(/at least 8/);
  });
});
