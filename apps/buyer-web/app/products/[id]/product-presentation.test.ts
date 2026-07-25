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
});
