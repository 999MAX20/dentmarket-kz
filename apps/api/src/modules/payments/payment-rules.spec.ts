import { describe, expect, it } from "vitest";
import { calculateRefundAllocation } from "./payment-rules";

describe("payment refund rounding", () => {
  it("assigns deterministic floor rounding to every partial refund", () => {
    const first = calculateRefundAllocation({ grossAmountMinor: "1001", platformFeeMinor: "20", alreadyRefundedMinor: "0", alreadyFeeRefundedMinor: "0", refundAmountMinor: "333" });
    expect(first).toEqual({ platformFeeRefundMinor: "6", netRefundMinor: "327", cumulativeRefundMinor: "333" });
    const second = calculateRefundAllocation({ grossAmountMinor: "1001", platformFeeMinor: "20", alreadyRefundedMinor: "333", alreadyFeeRefundedMinor: "6", refundAmountMinor: "333" });
    expect(second).toEqual({ platformFeeRefundMinor: "7", netRefundMinor: "326", cumulativeRefundMinor: "666" });
  });

  it("assigns the final rounding remainder on the full refund", () => {
    const final = calculateRefundAllocation({ grossAmountMinor: "1001", platformFeeMinor: "20", alreadyRefundedMinor: "666", alreadyFeeRefundedMinor: "13", refundAmountMinor: "335" });
    expect(final).toEqual({ platformFeeRefundMinor: "7", netRefundMinor: "328", cumulativeRefundMinor: "1001" });
    expect(13 + Number(final.platformFeeRefundMinor)).toBe(20);
  });

  it("rejects over-refunds", () => {
    expect(() => calculateRefundAllocation({ grossAmountMinor: "100", platformFeeMinor: "2", alreadyRefundedMinor: "90", alreadyFeeRefundedMinor: "1", refundAmountMinor: "11" })).toThrow("Invalid refund amount");
  });
});
