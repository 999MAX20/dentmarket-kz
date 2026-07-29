import { describe, expect, it } from "vitest";
import { normalizeCommerceProfile, validateCommercePaymentMethod } from "@marketplace/schemas";

describe("checkout commerce payment policy", () => {
  it("allows basic card and transfer for a manual organization", () => {
    const profile = normalizeCommerceProfile({ integration: "NONE" });
    expect(validateCommercePaymentMethod(profile, "CARD")).toMatchObject({ allowed: true });
    expect(validateCommercePaymentMethod(profile, "BANK_TRANSFER")).toMatchObject({ allowed: true });
    expect(validateCommercePaymentMethod(profile, "INVOICE")).toMatchObject({ allowed: true });
  });

  it("requires both capability and banking add-on for corporate methods", () => {
    expect(validateCommercePaymentMethod({ paymentMethods: ["QR"], bankAddOnEnabled: false }, "QR").allowed).toBe(false);
    expect(validateCommercePaymentMethod({ paymentMethods: ["QR"], bankAddOnEnabled: true }, "QR").allowed).toBe(true);
    expect(validateCommercePaymentMethod({ paymentMethods: ["CARD"], bankAddOnEnabled: true }, "QR").allowed).toBe(false);
  });
});
