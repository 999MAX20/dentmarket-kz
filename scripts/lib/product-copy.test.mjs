import assert from "node:assert/strict";
import test from "node:test";
import { buildDescriptionSources, generateCanonicalDescription, normalizeCatalogCategory, normalizeCatalogUnit } from "./product-copy.mjs";

test("normalizes feed units and unusable categories", () => {
  assert.equal(normalizeCatalogUnit("piece"), "шт.");
  assert.equal(normalizeCatalogUnit("PACK"), "уп.");
  assert.equal(normalizeCatalogCategory("https://supplier.kz/catalog"), "Стоматологические материалы и оборудование");
});

test("generates factual copy without inventing characteristics", () => {
  const text = generateCanonicalDescription({ name: "Filtek Z250", category: "Композиты", brand: "3M", manufacturer: "3M", unit: "piece", supplierCount: 3 });
  assert.equal(text, "Filtek Z250 относится к категории «Композиты». Бренд: 3M. Единица поставки: шт. В карточке собраны предложения 3 поставщиков; цена, наличие и условия зависят от выбранного продавца.");
  assert.doesNotMatch(text, /леч|назначен|эффектив|лучший/i);
});

test("records DentMarket ownership and structured sources", () => {
  const sources = buildDescriptionSources({ name: "Товар", category: "Материалы", unit: "шт", sourceRecords: [{ source: "Прайс поставщика", sourceUrl: "https://example.kz" }] });
  assert.equal(sources.ownership, "DENTMARKET");
  assert.equal(sources.generatedFromStructuredData, true);
  assert.equal(sources.sources[0].sourceType, "SUPPLIER_FEED");
});
