import { describe, expect, it } from "vitest";
import { normalizeCatalogText, rankVariants, scoreVariant } from "./matching";

describe("supplier matching", () => {
  const variant = { id: "variant-1", sku: "DEMO-COMP-A2", gtin: "1234567890123", product: { canonicalName: "Стоматологический композит A2" } };

  it("normalizes punctuation and case deterministically", () => {
    expect(normalizeCatalogText(" Композит, A2! ")).toBe("композит a2");
  });

  it("gives exact identifiers precedence", () => {
    const result = scoreVariant({ name: "Другой текст", normalizedName: "другой текст", supplierSku: "DEMO-COMP-A2", gtin: "1234567890123" }, variant);
    expect(result.score).toBe(1);
    expect(result.reasons).toEqual(["exact_gtin", "exact_sku"]);
  });

  it("filters weak candidates", () => {
    expect(rankVariants({ name: "Игла", normalizedName: "игла" }, [variant])).toEqual([]);
  });
});
