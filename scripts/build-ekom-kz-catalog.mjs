import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const audit = JSON.parse(
  await fs.readFile(path.join(root, "data/reports/ekom-kz-source-audit.json"), "utf8"),
);
if (audit.brand !== "Ekom" || audit.market !== "KZ" || audit.products.length !== 30)
  throw new Error("Expected the complete audited EKOM Kazakhstan catalog");

const outputs = {
  cards: path.join(root, "data/imports/ekom-kz-catalog.csv"),
  variants: path.join(root, "data/catalog-variants/ekom-kz.csv"),
  market: path.join(root, "data/catalog-evidence/market/ekom-kz.csv"),
  sku: path.join(root, "data/catalog-evidence/skus/ekom-kz.csv"),
  media: path.join(root, "data/catalog-media/ekom-kz.csv"),
};
const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const csv = (value) => {
  const text = clean(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const csvRow = (values) => values.map(csv).join(",");

const optionalNames = new Map([
  ["3KOM control system", "Система управления компрессорами EKOM 3KOM"],
  ["Exhaust silencers", "Глушители выхлопа EKOM"],
  ["Pressure regulators", "Регуляторы давления EKOM"],
  ["Filtration units", "Фильтрующие модули EKOM"],
  ["Condensing and filtration unit", "Блок конденсации и фильтрации EKOM"],
  ["Automatic discharge of condensate", "Система автоматического слива конденсата EKOM"],
  ["Noise reduction cabinets", "Шумопоглощающие шкафы EKOM"],
  ["Adsorption dryer", "Адсорбционные осушители EKOM"],
  ["Membrane dryer", "Мембранные осушители EKOM"],
  ["Amalgam separator kit", "Комплект сепаратора амальгамы EKOM"],
  ["Vacuum valve", "Вакуумный клапан EKOM"],
  ["Silencer with HEPA filter", "Глушитель с HEPA-фильтром EKOM"],
]);

function canonicalName(product) {
  if (product.category === "Стоматологические компрессоры")
    return `Безмасляный стоматологический компрессор EKOM ${product.model}`;
  if (product.category === "Компрессоры с аспирацией")
    return `Компрессор с аспирацией EKOM ${product.model}`;
  if (product.category === "Системы аспирации")
    return `Система аспирации EKOM ${product.model}`;
  return optionalNames.get(product.model) ?? `Аксессуар EKOM ${product.model}`;
}

const compressorUses = new Map([
  ["DK50 SIMPLE", "Компактная мобильная модель для одной стоматологической установки."],
  ["DK50-10", "Модель с ресивером 10 л для одной стоматологической установки."],
  ["DK50 PLUS", "Модель с ресивером 25 л для одной стоматологической установки."],
  ["DK50 2V", "Модель с ресивером 25 л для двух стоматологических установок."],
  ["DK50 2V/50", "Модель с ресивером 50 л для двух стоматологических установок."],
  ["DK50 4VR/50", "Модель для одновременной работы трёх–четырёх стоматологических установок."],
  ["DK50 2X2V/110", "Модель с ресивером 110 л для трёх–четырёх стоматологических установок."],
  ["DK50 2X4VR/110", "Компрессорная станция для стоматологической клиники."],
  ["DK50 3X4VR/M", "Компрессорная станция с осушением воздуха для стоматологической клиники."],
  ["DK50 4X4VRT/M", "Высокопроизводительная компрессорная станция для стоматологической клиники."],
  ["DK50 6X4VRT/M", "Высокопроизводительная компрессорная станция для центра с несколькими кабинетами."],
  ["DK50 9X4VRT/M", "Центральная компрессорная станция для крупной стоматологической клиники."],
]);
const optionalDescriptions = new Map([
  ["3KOM control system", "Система удалённого контроля и управления компрессорными станциями EKOM."],
  ["Exhaust silencers", "Глушители для снижения шума при сбросе воздуха из компрессора."],
  ["Pressure regulators", "Регуляторы для настройки рабочего давления в системе сжатого воздуха."],
  ["Filtration units", "Фильтрующие модули для подготовки сжатого воздуха стоматологической установки."],
  ["Condensing and filtration unit", "Блок удаления конденсата и фильтрации сжатого воздуха."],
  ["Automatic discharge of condensate", "Система автоматического удаления конденсата из ресивера."],
  ["Noise reduction cabinets", "Шкафы для снижения шума работающего компрессора."],
  ["Adsorption dryer", "Осушитель для получения сухого сжатого воздуха."],
  ["Membrane dryer", "Мембранный осушитель сжатого воздуха для стоматологических систем."],
  ["Amalgam separator kit", "Комплект для отделения амальгамы в системе стоматологической аспирации."],
  ["Vacuum valve", "Клапан управления вакуумом в системе стоматологической аспирации."],
  ["Silencer with HEPA filter", "Глушитель с HEPA-фильтром для снижения шума и очистки выходящего воздуха."],
]);

function descriptionFor(product) {
  if (compressorUses.has(product.model))
    return `${compressorUses.get(product.model)} Исполнение со шкафом и осушителем выбирается в карточке.`;
  if (product.category === "Компрессоры с аспирацией")
    return `Единый блок ${product.model}: безмасляный компрессор и стоматологическая аспирация. Исполнение выбирается в карточке.`;
  if (product.category === "Системы аспирации")
    return `Система аспирации ${product.model} для подключения к стоматологической установке. Исполнение выбирается в карточке.`;
  return optionalDescriptions.get(product.model) ?? `Оригинальный аксессуар EKOM ${product.model}.`;
}

function variantLabel(reference) {
  const details = [];
  if (/STANDARD$/iu.test(reference)) details.push("стандартное исполнение");
  if (/ADVANCED$/iu.test(reference)) details.push("расширенное исполнение");
  if (/(?<!PLU)S(?:\/M)?(?:\(|$)/u.test(reference) || /PLUSS/u.test(reference))
    details.push("со шкафом");
  else if (/Z(?:\/M)?(?:\(|$)/u.test(reference)) details.push("без шкафа");
  if (/\((?:MD|ADM)\)$/u.test(reference)) details.push("мембранный осушитель");
  if (/\((?:ADS|AD)\)$/u.test(reference)) details.push("адсорбционный осушитель");
  if (/\(RD\)$/u.test(reference)) details.push("рефрижераторный осушитель");
  return details.length
    ? `${reference} · ${details.join(" · ")}`
    : `${reference} · базовое исполнение`;
}

const cardRows = [];
const variantRows = [];
const marketRows = [];
const skuRows = [];
const mediaRows = [];
for (const product of audit.products) {
  const name = canonicalName(product);
  const externalId = `ekom-${new URL(product.sourcePageUrl).pathname.split("/").filter(Boolean).at(-1)}`;
  cardRows.push([
    "ekom-official-kz",
    "EKOM",
    product.sourcePageUrl,
    externalId,
    name,
    "EKOM",
    audit.manufacturer,
    product.category,
    "шт",
    "",
    "",
    "",
    "true",
    descriptionFor(product),
  ]);
  marketRows.push([
    "EKOM",
    name,
    "KZ_REPRESENTATIVE_NETWORK",
    audit.representativeUrl,
    audit.lastChecked,
    "Производитель публикует действующую стоматологическую линейку; в Казахстане указаны четыре представителя",
  ]);
  mediaRows.push([
    product.sourcePageUrl,
    product.sourceImageUrl,
    name,
    "manufacturer_catalog",
  ]);
  for (const reference of product.variants) {
    const label = variantLabel(reference);
    variantRows.push([
      "EKOM",
      audit.manufacturer,
      name,
      `${name} · ${label}`,
      reference,
      label,
      "MANUFACTURER_MODEL",
    ]);
  }
}

const exactProduct = audit.products.find((product) => product.model === "DK50-10");
const exactName = canonicalName(exactProduct);
skuRows.push([
  "EKOM",
  exactName,
  "DK50-10S",
  "KZ_SKU_CONFIRMED",
  audit.localExactProductUrl,
  audit.lastChecked,
  "Модель с шумопоглощающим шкафом и ресивером 10 л опубликована в каталоге Казахстана",
]);

const uniqueReferences = new Set(variantRows.map((record) => record[4]));
if (uniqueReferences.size !== variantRows.length)
  throw new Error("EKOM manufacturer model reference is assigned to multiple cards");

const definitions = [
  [outputs.cards, ["source", "supplierName", "sourceUrl", "externalId", "name", "brand", "manufacturer", "category", "unit", "currency", "price", "quantity", "catalogOnly", "description"], cardRows],
  [outputs.variants, ["brand", "manufacturer", "canonicalProductName", "sourceName", "manufacturerRef", "variantLabel", "referenceType"], variantRows],
  [outputs.market, ["brand", "canonicalProductName", "kzStatus", "evidenceUrl", "lastChecked", "notes"], marketRows],
  [outputs.sku, ["brand", "canonicalProductName", "manufacturerRef", "kzStatus", "evidenceUrl", "lastChecked", "notes"], skuRows],
  [outputs.media, ["sourcePageUrl", "sourceImageUrl", "productName", "rightsStatus"], mediaRows],
];
for (const [outputPath, headers, rows] of definitions) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${headers.join(",")}\n${rows.map(csvRow).join("\n")}\n`);
}

console.log(
  JSON.stringify(
    {
      cards: cardRows.length,
      modelVariants: variantRows.length,
      exactKzVariants: skuRows.length,
      exactManufacturerImages: mediaRows.length,
    },
    null,
    2,
  ),
);
