import assert from "node:assert/strict";
import test from "node:test";
import { buildDescriptionSources, generateCanonicalDescription, normalizeCanonicalName, normalizeCatalogCategory, normalizeCatalogUnit } from "./product-copy.mjs";

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

test("repairs supplier spelling and grammar in canonical names", () => {
  assert.equal(
    normalizeCanonicalName("235-b Набор Микромотор, прямой, угловой наконенчик c внутреней подачи воды"),
    "Набор с микромотором, прямым и угловым наконечниками, внутренняя подача воды, модель 235-B",
  );
  assert.equal(
    normalizeCanonicalName("235-e Набор Микромотор, прямой, угловой наконенчик со светом и внутреней подачи воды"),
    "Набор с микромотором, прямым и угловым наконечниками со светом, внутренняя подача воды, модель 235-E",
  );
});

test("turns transliterated bur names into readable Russian", () => {
  assert.equal(normalizeCanonicalName("368 018m fg borye almaznye"), "Бор алмазный 368 018M FG");
  assert.equal(normalizeCanonicalName("bory almaznye 379 012m fg"), "Бор алмазный 379 012M FG");
  assert.equal(normalizeCanonicalName("369 025 ffg buton"), "Бор алмазный 369 025 FFG");
  assert.equal(normalizeCanonicalName("bory almaznye diski almaznye 806 104 335 524 220"), "Диск алмазный 806 104 335 524 220");
  assert.equal(normalizeCanonicalName("bory almaznye sharovidnye k369 025f fg"), "Бор алмазный шаровидный K369 025F FG");
  assert.equal(normalizeCanonicalName("bory almaznye tverdosplavnye h135s 014 fg"), "Бор твердосплавный H135S 014 FG");
});

test("transliterates Russian words but preserves product and technical names", () => {
  assert.equal(normalizeCanonicalName("apparat dlya smazyvaniya nakonechnikov assistina plus 301"), "Аппарат для смазывания наконечников Assistina Plus 301");
  assert.equal(normalizeCanonicalName("ventura flow a1 3 4 gr 12 tips 1594"), "Ventura Flow A1 3,4 г 12 tips 1594");
});

test("uses a trustworthy source category for otherwise meaningless codes", () => {
  assert.equal(
    normalizeCanonicalName("805 010 m", { sourceUrl: "https://amdgroup.kz/catalog/obratnokonusnye/805_010_m/" }),
    "Бор алмазный 805 010 M",
  );
  assert.equal(
    normalizeCanonicalName("392 016 m 3", { sourceUrl: "https://amdgroup.kz/catalog/mezhzubnye/392_016_m_3_/" }),
    "Бор алмазный 392 016 M 3",
  );
});
