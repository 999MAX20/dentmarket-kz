import { describe, expect, it } from "vitest";
import { annualRenewalProjection } from "./marketplace-agreements.service";

describe("marketplace agreement annual renewal", () => {
  it("renews an expired annual agreement for exactly one next period", () => {
    const projection = annualRenewalProjection(new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-02T00:00:00.000Z"));
    expect(projection).toEqual({ startsAt: new Date("2026-07-01T00:00:00.000Z"), endsAt: new Date("2027-07-01T00:00:00.000Z"), periods: 1 });
  });

  it("catches up every missed annual period after downtime", () => {
    const projection = annualRenewalProjection(new Date("2023-07-01T00:00:00.000Z"), new Date("2026-07-17T00:00:00.000Z"));
    expect(projection).toEqual({ startsAt: new Date("2026-07-01T00:00:00.000Z"), endsAt: new Date("2027-07-01T00:00:00.000Z"), periods: 4 });
  });
});
