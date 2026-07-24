import { describe, expect, it } from "vitest";

import { classifyCatalogProduct } from "./catalog-taxonomy";

describe("orthodontic catalog grain", () => {
  it.each([
    ["Ceramic Brackets", "brackets"],
    ["Набор брекетов Damon Q2 ВЧ 5+5", "brackets"],
    ["Bracket positioning gauge", "bracket-instruments"],
    ["Dental Posterior Bracket Remover Curved", "bracket-instruments"],
    ["Ортодонтическая дуга NiTi 0.016", "archwires"],
    ["Лигатура для брекетов прозрачная", "orthodontic-ligatures"],
    ["Эластомерная цепочка закрытая", "orthodontic-chains"],
    ["Ортодонтический адгезив для фиксации брекетов", "orthodontic-adhesives"],
    ["Набор по уходу за брекет-системой Brace Kit", "braces-care"],
  ])("classifies %s independently", (name, expected) => {
    expect(classifyCatalogProduct({ name }).id).toBe(expected);
  });

  it("does not mistake a curing-light mounting bracket for an orthodontic bracket", () => {
    expect(
      classifyCatalogProduct({
        name: "VALO Mounting Bracket",
        description: "Mounting accessory for a curing light.",
      }).id,
    ).not.toBe("brackets");
  });
});
