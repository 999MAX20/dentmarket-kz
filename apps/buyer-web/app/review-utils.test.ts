import { describe, expect, it } from "vitest";
import { canReviewOrder, reviewSummaryLabel } from "./review-utils";

describe("buyer review presentation", () => {
  it("formats an empty and populated summary", () => {
    expect(reviewSummaryLabel(undefined)).toBe("Пока без отзывов");
    expect(reviewSummaryLabel({ count: 3, averageRating: 4.666 })).toBe(
      "4.7 · 3 отзывов",
    );
  });

  it("only enables reviews for completed or resolved orders", () => {
    expect(canReviewOrder("DELIVERED")).toBe(true);
    expect(canReviewOrder("PENDING")).toBe(false);
  });
});
