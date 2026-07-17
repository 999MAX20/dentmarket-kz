export type PriceRule = {
  id: string;
  amountMinor: string | number;
  currency: string;
  minimumQuantity: string | number;
  maximumQuantity?: string | number | null;
  validFrom: Date;
  validTo?: Date | null;
  priority?: number;
};

function validAt(rule: PriceRule, at: Date) {
  return rule.validFrom <= at && (!rule.validTo || rule.validTo >= at);
}

function quantityMatches(rule: PriceRule, quantity: number) {
  return Number(rule.minimumQuantity) <= quantity && (rule.maximumQuantity == null || Number(rule.maximumQuantity) >= quantity);
}

export function resolvePriceRules(input: { quantity: number; at: Date; contracts: PriceRule[]; tiers: PriceRule[]; base?: Omit<PriceRule, "minimumQuantity"> | null }) {
  const contract = input.contracts.filter((rule) => validAt(rule, input.at) && quantityMatches(rule, input.quantity))
    .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100) || Number(right.minimumQuantity) - Number(left.minimumQuantity) || left.id.localeCompare(right.id))[0];
  if (contract) return { source: "CONTRACT" as const, ruleId: contract.id, amountMinor: String(contract.amountMinor), currency: contract.currency };

  const tier = input.tiers.filter((rule) => validAt(rule, input.at) && quantityMatches(rule, input.quantity))
    .sort((left, right) => Number(right.minimumQuantity) - Number(left.minimumQuantity) || left.id.localeCompare(right.id))[0];
  if (tier) return { source: "TIER" as const, ruleId: tier.id, amountMinor: String(tier.amountMinor), currency: tier.currency };

  if (input.base && validAt({ ...input.base, minimumQuantity: 1 }, input.at)) return { source: "BASE" as const, ruleId: input.base.id, amountMinor: String(input.base.amountMinor), currency: input.base.currency };
  return { source: "UNAVAILABLE" as const, ruleId: null, amountMinor: null, currency: null };
}

export function numericRangesOverlap(left: { minimumQuantity: number; maximumQuantity?: number | null }, right: { minimumQuantity: number; maximumQuantity?: number | null }) {
  const leftMax = left.maximumQuantity ?? Number.POSITIVE_INFINITY;
  const rightMax = right.maximumQuantity ?? Number.POSITIVE_INFINITY;
  return left.minimumQuantity <= rightMax && right.minimumQuantity <= leftMax;
}
