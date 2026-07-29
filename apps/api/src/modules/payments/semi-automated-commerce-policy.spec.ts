import { describe, expect, it } from "vitest";
import { buildCommercePolicy, normalizeCommerceProfile } from "@marketplace/schemas";

describe("small supplier semi-automated workflow", () => {
  it("infers semi-automated mode from Excel/PDF onboarding", () => {
    const profile = normalizeCommerceProfile({ integration: "EXCEL_PDF" });
    const policy = buildCommercePolicy(profile);
    expect(profile).toMatchObject({ tier: "BASIC", operatingMode: "SEMI_AUTOMATED" });
    expect(policy.workflow).toMatchObject({ import: true, matching: true, supplierConfirmation: true });
  });

  it("does not turn semi-automation into an ERP requirement", () => {
    const profile = normalizeCommerceProfile({ operatingMode: "SEMI_AUTOMATED", integration: "EXCEL_PDF" });
    expect(buildCommercePolicy(profile).canTrade).toBe(true);
    expect(profile.autoPriceStock).toBe(false);
  });
});
