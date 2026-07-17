export function calculateRefundAllocation(input: { grossAmountMinor: string; platformFeeMinor: string; alreadyRefundedMinor: string; alreadyFeeRefundedMinor: string; refundAmountMinor: string }) {
  const gross = BigInt(input.grossAmountMinor);
  const fee = BigInt(input.platformFeeMinor);
  const alreadyRefunded = BigInt(input.alreadyRefundedMinor);
  const alreadyFeeRefunded = BigInt(input.alreadyFeeRefundedMinor);
  const refund = BigInt(input.refundAmountMinor);
  if (gross <= 0n || fee < 0n || fee > gross) throw new Error("Invalid allocation amounts");
  if (refund <= 0n || alreadyRefunded < 0n || alreadyRefunded + refund > gross) throw new Error("Invalid refund amount");
  const cumulativeRefund = alreadyRefunded + refund;
  const targetFeeRefund = cumulativeRefund === gross ? fee : fee * cumulativeRefund / gross;
  const platformFeeRefund = targetFeeRefund - alreadyFeeRefunded;
  if (platformFeeRefund < 0n || platformFeeRefund > refund) throw new Error("Invalid cumulative fee refund");
  return {
    platformFeeRefundMinor: platformFeeRefund.toString(),
    netRefundMinor: (refund - platformFeeRefund).toString(),
    cumulativeRefundMinor: cumulativeRefund.toString(),
  };
}
