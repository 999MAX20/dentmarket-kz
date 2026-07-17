import { describe, expect, it } from "vitest";
import { evaluateApprovalPolicies, policyMatches, type EvaluatedPolicy } from "./approval-policy.evaluator";

const policy: EvaluatedPolicy = {
  id: "policy-b",
  name: "Крупный срочный заказ",
  priority: 20,
  conditions: { amountMinMinor: 1_000_000, currencies: ["KZT"], categoryIds: ["00000000-0000-4000-8000-000000000010"], urgent: true },
  approvalSteps: [{ sequence: 2, approverRoleCodes: ["finance_manager"], minApprovals: 1 }, { sequence: 1, approverRoleCodes: ["procurement_manager"], minApprovals: 1 }],
};

describe("approval policy evaluator", () => {
  it("matches every configured condition", () => {
    expect(policyMatches(policy, {
      amountMinor: 1_500_000,
      currency: "KZT",
      categoryIds: ["00000000-0000-4000-8000-000000000010"],
      urgent: true,
    })).toBe(true);
  });

  it("rejects a request when any configured condition differs", () => {
    expect(policyMatches(policy, { amountMinor: 1_500_000, currency: "KZT", categoryIds: [], urgent: true })).toBe(false);
  });

  it("returns all matching policies and stable step order", () => {
    const result = evaluateApprovalPolicies([
      policy,
      { ...policy, id: "policy-a", name: "Базовый контроль", priority: 10, conditions: {} },
    ], { amountMinor: 1_500_000, currency: "KZT", categoryIds: ["00000000-0000-4000-8000-000000000010"], urgent: true });
    expect(result.matchedPolicies.map(({ id }) => id)).toEqual(["policy-a", "policy-b"]);
    expect(result.requiredSteps.slice(0, 2).map(({ sequence }) => sequence)).toEqual([1, 2]);
  });
});
