export const REVIEWABLE_ORDER_STATUSES = new Set([
  "DELIVERED",
  "PARTIALLY_FULFILLED",
  "RETURN_DISPUTE",
  "REJECTED",
  "CANCELLED",
]);

export function reviewSummaryLabel(
  summary: { count: number; averageRating: number } | null | undefined,
) {
  if (!summary || summary.count === 0) return "Пока без отзывов";
  return `${summary.averageRating.toFixed(1)} · ${summary.count} отзывов`;
}

export function canReviewOrder(status: string) {
  return REVIEWABLE_ORDER_STATUSES.has(status);
}
