import { approvalConditionsSchema, approvalStepsSchema, type EvaluateApprovalInput } from "@marketplace/schemas";

export type EvaluatedPolicy = {
  id: string;
  name: string;
  priority: number;
  conditions: unknown;
  approvalSteps: unknown;
};

function intersects(left: string[], right: string[]) {
  return left.some((value) => right.includes(value));
}

export function policyMatches(policy: EvaluatedPolicy, request: EvaluateApprovalInput) {
  const parsed = approvalConditionsSchema.safeParse(policy.conditions);
  if (!parsed.success) return false;
  const conditions = parsed.data;
  if (conditions.amountMinMinor !== undefined && request.amountMinor < conditions.amountMinMinor) return false;
  if (conditions.amountMaxMinor !== undefined && request.amountMinor > conditions.amountMaxMinor) return false;
  if (conditions.currencies?.length && !conditions.currencies.includes(request.currency)) return false;
  if (conditions.categoryIds?.length && !intersects(conditions.categoryIds, request.categoryIds)) return false;
  if (conditions.regulatoryClasses?.length && (!request.regulatoryClass || !conditions.regulatoryClasses.includes(request.regulatoryClass))) return false;
  if (conditions.supplierIds?.length && (!request.supplierId || !conditions.supplierIds.includes(request.supplierId))) return false;
  if (conditions.branchIds?.length && (!request.branchId || !conditions.branchIds.includes(request.branchId))) return false;
  if (conditions.urgent !== undefined && request.urgent !== conditions.urgent) return false;
  return true;
}

export function evaluateApprovalPolicies(policies: EvaluatedPolicy[], request: EvaluateApprovalInput) {
  const matches = policies
    .filter((policy) => policyMatches(policy, request))
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));

  return {
    requiresApproval: matches.length > 0,
    matchedPolicies: matches.map(({ id, name, priority }) => ({ id, name, priority })),
    requiredSteps: matches.flatMap((policy) => {
      const parsed = approvalStepsSchema.safeParse(policy.approvalSteps);
      if (!parsed.success) return [];
      return [...parsed.data]
        .sort((left, right) => left.sequence - right.sequence)
        .map((step) => ({ policyId: policy.id, policyName: policy.name, ...step }));
    }),
  };
}
