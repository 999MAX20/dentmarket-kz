import { describe, expect, it } from "vitest";
import { calculateAllocation, calculateLineTotal, quantityMatchesOffer, resolveSupplierOrderState } from "./commerce-rules";

describe("commerce money and state invariants", () => {
  it("rounds fractional line totals deterministically", () => {
    expect(calculateLineTotal("12501", "1.5").toString()).toBe("18752");
  });

  it("keeps allocation gross equal to fee plus supplier net", () => {
    const allocation = calculateAllocation("12345");
    expect(allocation).toEqual({ gross: "12345", fee: "247", net: "12098" });
    expect(BigInt(allocation.fee) + BigInt(allocation.net)).toBe(BigInt(allocation.gross));
  });

  it("derives supplier order state from all line decisions", () => {
    expect(resolveSupplierOrderState([{ quantity: 2, acceptedQuantity: 2 }])).toBe("CONFIRMED");
    expect(resolveSupplierOrderState([{ quantity: 2, acceptedQuantity: 1 }])).toBe("PARTIALLY_CONFIRMED");
    expect(resolveSupplierOrderState([{ quantity: 2, acceptedQuantity: 0 }])).toBe("REJECTED");
  });

  it("enforces minimum quantity and order increments", () => {
    expect(quantityMatchesOffer(5, 1, 2)).toBe(true);
    expect(quantityMatchesOffer(4, 1, 2)).toBe(false);
  });
});
