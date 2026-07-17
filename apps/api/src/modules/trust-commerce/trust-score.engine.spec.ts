import { describe, expect, it } from "vitest";
import { calculateSupplierTrust } from "./trust-score.engine";

describe("supplier trust score", () => {
  const now = new Date("2026-07-17T00:00:00.000Z");

  it("shows insufficient data instead of punishing a new supplier", () => {
    const result = calculateSupplierTrust([{ metricCode: "order_fulfillment", value: 1, weight: 1, occurredAt: now }], now);
    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.score).toBeNull();
  });

  it("decays old mistakes and excludes corrected events", () => {
    const codes = ["availability_accuracy", "price_accuracy", "order_fulfillment", "confirmation_speed", "delivery_ontime", "document_quality", "communication_quality", "data_freshness", "dispute_resolution"];
    const recent = codes.map((metricCode) => ({ metricCode, value: 1, weight: 1, occurredAt: now }));
    const oldFailure = { metricCode: "delivery_ontime", value: 0, weight: 1, occurredAt: new Date("2026-02-01T00:00:00.000Z") };
    const excludedFailure = { metricCode: "order_fulfillment", value: 0, weight: 20, occurredAt: now, excludedAt: now };
    const result = calculateSupplierTrust([...recent, oldFailure, excludedFailure], now);
    expect(result.status).toBe("CALCULATED");
    expect(result.score).toBeGreaterThan(80);
    expect(result.eventCount).toBe(10);
    expect(result.recommendations.length).toBe(3);
  });
});
