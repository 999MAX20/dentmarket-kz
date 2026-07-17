import { describe, expect, it } from "vitest";
import { numericRangesOverlap, resolvePriceRules } from "./price-resolver";

const now = new Date("2026-07-16T12:00:00.000Z");

describe("price resolver", () => {
  it("applies contract before tier and base", () => {
    const result = resolvePriceRules({ quantity: 10, at: now, contracts: [{ id: "contract", amountMinor: 800, currency: "KZT", minimumQuantity: 1, validFrom: now, priority: 10 }], tiers: [{ id: "tier", amountMinor: 900, currency: "KZT", minimumQuantity: 10, validFrom: now }], base: { id: "base", amountMinor: 1000, currency: "KZT", validFrom: now } });
    expect(result).toMatchObject({ source: "CONTRACT", amountMinor: "800" });
  });

  it("selects the highest eligible tier threshold", () => {
    const result = resolvePriceRules({ quantity: 20, at: now, contracts: [], tiers: [{ id: "tier-1", amountMinor: 900, currency: "KZT", minimumQuantity: 10, validFrom: now }, { id: "tier-2", amountMinor: 850, currency: "KZT", minimumQuantity: 20, validFrom: now }], base: null });
    expect(result.ruleId).toBe("tier-2");
  });

  it("detects overlapping quantity ranges", () => {
    expect(numericRangesOverlap({ minimumQuantity: 1, maximumQuantity: 10 }, { minimumQuantity: 10, maximumQuantity: 20 })).toBe(true);
    expect(numericRangesOverlap({ minimumQuantity: 1, maximumQuantity: 9 }, { minimumQuantity: 10 })).toBe(false);
  });
});
