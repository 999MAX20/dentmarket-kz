import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export function calculateLineTotal(unitPriceMinor: string | number, quantity: string | number) {
  return new Prisma.Decimal(unitPriceMinor).mul(quantity).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
}

export function calculateAllocation(grossAmountMinor: string | number, feeBasisPoints = 200) {
  const gross = BigInt(String(grossAmountMinor));
  const fee = (gross * BigInt(feeBasisPoints) + 5_000n) / 10_000n;
  return { gross: gross.toString(), fee: fee.toString(), net: (gross - fee).toString() };
}

export function resolveSupplierOrderState(items: Array<{ quantity: string | number; acceptedQuantity: string | number }>) {
  if (items.length === 0) throw new BadRequestException("Supplier order must contain at least one item");
  let accepted = 0;
  let fullyAccepted = 0;
  for (const item of items) {
    const requested = Number(item.quantity);
    const decision = Number(item.acceptedQuantity);
    if (!Number.isFinite(decision) || decision < 0 || decision > requested) throw new BadRequestException("Accepted quantity must be between zero and requested quantity");
    if (decision > 0) accepted += 1;
    if (decision === requested) fullyAccepted += 1;
  }
  if (accepted === 0) return "REJECTED" as const;
  if (fullyAccepted === items.length) return "CONFIRMED" as const;
  return "PARTIALLY_CONFIRMED" as const;
}

export function quantityMatchesOffer(quantity: number, minimum: string | number, increment: string | number) {
  const delta = quantity - Number(minimum);
  if (delta < -1e-9) return false;
  const steps = delta / Number(increment);
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}
