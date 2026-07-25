import { describe, expect, it } from "vitest";
import { createProductPresentation } from "./product-presentation";

describe("product detail presentation", () => {
  it("explains the Humanchemie cheek clamp electrode in Russian", () => {
    const result = createProductPresentation(
      {
        name: "(Wangen-) Klemmelektrode",
        description:
          "(Wangen-) Klemmelektrode für Depotphorese®-Geräte Magis® oder Original II",
        brand: "Humanchemie",
        manufacturer: "Humanchemie GmbH",
        category: "Эндодонтические принадлежности",
      },
      [["Артикул производителя", "41"]],
      "41",
    );

    expect(result.title).toBe(
      "Щёчный электрод-зажим для аппаратов депофореза",
    );
    expect(result.summary).toContain("фиксируется на щеке пациента");
    expect(result.facts).toEqual(
      expect.arrayContaining([
        {
          label: "Совместимость",
          value: "Humanchemie Magis и Original II",
        },
        { label: "Код производителя", value: "41" },
      ]),
    );
    expect(result.originalName).toBe("(Wangen-) Klemmelektrode");
  });

  it("keeps a clear Russian product name and description", () => {
    const result = createProductPresentation(
      {
        name: "Адгезив стоматологический",
        description: "Материал для фиксации реставраций.",
        brand: "Example",
        category: "Адгезивные системы",
      },
      [["Объём", "5 мл"]],
      "A-5",
    );

    expect(result.title).toBe("Адгезив стоматологический");
    expect(result.summary).toBe("Материал для фиксации реставраций.");
    expect(result.originalName).toBeNull();
    expect(result.facts).toEqual([
      { label: "В упаковке", value: "5 мл" },
      { label: "Код производителя", value: "A-5" },
    ]);
  });

  it("adds a Russian category before an untranslated model name", () => {
    const result = createProductPresentation(
      {
        name: "Scotchbond Universal Adhesive",
        description: "Universal dental adhesive",
        brand: "Solventum",
        category: "Адгезивные системы",
      },
      [],
    );

    expect(result.title).toBe(
      "Адгезивные системы: Scotchbond Universal Adhesive",
    );
    expect(result.originalName).toBeNull();
    expect(result.summary).toContain("Адгезивные системы");
  });

  it.each([
    [
      "(Wangen-) Hakenelektrode",
      "Щёчный электрод-крючок для аппаратов депофореза",
    ],
    [
      "(Wurzelkanal-) Nadelelektrode",
      "Игольчатый электрод для корневого канала",
    ],
    [
      "0.4mm Up & Down Movement Endo Head",
      "Эндодонтическая головка с ходом 0,4 мм",
    ],
  ])("turns %s into a readable catalog title", (name, expected) => {
    const result = createProductPresentation(
      {
        name,
        description: name,
        category: "Эндодонтические принадлежности",
      },
      [],
    );

    expect(result.title).toBe(expected);
    expect(result.summary).toMatch(/[А-ЯЁа-яё]/u);
  });

  it.each([
    "Atacamit-Wurzelfüllzement",
    "Calciumhydroxid-hochdispers 15 g Paste im Fläschen",
    "Calciumhydroxid-hochdispers Dosierspritze mit 1,7 g Paste und 5 Kanülen",
    "Cupral® 15 g Paste im Fläschchen",
    "Cupral® 5 g Paste im Fläschchen",
    "Cupral® Dosierspritze mit 1,7 g Paste und 5 Kanülen",
    "Cupral® liquid",
    "Dentin-Versiegelungsliquid Großsparpackung 2 x 20 ml",
    "Dentin-Versiegelungsliquid Probierpackung 2 x 5 ml",
    "Ersatzkanülen 100 Stück",
    "Galvanisches Stiftelement",
    "Hämostatikum Al-Cu",
    "Handstück",
    "Interims-Kronenzement",
    "Kavitäten-Waschliquid",
    "Kavitätenspalt-Dichtungsmixtur",
    "MAGIS®-Apex-Kabel-Set",
    "Nachtouchierlösung 20 ml",
    "Nachtouchierlösung balance 20 ml",
    "Tiefenfluorid balance Großsparpackung 2 x 20 ml",
    "Tiefenfluorid balance Probierpackung 2 x 5 ml",
    "Tiefenfluorid Großsparpackung 2 x 20 ml",
    "Tiefenfluorid junior Großsparpackung 2 x 20 ml",
    "Tiefenfluorid junior Probierpackung 2 x 5 ml",
    "Tiefenfluorid Probierpackung 2 x 5 ml",
  ])("has curated Russian copy for Humanchemie product %s", (name) => {
    const result = createProductPresentation(
      {
        name,
        description: name,
        brand: "Humanchemie",
        category: "Эндодонтические препараты",
      },
      [],
    );

    expect(result.title).toMatch(/[А-ЯЁа-яё]/u);
    expect(result.title).not.toContain("Эндодонтические препараты:");
    expect(result.summary).toMatch(/[А-ЯЁа-яё]/u);
  });
});
