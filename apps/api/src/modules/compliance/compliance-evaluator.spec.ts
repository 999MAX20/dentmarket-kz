import { describe, expect, it } from "vitest";
import { evaluateCompliance, type ComplianceRuleInput } from "./compliance-evaluator";

const rule: ComplianceRuleInput = { id: "r1", code: "MEDICAL.REG", version: 3, riskLevel: "ORANGE", decision: "ALLOWED_WITH_DISCLOSURE", priority: 10, conditions: { requirements: { lotRequired: true, registrationCertificateRequired: true, minimumRemainingShelfLifeDays: 90 } }, requiredCredentialTypes: ["WHOLESALE_LICENSE"] };

describe("compliance evaluator", () => {
  it("routes missing license and registration certificate to manual review", () => {
    const result = evaluateCompliance([rule], { at: new Date("2026-01-01"), sellerCapabilities: ["SUPPLIER"], buyerCapabilities: ["BUYER"], verifiedCredentialTypes: [], lot: { status: "ACTIVE", expirationDate: new Date("2026-12-01") } });
    expect(result.status).toBe("REVIEW_REQUIRED");
    expect(result.missingCredentials).toEqual(["WHOLESALE_LICENSE"]);
  });

  it("blocks recalled or expired lots regardless of configured green rules", () => {
    const result = evaluateCompliance([], { at: new Date("2026-01-01"), sellerCapabilities: [], buyerCapabilities: [], verifiedCredentialTypes: [], lot: { status: "RECALLED" } });
    expect(result).toMatchObject({ decision: "BLOCKED", riskLevel: "RED", status: "BLOCKED" });
  });
});
