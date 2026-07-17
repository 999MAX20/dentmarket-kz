export type PromotionRule = {
  kind: "PERCENTAGE" | "FIXED_AMOUNT" | "FREE_SHIPPING";
  percentageBasisPoints: number | null;
  fixedAmountMinor: bigint | null;
  minimumOrderMinor: bigint | null;
  minimumQuantity: number | null;
};

export function calculatePromotionDiscount(rule: PromotionRule, subtotalMinor: bigint, quantity: number) {
  if (subtotalMinor < 0n || quantity <= 0) return { eligible: false, discountMinor: 0n, reason: "invalid_amount_or_quantity" };
  if (rule.minimumOrderMinor != null && subtotalMinor < rule.minimumOrderMinor) return { eligible: false, discountMinor: 0n, reason: "minimum_order_not_reached" };
  if (rule.minimumQuantity != null && quantity < rule.minimumQuantity) return { eligible: false, discountMinor: 0n, reason: "minimum_quantity_not_reached" };
  if (rule.kind === "FREE_SHIPPING") return { eligible: true, discountMinor: 0n, freeShipping: true };
  const raw = rule.kind === "PERCENTAGE" ? subtotalMinor * BigInt(rule.percentageBasisPoints ?? 0) / 10_000n : rule.fixedAmountMinor ?? 0n;
  return { eligible: raw > 0n, discountMinor: raw > subtotalMinor ? subtotalMinor : raw, freeShipping: false, reason: raw > 0n ? undefined : "zero_discount" };
}

export function scopeMatches(scope: { offerIds?: string[]; productIds?: string[]; categoryIds?: string[]; cityIds?: string[]; warehouseIds?: string[] }, target: { offerId: string; productId: string; categoryIds: string[]; cityId?: string | null; warehouseId?: string | null }) {
  const dimensions: Array<[string[] | undefined, boolean]> = [
    [scope.offerIds, scope.offerIds?.includes(target.offerId) ?? false],
    [scope.productIds, scope.productIds?.includes(target.productId) ?? false],
    [scope.categoryIds, scope.categoryIds?.some((id) => target.categoryIds.includes(id)) ?? false],
    [scope.cityIds, Boolean(target.cityId && scope.cityIds?.includes(target.cityId))],
    [scope.warehouseIds, Boolean(target.warehouseId && scope.warehouseIds?.includes(target.warehouseId))],
  ];
  return dimensions.every(([configured, matched]) => !configured || configured.length === 0 || matched);
}
