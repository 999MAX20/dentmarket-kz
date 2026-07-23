import { describe, expect, it } from "vitest";
import { assertIdempotencyKey, calculateSplit } from "../src/index.js";

describe("payments-core", () => {
  it("calculates deterministic minor-unit splits", () => {
    expect(calculateSplit("10000", 200, "KZT", "order-1", "supplier-1")).toMatchObject({
      amount: { amountMinor: "10000", currency: "KZT" },
      platformFee: { amountMinor: "200", currency: "KZT" },
      netAmount: { amountMinor: "9800", currency: "KZT" },
    });
  });

  it("rejects unsafe idempotency keys", () => {
    expect(() => assertIdempotencyKey("short")).toThrow();
    expect(assertIdempotencyKey("checkout-2026-07-24-unique")).toBe("checkout-2026-07-24-unique");
  });
});
