export type CatalogQualityInput = {
  id: string;
  canonicalName: string;
  description: string | null;
  manufacturerSku: string | null;
  gtin: string | null;
  brandId: string | null;
  manufacturerId: string | null;
  regulatoryClass: string | null;
  externalMetadata: unknown;
  categories: number;
  attributes: number;
  variants: number;
  readyMedia: number;
  verifiedSources: number;
};

export type CatalogQualityResult = {
  score: number;
  status: "READY" | "IMPROVE" | "MODERATION";
  missing: string[];
};

const technicalName = /^(?:ref|sku|арт(?:икул)?\.?)?\s*[a-z0-9._/-]+$/iu;

export function scoreCatalogCard(
  input: CatalogQualityInput,
): CatalogQualityResult {
  let score = 0;
  const missing: string[] = [];
  const award = (ready: boolean, points: number, issue: string) => {
    if (ready) score += points;
    else missing.push(issue);
  };

  award(
    input.canonicalName.trim().length >= 6 &&
      !technicalName.test(input.canonicalName.trim()),
    15,
    "Понятное название",
  );
  award(Boolean(input.brandId || input.manufacturerId), 10, "Бренд");
  award(input.categories > 0, 15, "Категория");
  award(input.attributes >= 3, 10, "Характеристики");
  award(input.variants > 0, 15, "Покупаемый вариант");
  award(input.readyMedia > 0, 15, "Проверенное фото");
  award(
    Boolean(input.description && input.description.trim().length >= 40),
    10,
    "Описание",
  );
  award(
    Boolean(
      input.manufacturerSku ||
        input.gtin ||
        input.verifiedSources > 0,
    ),
    5,
    "Артикул или подтверждённый источник",
  );
  award(
    input.verifiedSources > 0 || !input.regulatoryClass,
    5,
    "Документы или подтверждение источника",
  );

  return {
    score,
    status: score >= 85 ? "READY" : score >= 60 ? "IMPROVE" : "MODERATION",
    missing,
  };
}
