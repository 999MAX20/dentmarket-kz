import { describe, expect, it } from "vitest";
import { createProductPresentation } from "./product-presentation";

describe("createProductPresentation", () => {
  it.each([
    [
      "1:1 Endo Head Fit For Wireless Motor",
      "Эндодонтическая головка 1:1, для беспроводного мотора",
    ],
    [
      "1:1 fiber optic contra angle dental handpiece",
      "Угловой стоматологический наконечник 1:1, с оптикой",
    ],
    [
      "1:2 Increasing Speed Straight Handpiece",
      "Прямой стоматологический наконечник 1:2, повышающий",
    ],
    [
      "(Wangen-) Klemmelektrode",
      "Щёчный зажим-электрод для депофореза",
    ],
    [
      "Adult Extraction Forcep, FXX17, UPPER 876",
      "Щипцы для удаления зубов для верхней челюсти, взрослые",
    ],
  ])("translates %s into a clinician-friendly title", (name, title) => {
    expect(createProductPresentation({ name }).title).toBe(title);
  });

  it("keeps a Russian title unchanged", () => {
    const result = createProductPresentation({
      name: "Адгезив универсальный, флакон 5 мл",
      description: "Материал для фиксации и реставраций.",
    });
    expect(result.title).toBe("Адгезив универсальный, флакон 5 мл");
    expect(result.originalName).toBeNull();
  });

  it("always gives an untranslated product a Russian type", () => {
    const result = createProductPresentation({
      name: "Aiming ring anterior",
      category: "Dental instruments",
    });
    expect(result.title).toBe("Инструменты · Aiming ring anterior");
    expect(result.originalName).toBe("Aiming ring anterior");
  });
});
