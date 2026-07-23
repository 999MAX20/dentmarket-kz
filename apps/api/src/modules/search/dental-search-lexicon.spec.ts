import { describe, expect, it } from "vitest";
import { expandDentalSearchQuery } from "./dental-search-lexicon";

describe("dental search lexicon", () => {
  it("expands chair-side slang to catalog terms", () => {
    const result = expandDentalSearchQuery("нужна светник и текучка");
    expect(result.normalizedQuery).toBe("нужна светник и текучка");
    expect(result.expandedQuery).toContain("композит");
    expect(result.expandedQuery).toContain("текучий композит");
    expect(result.matchedAliases).toEqual(expect.arrayContaining(["светник", "текучка"]));
  });

  it("keeps official product queries unchanged when no slang matches", () => {
    const result = expandDentalSearchQuery("3M Filtek Z250");
    expect(result.expandedQuery).toBe("3m filtek z250");
    expect(result.matchedAliases).toEqual([]);
  });

  it("repairs common typos and keyboard layout", () => {
    const typo = expandDentalSearchQuery("коффердамм");
    expect(typo.normalizedQuery).toBe("коффердам");
    expect(typo.expandedQuery).toContain("раббердам");

    const layout = expandDentalSearchQuery("rjvvth");
    expect(layout.expandedQuery).toContain("коммер");
  });

  it("understands treatment purpose and transliteration", () => {
    const crown = expandDentalSearchQuery("для фиксации коронки");
    expect(crown.expandedQuery).toContain("фиксирующий цемент");

    const canal = expandDentalSearchQuery("для определения длины канала");
    expect(canal.expandedQuery).toContain("апекслокатор");

    const transliterated = expandDentalSearchQuery("адгезив");
    expect(transliterated.expandedQuery).toContain("adgeziv");
  });
});
