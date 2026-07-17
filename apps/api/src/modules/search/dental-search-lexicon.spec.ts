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
});
