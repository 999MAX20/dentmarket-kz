import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const auditPath = path.join(root, "data/reports/interdent-kz-source-audit.json");
const importPath = path.join(root, "data/imports/interdent-kz-catalog.csv");
const variantsPath = path.join(root, "data/catalog-variants/interdent-kz.csv");
const marketEvidencePath = path.join(
  root,
  "data/catalog-evidence/market/interdent-kz.csv",
);
const skuEvidencePath = path.join(
  root,
  "data/catalog-evidence/skus/interdent-kz.csv",
);
const mediaPath = path.join(root, "data/catalog-media/interdent-kz.csv");
const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));

if (audit.brand !== "Interdent" || audit.market !== "KZ") {
  throw new Error("Expected the audited Interdent Kazakhstan source snapshot");
}
if (audit.products.length !== audit.totals.products) {
  throw new Error("Interdent audit product total is inconsistent");
}

const csv = (value) => {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const itemId = (url) => url.match(/item-(\d+)/u)?.[1];
const normalizedRef = (value) => String(value ?? "").replace(/\s+/gu, "").trim();
const isReference = (value) => /^(?=.*\d)[A-Z0-9][A-Z0-9-]{1,14}$/iu.test(normalizedRef(value));
const headers = (columns) => columns.join(",");
const row = (columns) => columns.map(csv).join(",");

const canonicalNameOverrides = new Map([
  ["Артикуляционная бумага красная", "Артикуляционная бумага Interdent 80 мкм"],
  ["Окклюзионный спрей", "Окклюзионный спрей Interdent"],
  ["Перлы стеклянные", "Стеклянные перлы Interdent"],
  ["Пемза", "Пемза Interdent"],
  ["Алебастр", "Алебастр Interdent"],
  [
    "Спрей Interwaxit для обезжиривания и снятия напряж.восковой конструкции",
    "Спрей Interwaxit для обезжиривания восковых конструкций",
  ],
]);
const fallbackDescriptions = new Map([
  ["Воск подкладочный", "Подкладочный воск для адаптации элементов зуботехнической модели."],
  ["Воск клейкий, в палочках", "Клейкий воск в палочках для фиксации элементов зуботехнической модели."],
  ["Диски сепарационные, шлифовальные", "Диски для разрезания и шлифования зуботехнических материалов. Размер и количество выбираются в варианте товара."],
  ["Фильцы для полирования", "Фильцы разных форм для полирования зуботехнических конструкций. Форма и размер выбираются в варианте товара."],
  ["Полировочные щётки", "Щётки для обработки и полирования зуботехнических материалов. Материал и размер выбираются в варианте товара."],
  ["Наждачная лента", "Абразивная лента для зуботехнических работ. Зернистость выбирается в варианте товара."],
  ["Спрей Interwaxit для обезжиривания и снятия напряж.восковой конструкции", "Средство для обезжиривания восковой конструкции перед паковкой. Объём выбирается в варианте товара."],
]);

function categoryFor(product) {
  const url = product.sourcePageUrl;
  if (url.includes("dental-gypsum")) return "Зуботехнические гипсы";
  if (url.includes("/wax/")) return "Зуботехнические воски";
  if (url.includes("/alloys/")) return "Зуботехнические сплавы";
  if (url.includes("/plastic/")) return "Зуботехнические пластмассы";
  if (url.includes("/silikon/")) return "Лабораторные силиконы";
  if (url.includes("/dublirovanie/")) return "Дублирование и литьё";
  if (url.includes("/sandblasting/")) return "Пескоструйные материалы";
  if (url.includes("/polish/")) return "Полировочные материалы";
  if (url.includes("/rotary-tools/")) return "Шлифовальные инструменты";
  if (url.includes("accessories-for-working-with-ceramics"))
    return "Принадлежности для керамики";
  if (url.includes("materials-for-clinical-dentistry"))
    return "Материалы для клинической стоматологии";
  return "Зуботехнические материалы";
}

function referenceRowsFor(product) {
  const result = [];
  for (const table of product.tables) {
    const tableRows = table.map((cells) => cells.filter((cell) => cell !== "Фото"));
    const firstCell = tableRows[0]?.[0] ?? "";
    const hasHeader = firstCell === "#" || /артикул/iu.test(firstCell);
    const candidates = hasHeader ? tableRows.slice(1) : tableRows;
    if (candidates.length === 0 || !candidates.every((cells) => isReference(cells[0])))
      continue;
    for (const cells of candidates) {
      const manufacturerRef = normalizedRef(cells[0]);
      const label = cells
        .slice(1)
        .map((cell) =>
          cell
            .replace(/\bmm\b/giu, "мм")
            .replace(/\bml\b/giu, "мл")
            .replace(/\bkg\b/giu, "кг")
            .replace(/\bg\b/giu, "г")
            .replace(/\bm\b/giu, "м")
            .replace(/µм/giu, "мкм")
            .replace(/натурльная/giu, "натуральная")
            .replace(/Твердая/gu, "Твёрдая")
            .replace(/Зеленый/gu, "Зелёный")
        )
        .filter(Boolean)
        .join(" · ");
      if (!label) continue;
      result.push({ manufacturerRef, label });
    }
  }
  return [...new Map(result.map((variant) => [variant.manufacturerRef, variant])).values()];
}

const importRows = [];
const variantRows = [];
const marketRows = [];
const skuRows = [];
const mediaRows = [];
for (const product of audit.products) {
  const id = itemId(product.sourcePageUrl);
  if (!id) throw new Error(`Missing Nord Stom item id: ${product.sourcePageUrl}`);
  if (!product.sourceImageUrl)
    throw new Error(`Missing exact product image: ${product.sourcePageUrl}`);
  const canonicalProductName =
    canonicalNameOverrides.get(product.pageName) ?? product.pageName;
  const description =
    product.summary ??
    fallbackDescriptions.get(product.pageName) ??
    `${canonicalProductName}. Фасовку и исполнение указывает продавец.`;
  importRows.push([
    "interdent-kz",
    "Interdent",
    product.sourcePageUrl,
    `interdent-kz-${id}`,
    canonicalProductName,
    "Interdent",
    "Interdent d.o.o.",
    categoryFor(product),
    "шт",
    "",
    "",
    "",
    "true",
    description,
  ]);
  marketRows.push([
    "Interdent",
    canonicalProductName,
    "KZ_DISTRIBUTOR_CATALOG",
    product.sourcePageUrl,
    audit.lastChecked,
    "Карточка и изображение опубликованы в каталоге официального поставщика Interdent в Казахстане",
  ]);
  mediaRows.push([
    product.sourcePageUrl,
    product.sourceImageUrl,
    canonicalProductName,
    "kz_distributor_catalog",
  ]);
  for (const variant of referenceRowsFor(product)) {
    const variantLabel =
      product.pageName === "Восковая проволока на катушке" &&
      /^29[2-7]$/u.test(variant.manufacturerRef)
        ? variant.label.replace(/(?:Средняя|Твёрдая) \(синяя\)/u, "Твёрдая (зелёная)")
        : variant.label;
    const sourceName = `${canonicalProductName} · ${variantLabel}`;
    variantRows.push([
      "Interdent",
      "Interdent d.o.o.",
      canonicalProductName,
      sourceName,
      variant.manufacturerRef,
      variantLabel,
      "MANUFACTURER_REF",
    ]);
    skuRows.push([
      "Interdent",
      canonicalProductName,
      variant.manufacturerRef,
      "KZ_SKU_CONFIRMED",
      product.sourcePageUrl,
      audit.lastChecked,
      "REF и вариант указаны непосредственно в карточке каталога Казахстана",
    ]);
  }
}

const uniqueNames = new Set(importRows.map((record) => record[4]));
const uniqueRefs = new Set(variantRows.map((record) => record[4]));
if (uniqueNames.size !== audit.products.length)
  throw new Error("Canonical Interdent card names are not unique");
if (uniqueRefs.size !== variantRows.length)
  throw new Error("Interdent manufacturer references are not unique");

const outputs = [
  [
    importPath,
    [
      "source",
      "supplierName",
      "sourceUrl",
      "externalId",
      "name",
      "brand",
      "manufacturer",
      "category",
      "unit",
      "currency",
      "price",
      "quantity",
      "catalogOnly",
      "description",
    ],
    importRows,
  ],
  [
    variantsPath,
    [
      "brand",
      "manufacturer",
      "canonicalProductName",
      "sourceName",
      "manufacturerRef",
      "variantLabel",
      "referenceType",
    ],
    variantRows,
  ],
  [
    marketEvidencePath,
    ["brand", "canonicalProductName", "kzStatus", "evidenceUrl", "lastChecked", "notes"],
    marketRows,
  ],
  [
    skuEvidencePath,
    [
      "brand",
      "canonicalProductName",
      "manufacturerRef",
      "kzStatus",
      "evidenceUrl",
      "lastChecked",
      "notes",
    ],
    skuRows,
  ],
  [mediaPath, ["sourcePageUrl", "sourceImageUrl", "productName", "rightsStatus"], mediaRows],
];
for (const [outputPath, columns, records] of outputs) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${headers(columns)}\n${records.map((record) => row(record)).join("\n")}\n`,
  );
}

console.log(
  JSON.stringify(
    {
      cards: importRows.length,
      exactKzReferences: variantRows.length,
      exactProductImages: mediaRows.length,
      cardsAwaitingOfficialReference: importRows.length - new Set(variantRows.map((record) => record[2])).size,
    },
    null,
    2,
  ),
);
