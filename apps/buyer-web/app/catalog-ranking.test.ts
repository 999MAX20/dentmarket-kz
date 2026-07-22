import { describe, expect, it } from "vitest";
import {
  deliveryLabel,
  rankCompareOffers,
  rankSearchOffers,
} from "./catalog-ranking";

describe("catalog offer ranking", () => {
  it("prefers an available verified offer over a cheaper unverified offer", () => {
    const offers = rankSearchOffers([
      {
        id: "cheap",
        priceMinor: "90000",
        normalizedPriceMinor: "90000",
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["PICKUP"],
        verifiedDocuments: false,
      },
      {
        id: "recommended",
        priceMinor: "100000",
        normalizedPriceMinor: "100000",
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["CARRIER"],
        verifiedDocuments: true,
      },
    ]);
    expect(offers[0].id).toBe("recommended");
  });

  it("uses trust and delivery when compare offers have equal eligibility", () => {
    const base = {
      price: { normalizedPriceMinor: "100000" },
      availability: [{ quantityAvailable: "5" }],
      delivery: [{ method: "CARRIER", minLeadTimeHours: 12, maxLeadTimeHours: 24 }],
      markers: {
        verifiedDocuments: true,
        officialDistributor: false,
        requiresConfirmation: false,
      },
    };
    const offers = rankCompareOffers(
      [
        { ...base, offerId: "low-trust", supplier: { organizationId: "one" } },
        { ...base, offerId: "high-trust", supplier: { organizationId: "two" } },
      ],
      { one: { score: "55" }, two: { score: "92" } },
    );
    expect(offers[0].offerId).toBe("high-trust");
  });

  it("returns human delivery labels", () => {
    expect(deliveryLabel(["NATIONWIDE", "PICKUP"])).toBe("Доставка по Казахстану");
    expect(deliveryLabel([])).toBe("Условия доставки уточняются");
  });
});
