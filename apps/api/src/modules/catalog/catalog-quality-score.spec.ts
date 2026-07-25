import { describe, expect, it } from "vitest";
import { scoreCatalogCard } from "./catalog-quality-score";

const complete = {
  id: "product-1",
  canonicalName: "Адгезивная система Scotchbond Universal Plus",
  description:
    "Универсальная адгезивная система для прямых и непрямых реставраций.",
  manufacturerSku: "41294",
  gtin: null,
  brandId: "brand-1",
  manufacturerId: "manufacturer-1",
  regulatoryClass: null,
  externalMetadata: {},
  categories: 1,
  attributes: 6,
  variants: 3,
  readyMedia: 1,
  verifiedSources: 1,
};

describe("catalog quality score", () => {
  it("marks a complete card ready", () => {
    expect(scoreCatalogCard(complete)).toEqual({
      score: 100,
      status: "READY",
      missing: [],
    });
  });

  it("keeps an incomplete card in the correction queue", () => {
    const result = scoreCatalogCard({
      ...complete,
      canonicalName: "REF 41294",
      description: null,
      categories: 0,
      attributes: 0,
      variants: 0,
      readyMedia: 0,
      verifiedSources: 0,
      manufacturerSku: null,
      brandId: null,
      manufacturerId: null,
    });
    expect(result.status).toBe("MODERATION");
    expect(result.missing).toContain("Понятное название");
    expect(result.missing).toContain("Проверенное фото");
  });
});
