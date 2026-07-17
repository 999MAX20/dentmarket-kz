export const TRUST_WEIGHTS = {
  availability_accuracy: 0.20,
  price_accuracy: 0.15,
  order_fulfillment: 0.20,
  confirmation_speed: 0.10,
  delivery_ontime: 0.10,
  document_quality: 0.10,
  communication_quality: 0.05,
  data_freshness: 0.05,
  dispute_resolution: 0.05,
} as const;

export type TrustMetricCode = keyof typeof TRUST_WEIGHTS;
export type TrustEvent = { metricCode: string; value: number; weight: number; occurredAt: Date; excludedAt?: Date | null; disputed?: boolean };

const LABELS: Record<TrustMetricCode, string> = {
  availability_accuracy: "Точные остатки",
  price_accuracy: "Цена совпадает с заказом",
  order_fulfillment: "Исполняет заказ полностью",
  confirmation_speed: "Быстро подтверждает",
  delivery_ontime: "Доставка в срок",
  document_quality: "Проверенные документы",
  communication_quality: "Качественная коммуникация",
  data_freshness: "Свежие данные",
  dispute_resolution: "Корректно решает споры",
};

export function calculateSupplierTrust(events: TrustEvent[], now = new Date(), windowDays = 180) {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const active = events.filter((event) => !event.excludedAt && !event.disputed && event.occurredAt.getTime() >= cutoff && event.value >= 0 && event.value <= 1);
  const priorMean = 0.78;
  const priorStrength = 3;
  const halfLifeDays = 90;
  const components = Object.entries(TRUST_WEIGHTS).map(([metricCode, formulaWeight]) => {
    const matching = active.filter((event) => event.metricCode === metricCode);
    let weightedValue = priorMean * priorStrength;
    let effectiveWeight = priorStrength;
    for (const event of matching) {
      const ageDays = Math.max(0, (now.getTime() - event.occurredAt.getTime()) / 86_400_000);
      const decay = Math.pow(0.5, ageDays / halfLifeDays);
      const eventWeight = Math.max(0.01, event.weight) * decay;
      weightedValue += event.value * eventWeight;
      effectiveWeight += eventWeight;
    }
    const value = weightedValue / effectiveWeight;
    return { metricCode: metricCode as TrustMetricCode, label: LABELS[metricCode as TrustMetricCode], value, formulaWeight, sampleSize: matching.length };
  });
  const rawScore = components.reduce((sum, component) => sum + component.value * component.formulaWeight, 0) * 100;
  const confidence = Math.min(1, 1 - Math.exp(-active.length / 12));
  const status = active.length < 5 ? "INSUFFICIENT_DATA" as const : "CALCULATED" as const;
  const sorted = [...components].sort((left, right) => right.value - left.value);
  return {
    status,
    score: status === "CALCULATED" ? Number(rawScore.toFixed(3)) : null,
    confidence: Number(confidence.toFixed(5)),
    eventCount: active.length,
    indicators: components.map((component) => ({ code: component.metricCode, label: component.label, value: Number((component.value * 100).toFixed(1)), sampleSize: component.sampleSize })),
    factors: { strongest: sorted.slice(0, 3).map(({ metricCode, label, value }) => ({ code: metricCode, label, value: Number((value * 100).toFixed(1)) })), weakest: sorted.slice(-3).reverse().map(({ metricCode, label, value }) => ({ code: metricCode, label, value: Number((value * 100).toFixed(1)) })) },
    recommendations: sorted.slice(-3).reverse().map(({ metricCode, label }) => ({ code: metricCode, action: `Улучшить показатель «${label.toLowerCase()}» стабильными подтверждёнными исполнениями` })),
  };
}
