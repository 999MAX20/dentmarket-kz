import { describe, expect, it } from "vitest";
import {
  expandDentalSearchQuery,
  normalizeDentalSearchText,
} from "./dental-search";

describe("dental catalog language", () => {
  it.each([
    ["текучка", "текучий композит"],
    ["светник", "светоотверждаемый композит"],
    ["для фиксации коронки", "фиксирующий цемент"],
    ["для определения длины канала", "апекслокатор"],
    ["апекслокаторр", "апекслокатор"],
  ])("interprets %s as %s", (query, expected) => {
    const result = expandDentalSearchQuery(query);
    expect(result.concepts.flat()).toContain(
      normalizeDentalSearchText(expected),
    );
  });

  it("keeps model, REF and variant values as required concepts", () => {
    const result = expandDentalSearchQuery("Scotchbond REF 41294 5 мл");
    expect(result.concepts.some((values) => values.includes("scotchbond"))).toBe(
      true,
    );
    expect(result.concepts.some((values) => values.includes("41294"))).toBe(true);
    expect(result.concepts.some((values) => values.includes("5"))).toBe(true);
    expect(result.concepts.some((values) => values.includes("мл"))).toBe(true);
  });

  it("adds keyboard-layout and transliteration variants", () => {
    expect(expandDentalSearchQuery("flutpbd").concepts.flat()).toContain(
      "адгезив",
    );
    expect(expandDentalSearchQuery("адгезив").concepts.flat()).toContain(
      "adgeziv",
    );
  });
});
