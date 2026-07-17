import { describe, expect, it } from "vitest";
import { calculatePromotionDiscount, scopeMatches } from "./promotion-engine";

describe("promotion engine", () => {
  it("calculates basis points and caps discount at subtotal", () => {
    expect(calculatePromotionDiscount({ kind: "PERCENTAGE", percentageBasisPoints: 1_500, fixedAmountMinor: null, minimumOrderMinor: null, minimumQuantity: null }, 10_000n, 2).discountMinor).toBe(1_500n);
    expect(calculatePromotionDiscount({ kind: "FIXED_AMOUNT", percentageBasisPoints: null, fixedAmountMinor: 20_000n, minimumOrderMinor: null, minimumQuantity: null }, 10_000n, 1).discountMinor).toBe(10_000n);
  });

  it("enforces minimums and every configured scope dimension", () => {
    expect(calculatePromotionDiscount({ kind: "PERCENTAGE", percentageBasisPoints: 500, fixedAmountMinor: null, minimumOrderMinor: 50_000n, minimumQuantity: 3 }, 40_000n, 3).eligible).toBe(false);
    expect(scopeMatches({ productIds: ["p1"], cityIds: ["c1"] }, { offerId: "o1", productId: "p1", categoryIds: [], cityId: "c1" })).toBe(true);
    expect(scopeMatches({ productIds: ["p1"], cityIds: ["c1"] }, { offerId: "o1", productId: "p1", categoryIds: [], cityId: "c2" })).toBe(false);
  });
});
