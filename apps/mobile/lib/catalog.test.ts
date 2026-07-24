import { describe, expect, it } from "vitest";
import { buildCatalogUrl, formatMinorCurrency } from "./catalog";

describe("mobile catalog client", () => {
  it("builds a production-compatible search URL", () => {
    const url = buildCatalogUrl("https://example.test/api/catalog-search", "  перчатки ");
    expect(url).toContain("https://example.test/api/catalog-search?");
    expect(new URL(url).searchParams.get("q")).toBe("перчатки");
  });

  it("formats minor KZT values and request prices", () => {
    expect(formatMinorCurrency(null)).toBe("Цена по запросу");
    expect(formatMinorCurrency(475000)).toContain("4 750");
  });
});
