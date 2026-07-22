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
      sku: "56971",
      product: {
        canonicalName: "3M RelyX Universal Resin Cement",
        externalMetadata: {
          catalogAliases: ["RelyX Universal"],
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
    expect(candidates[0]?.reasons).toContain("manufacturer_ref");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("matches a Kerr kit by manufacturer catalog number", () => {
    const kerrVariant = {
      ...variant,
      sku: "36517",
      product: {
        canonicalName: "Kerr OptiBond Universal",
        externalMetadata: {
          catalogAliases: ["OptiBond Universal"],
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
    expect(candidates[0]?.reasons).toContain("manufacturer_ref");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("keeps a leading zero when matching a GC catalog number", () => {
    const gcVariant = {
      ...variant,
      sku: "012948",
      product: {
        canonicalName: "GC FujiCEM Evolve",
        externalMetadata: {
          catalogAliases: ["FujiCEM Evolve"],
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
    expect(candidates[0]?.reasons).toContain("manufacturer_ref");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("matches a VOCO product by manufacturer REF number", () => {
    const vocoVariant = {
      ...variant,
      sku: "1577",
      product: {
        canonicalName: "VOCO Futurabond U",
        externalMetadata: {
          catalogAliases: ["Futurabond U"],
        },
        brand: { name: "VOCO" },
        manufacturer: { name: "VOCO GmbH" },
      },
    };
    const candidates = rankVariants(
      {
        name: "1577 Futurabond U bottle 5 ml",
        normalizedName: "1577 futurabond u bottle 5 ml",
        brandText: "VOCO",
      },
      [vocoVariant],
    );
    expect(candidates[0]?.reasons).toContain("manufacturer_ref");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("selects the exact shade and package inside one product family", () => {
    const product = {
      canonicalName: "VOCO Admira Fusion",
      externalMetadata: { catalogAliases: ["Admira Fusion"] },
      brand: { name: "VOCO" },
      manufacturer: { name: "VOCO GmbH" },
    };
    const candidates = rankVariants(
      {
        name: "Admira Fusion шприц 3 г оттенок А2",
        normalizedName: "admira fusion шприц 3 г оттенок а2",
        brandText: "VOCO",
      },
      [
        {
          id: "admira-a1",
          sku: "2754",
          externalMetadata: {
            label: "Шприц 3 г · оттенок A1",
            attributes: {
              "Форма выпуска": "Шприц",
              Масса: "3 г",
              Оттенок: "A1",
            },
          },
          product,
        },
        {
          id: "admira-a2",
          sku: "2755",
          externalMetadata: {
            label: "Шприц 3 г · оттенок A2",
            attributes: {
              "Форма выпуска": "Шприц",
              Масса: "3 г",
              Оттенок: "A2",
            },
          },
          product,
        },
      ],
    );

    expect(candidates[0]?.variant.id).toBe("admira-a2");
    expect(candidates[0]?.reasons).toContain("exact_variant_shade");
    expect(candidates[1]?.reasons).toContain("variant_shade_conflict");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("keeps a family match in moderation when the package conflicts", () => {
    const product = {
      canonicalName: "Тестовый композит",
      brand: { name: "Demo" },
    };
    const candidates = rankVariants(
      {
        name: "Тестовый композит шприц 5 г",
        normalizedName: "тестовый композит шприц 5 г",
        brandText: "Demo",
      },
      [
        {
          id: "demo-3g",
          externalMetadata: {
            label: "Шприц 3 г",
            attributes: { "Форма выпуска": "Шприц", Масса: "3 г" },
          },
          product,
        },
        {
          id: "demo-4g",
          externalMetadata: {
            label: "Шприц 4 г",
            attributes: { "Форма выпуска": "Шприц", Масса: "4 г" },
          },
          product,
        },
      ],
    );

    expect(
      candidates.every(({ reasons }) =>
        reasons.includes("variant_measure_conflict"),
      ),
    ).toBe(true);
    expect(isConfidentAutomaticMatch(candidates)).toBe(false);
  });

  it("distinguishes a QuickMix kit from a refill with the same shade", () => {
    const product = {
      canonicalName: "VOCO Bifix QM",
      externalMetadata: { catalogAliases: ["Bifix QM"] },
      brand: { name: "VOCO" },
    };
    const candidates = rankVariants(
      {
        name: "Bifix QM набор QuickMix 10 г универсальный",
        normalizedName: "bifix qm набор quickmix 10 г универсальный",
        brandText: "VOCO",
      },
      [
        {
          id: "bifix-kit",
          externalMetadata: {
            label: "Набор QuickMix 10 г универсальный",
            attributes: {
              "Форма выпуска": "Набор",
              Масса: "10 г",
              Оттенок: "универсальный",
            },
          },
          product,
        },
        {
          id: "bifix-refill",
          externalMetadata: {
            label: "QuickMix 10 г универсальный",
            attributes: {
              "Форма выпуска": "Шприц QuickMix",
              Масса: "10 г",
              Оттенок: "универсальный",
            },
          },
          product,
        },
      ],
    );

    expect(candidates[0]?.variant.id).toBe("bifix-kit");
    expect(candidates[1]?.reasons).toContain("variant_form_conflict");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });

  it("matches a supplier row by an official legacy manufacturer reference", () => {
    const product = {
      canonicalName: "GC Initial LiSi Press",
      externalMetadata: { catalogAliases: ["Initial LiSi Press"] },
      brand: { name: "GC" },
      manufacturer: { name: "GC Corporation" },
    };
    const candidates = rankVariants(
      {
        name: "Initial LiSi Press HT-EXW 5x3 g",
        normalizedName: "initial lisi press ht exw 5x3 g",
        supplierSku: "901428",
        brandText: "GC",
      },
      [
        {
          id: "lisi-press-ht-exw",
          sku: "10003665",
          externalMetadata: {
            label: "5 слитков по 3 г · HT-EXW",
            manufacturerReferenceAliases: ["901428"],
          },
          product,
        },
      ],
    );

    expect(candidates[0]?.reasons).toContain("exact_sku_alias");
    expect(isConfidentAutomaticMatch(candidates)).toBe(true);
  });
});
