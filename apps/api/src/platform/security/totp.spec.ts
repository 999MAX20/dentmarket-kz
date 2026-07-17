import { describe, expect, it } from "vitest";
import { decodeBase32, encodeBase32, generateRecoveryCodes, generateTotp, verifyTotp } from "./totp";

describe("TOTP security utilities", () => {
  it("round-trips base32 and verifies only the configured time window", () => {
    const source = Buffer.from("12345678901234567890");
    const secret = encodeBase32(source);
    expect(decodeBase32(secret)).toEqual(source);
    const at = 1_700_000_000_000;
    const code = generateTotp(secret, at);
    expect(verifyTotp(secret, code, at)).toBe(true);
    expect(verifyTotp(secret, code, at + 120_000)).toBe(false);
  });

  it("creates unique human-readable recovery codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){2}$/.test(code))).toBe(true);
  });
});
