import { describe, expect, it } from "vitest";
import {
  isConfidentAutomaticMatch,
  normalizeCatalogText,
  rankVariants,
  scoreVariant,
} from "./matching";

describe("supplier matching", () => {
  const variant = {
    id: "variant-1",
    sku: "DEMO-COMP-A2",
    gtin: "1234567890123",
    product: { canonicalName: "Стоматологический композит A2" },
  };

  it("normalizes punctuation and case deterministically", () => {
    expect(normalizeCatalogText(" Композит, A2! ")).toBe("композит a2");
  });

  it("gives exact identifiers precedence", () => {
    const result = scoreVariant(
      {
        name: "Другой текст",
        normalizedName: "другой текст",
        supplierSku: "DEMO-COMP-A2",
        gtin: "1234567890123",
      },
      variant,
    );
    expect(result.score).toBe(1);
    expect(result.reasons).toEqual(["exact_gtin", "exact_sku"]);
  });

  it("filters weak candidates", () => {
    expect(
      rankVariants({ name: "Игла", normalizedName: "игла" }, [variant]),
    ).toEqual([]);
  });

  it("matches an official catalog alias without moderation", () => {
    const aliasedVariant = {
      ...variant,
      product: {
        canonicalName: "NSK Ti-Max Z990",
        externalMetadata: { catalogAliases: ["Z990L", "Ti-Max Z990"] },
        brand: { name: "NSK" },
      },
    };
    const candidates = rankVariants(
      { name: "Z990L", normalizedName: "z990l", brandText: "NSK" },
      [aliasedVariant],
    );
    expect(candidates[0]?.reasons).toContain("exact_alias");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("auto-matches a unique high-confidence model with packaging text", () => {
    const model = {
      ...variant,
      product: {
        canonicalName: "Ivoclar Tetric Prime",
        externalMetadata: { catalogAliases: ["Tetric Prime"] },
        brand: { name: "Ivoclar" },
        manufacturer: { name: "Ivoclar Vivadent AG" },
      },
    };
    const candidates = rankVariants(
      {
        name: "Tetric Prime A2 шприц 3 г",
        normalizedName: "tetric prime a2 шприц 3 г",
        brandText: "Ivoclar",
        manufacturerText: "Ivoclar Vivadent AG",
      },
      [model],
    );
    expect(candidates[0]?.score).toBeGreaterThanOrEqual(0.9);
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("does not auto-match a duplicate alias shared by two variants", () => {
    const sharedProduct = {
      canonicalName: "Tokuyama Omnichroma",
      externalMetadata: { catalogAliases: ["Omnichroma"] },
      brand: { name: "Tokuyama Dental" },
    };
    const candidates = rankVariants(
      {
        name: "Omnichroma",
        normalizedName: "omnichroma",
        brandText: "Tokuyama Dental",
      },
      [
        { ...variant, id: "variant-a", product: sharedProduct },
        { ...variant, id: "variant-b", product: sharedProduct },
      ],
    );
    expect(isConfidentAutomaticMatch(candidates)).toBe(false);
  });

  it("matches a Solventum catalog number even when the supplier name is abbreviated", () => {
    const solventumVariant = {
      ...variant,
      product: {
        canonicalName: "3M RelyX Universal Resin Cement",
        externalMetadata: {
          catalogAliases: ["RelyX Universal", "56971", "56972"],
        },
        brand: { name: "Solventum" },
        manufacturer: { name: "Solventum Corporation" },
      },
    };
    const candidates = rankVariants(
      {
        name: "56971 RelyX TR refill",
        normalizedName: "56971 relyx tr refill",
        brandText: "3M",
      },
      [solventumVariant],
    );
    expect(candidates[0]?.reasons).toContain("catalog_code");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("matches a Kerr kit by manufacturer catalog number", () => {
    const kerrVariant = {
      ...variant,
      product: {
        canonicalName: "Kerr OptiBond Universal",
        externalMetadata: {
          catalogAliases: ["OptiBond Universal", "36517", "36518", "36519"],
        },
        brand: { name: "Kerr" },
        manufacturer: { name: "Kerr Corporation" },
      },
    };
    const candidates = rankVariants(
      {
        name: "36517 Optibond Universal набор",
        normalizedName: "36517 optibond universal набор",
        brandText: "Kerr",
      },
      [kerrVariant],
    );
    expect(candidates[0]?.reasons).toContain("catalog_code");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("keeps a leading zero when matching a GC catalog number", () => {
    const gcVariant = {
      ...variant,
      product: {
        canonicalName: "GC FujiCEM Evolve",
        externalMetadata: {
          catalogAliases: ["FujiCEM Evolve", "012948", "012950"],
        },
        brand: { name: "GC" },
        manufacturer: { name: "GC Corporation" },
      },
    };
    const candidates = rankVariants(
      {
        name: "012948 FujiCEM Evolve single pack",
        normalizedName: "012948 fujicem evolve single pack",
        brandText: "GC",
      },
      [gcVariant],
    );
    expect(candidates[0]?.reasons).toContain("catalog_code");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });
});
