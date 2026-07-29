import { describe, expect, it } from "vitest";
import { assertPaymentMethodEnabled, buildCommercePolicy, deriveCommerceTier, normalizeCommerceProfile, validatePaymentMethodPolicy } from "../src/index.js";

describe("commerce profile and banking package policy", () => {
  it("keeps manual suppliers eligible to trade without ERP", () => {
    const policy = buildCommercePolicy({ integration: "NONE", paymentMethods: ["CARD"] });
    expect(policy.canTrade).toBe(true);
    expect(policy.manualFlowAllowed).toBe(true);
    expect(policy.automation.priceStock).toBe(false);
  });

  it("derives Smart and Enterprise tiers from automation maturity", () => {
    expect(deriveCommerceTier({ integration: "ERP_API", autoPriceStock: false, autoOrderConfirmation: false, electronicDocuments: false, autoPaymentMatching: false })).toBe("SMART");
    expect(deriveCommerceTier({ integration: "ERP_WMS_EDO", autoPriceStock: true, autoOrderConfirmation: true, electronicDocuments: true, autoPaymentMatching: true })).toBe("ENTERPRISE");
  });

  it("models a small supplier as semi-automated without requiring ERP", () => {
    const policy = buildCommercePolicy({ integration: "EXCEL_PDF", tier: "BASIC" });
    expect(policy.workflow).toMatchObject({ mode: "SEMI_AUTOMATED", import: true, matching: true, supplierConfirmation: true, exceptionHandling: true });
    expect(policy.canTrade).toBe(true);
  });

  it("does not allow a declared Enterprise tier without its capabilities", () => {
    expect(normalizeCommerceProfile({ tier: "ENTERPRISE", integration: "NONE" }).tier).toBe("BASIC");
  });

  it("treats the banking package as optional and never as card storage", () => {
    const policy = buildCommercePolicy({ bankAddOnEnabled: true, paymentMethods: ["CORPORATE_CARD", "QR"] });
    expect(policy.bankAddOn).toMatchObject({ enabled: true, requiresProviderCredentials: true, protectsCardData: false });
    expect(validatePaymentMethodPolicy({ paymentMethods: ["QR"] }, "CORPORATE_CARD")).toMatchObject({ allowed: false });
    expect(() => assertPaymentMethodEnabled({ paymentMethods: ["QR"] }, "CORPORATE_CARD")).toThrow("CORPORATE_CARD");
  });
});
