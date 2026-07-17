export type RecommendationMode = "URGENT" | "VALUE" | "BALANCED" | "TRUSTED" | "PERSONAL_PRICE";

export type RecommendationCandidate = {
  offerId: string;
  productPriceMinor: number;
  deliveryPriceMinor: number;
  etaHours: number;
  freshness: number;
  confirmationProbability: number;
  trustScore: number | null;
  verifiedWarehouse: boolean;
  distanceKm: number | null;
  personalPrice: boolean;
  previouslyPurchased: boolean;
  sponsored: boolean;
  criticalRisk: boolean;
  deliverable: boolean;
  softRiskPenalty?: number;
};

const MODE_WEIGHTS: Record<RecommendationMode, { cost: number; eta: number; trust: number; availability: number; history: number }> = {
  URGENT: { cost: 0.10, eta: 0.45, trust: 0.15, availability: 0.25, history: 0.05 },
  VALUE: { cost: 0.50, eta: 0.15, trust: 0.10, availability: 0.20, history: 0.05 },
  BALANCED: { cost: 0.28, eta: 0.22, trust: 0.20, availability: 0.22, history: 0.08 },
  TRUSTED: { cost: 0.12, eta: 0.15, trust: 0.38, availability: 0.20, history: 0.15 },
  PERSONAL_PRICE: { cost: 0.42, eta: 0.14, trust: 0.14, availability: 0.20, history: 0.10 },
};

const inverseNormalize = (value: number, min: number, max: number) => max === min ? 1 : 1 - (value - min) / (max - min);

export function rankRecommendations(candidates: RecommendationCandidate[], mode: RecommendationMode) {
  const eligible = candidates.filter((candidate) => candidate.deliverable && !candidate.criticalRisk);
  if (!eligible.length) return { organic: [], sponsored: [], organicBestOfferId: null };
  const landed = eligible.map((candidate) => candidate.productPriceMinor + candidate.deliveryPriceMinor);
  const eta = eligible.map((candidate) => candidate.etaHours);
  const weights = MODE_WEIGHTS[mode];
  const ranked = eligible.map((candidate) => {
    const landedCostMinor = candidate.productPriceMinor + candidate.deliveryPriceMinor;
    const costScore = inverseNormalize(landedCostMinor, Math.min(...landed), Math.max(...landed));
    const etaScore = inverseNormalize(candidate.etaHours, Math.min(...eta), Math.max(...eta));
    const trustScore = (candidate.trustScore ?? 70) / 100;
    const availabilityScore = Math.max(0, Math.min(1, candidate.freshness * candidate.confirmationProbability));
    const historyScore = candidate.previouslyPurchased ? 1 : 0.4;
    const personalBonus = mode === "PERSONAL_PRICE" && candidate.personalPrice ? 0.08 : 0;
    const locationPenalty = candidate.verifiedWarehouse ? 0 : 0.08;
    const score = costScore * weights.cost + etaScore * weights.eta + trustScore * weights.trust + availabilityScore * weights.availability + historyScore * weights.history + personalBonus - locationPenalty - (candidate.softRiskPenalty ?? 0);
    const explanation = mode === "URGENT" ? `Поставка примерно за ${candidate.etaHours} ч.` : mode === "VALUE" ? `Итоговая стоимость ${landedCostMinor} тиын с доставкой.` : mode === "TRUSTED" ? `Подтверждённая надёжность ${candidate.trustScore == null ? "ещё накапливается" : `${candidate.trustScore.toFixed(1)} из 100`}.` : mode === "PERSONAL_PRICE" && candidate.personalPrice ? "Доступна цена по договору вашей клиники." : "Лучший баланс итоговой цены, срока, свежести и надёжности.";
    return { ...candidate, landedCostMinor, score: Number(score.toFixed(6)), explanation, localPriorityEligible: candidate.verifiedWarehouse };
  });
  const organic = ranked.sort((left, right) => right.score - left.score).map((item, index) => ({ ...item, organicRank: index + 1, placement: "ORGANIC" as const }));
  const sponsored = organic.filter((item) => item.sponsored).map((item) => ({ ...item, placement: "SPONSORED" as const, disclosure: "Продвижение", organicRankPreserved: true }));
  return { organic, sponsored, organicBestOfferId: organic[0]?.offerId ?? null };
}

export function haversineKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(to.latitude - from.latitude);
  const dLon = radians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
