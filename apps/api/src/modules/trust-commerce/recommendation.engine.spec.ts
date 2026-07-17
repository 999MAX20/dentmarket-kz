import { describe, expect, it } from "vitest";
import { haversineKm, rankRecommendations, type RecommendationCandidate } from "./recommendation.engine";

const candidate = (override: Partial<RecommendationCandidate>): RecommendationCandidate => ({ offerId: "base", productPriceMinor: 10_000, deliveryPriceMinor: 0, etaHours: 24, freshness: 1, confirmationProbability: 0.95, trustScore: 85, verifiedWarehouse: true, distanceKm: 10, personalPrice: false, previouslyPurchased: false, sponsored: false, criticalRisk: false, deliverable: true, ...override });

describe("smart recommendation fairness", () => {
  it("keeps the organic result intact and labels paid placement separately", () => {
    const result = rankRecommendations([candidate({ offerId: "best", productPriceMinor: 8_000 }), candidate({ offerId: "paid", productPriceMinor: 9_000, sponsored: true })], "VALUE");
    expect(result.organicBestOfferId).toBe("best");
    expect(result.organic.map(({ offerId }) => offerId)).toEqual(["best", "paid"]);
    expect(result.sponsored[0]).toMatchObject({ offerId: "paid", disclosure: "Продвижение", organicRankPreserved: true });
  });

  it("never promotes an undeliverable or critical-risk offer", () => {
    const result = rankRecommendations([candidate({ offerId: "safe" }), candidate({ offerId: "blocked", sponsored: true, criticalRisk: true }), candidate({ offerId: "remote", sponsored: true, deliverable: false })], "BALANCED");
    expect(result.organic.map(({ offerId }) => offerId)).toEqual(["safe"]);
    expect(result.sponsored).toEqual([]);
  });

  it("calculates realistic city distances", () => {
    const distance = haversineKm({ latitude: 43.2389, longitude: 76.8897 }, { latitude: 51.1694, longitude: 71.4491 });
    expect(distance).toBeGreaterThan(900);
    expect(distance).toBeLessThan(1_100);
  });
});
