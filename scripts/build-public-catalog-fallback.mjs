import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";
import {
  buildDescriptionSources,
  generateCanonicalDescription,
  inferCatalogCategory,
  normalizeCatalogBrand,
  normalizeCatalogCategory,
  normalizeCatalogManufacturer,
  normalizeCatalogUnit,
  normalizeCanonicalName,
  normalizeSupplierName,
} from "./lib/product-copy.mjs";

const root = path.resolve(process.cwd());
const inputDir = path.join(root, "data/imports");
const output = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const files = (await fs.readdir(inputDir))
  .filter((file) => file.endsWith(".csv"))
  .sort();

const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const first = (row, ...keys) =>
  keys.map((key) => clean(row[key])).find(Boolean) ?? "";
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
const number = (value) => {
  const normalized = clean(value)
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};
const categoryName = (value) => normalizeCatalogCategory(value);
const validHttpUrl = (value) =>
  /^https?:\/\/[^\s]+$/i.test(value) ? value : null;
const dateValue = (value) =>
  /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(clean(value)) ? clean(value) : null;
const unitValue = (value) =>
  /^(?:шт\.?|уп\.?|набор|комплект|piece|pack)$/iu.test(clean(value))
    ? clean(value)
    : null;
const categoryValue = (value) => {
  const candidate = clean(value);
  if (
    !candidate ||
    validHttpUrl(candidate) ||
    dateValue(candidate) ||
    /^(?:KZT|RUB|USD|EUR)$/i.test(candidate)
  )
    return null;
  if (/^[\d.,+-]+$/.test(candidate)) return null;
  if (/^(?:в наличии|нет в наличии|есть|available)$/iu.test(candidate))
    return null;
  return candidate;
};

// Several early hand-built CSV files have one or two omitted empty cells.
// Recover their semantic values by type instead of silently dropping the rows.
const repairShiftedRow = (row) => {
  const sourceUrl =
    [row.sourceUrl, row.category, row.quantityOnHand, row.currency]
      .map(validHttpUrl)
      .find(Boolean) ?? null;
  const sourceUpdatedAt =
    [row.sourceUpdatedAt, row.sourceUrl, row.category, row.quantityOnHand]
      .map(dateValue)
      .find(Boolean) ?? null;
  const category =
    [row.category, row.quantityOnHand, row.currency]
      .map(categoryValue)
      .find(Boolean) ?? "";
  const recoveredUnit =
    unitValue(row.unit) ?? unitValue(row.manufacturer) ?? "";
  const manufacturer = unitValue(row.manufacturer)
    ? ""
    : clean(row.manufacturer);
  const quantityOnHand =
    validHttpUrl(row.quantityOnHand) || categoryValue(row.quantityOnHand)
      ? ""
      : clean(row.quantityOnHand);
  return {
    ...row,
    manufacturer,
    unit: recoveredUnit,
    category,
    sourceUrl,
    sourceUpdatedAt,
    quantityOnHand,
  };
};

const rows = [];
for (const file of files) {
  const parsed = parse(await fs.readFile(path.join(inputDir, file)), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  });
  for (const rawRow of parsed) {
    const row = repairShiftedRow(rawRow);
    const rawName = first(row, "name", "productName", "title");
    if (!rawName) continue;
    const source =
      first(row, "source") ||
      file.replace(/-catalog\.csv$/, "").replace(/\.csv$/, "");
    const supplier = normalizeSupplierName(
      first(row, "supplierName") || source,
    );
    const rawBrand = first(row, "brand");
    const rawManufacturer = first(row, "manufacturer");
    const sourceUrl = validHttpUrl(first(row, "sourceUrl", "url"));
    const brand = normalizeCatalogBrand({
      brand: rawBrand,
      manufacturer: rawManufacturer,
      name: rawName,
      category: row.category,
    });
    const manufacturer = normalizeCatalogManufacturer(rawManufacturer, brand);
    const name = normalizeCanonicalName(rawName, {
      brand,
      manufacturer,
      sourceUrl,
    });
    if (/^\d+$/.test(name)) continue;
    const category = inferCatalogCategory(
      name,
      categoryName(first(row, "category")),
    );
    const supplierSku = first(row, "supplierSku", "sku");
    const externalId =
      first(row, "externalId", "id") ||
      supplierSku ||
      hash(`${source}|${name}`);
    const key = [brand || "Без бренда", name]
      .map((value) => value.toLocaleLowerCase("ru"))
      .join("|");
    const priceMinor =
      number(first(row, "priceMinor")) ?? number(first(row, "price"));
    const quantityText = first(row, "quantityOnHand", "quantity");
    const quantity = number(quantityText);
    const available =
      quantity !== null
        ? quantity > 0
        : /в наличии|есть|available|готов/i.test(quantityText);
    // A row without a product page, article or commercial data is normally a
    // category heading accidentally exported as a product.
    if (!sourceUrl && !supplierSku && !priceMinor && quantity === null)
      continue;
    rows.push({
      key,
      name,
      brand: brand || null,
      manufacturer: manufacturer || null,
      category,
      supplier,
      supplierSku: supplierSku || null,
      externalId,
      source,
      rawName,
      sourceUrl,
      sourceUpdatedAt: first(row, "sourceUpdatedAt") || null,
      unit: normalizeCatalogUnit(first(row, "unit")),
      priceMinor,
      currency: first(row, "currency") || "KZT",
      quantity,
      available,
    });
  }
}

const repeatedSourceNames = new Map();
for (const row of rows) {
  const repetitionKey = `${row.source}|${row.name.toLocaleLowerCase("ru")}`;
  repeatedSourceNames.set(
    repetitionKey,
    (repeatedSourceNames.get(repetitionKey) ?? 0) + 1,
  );
}
const quarantined = [...repeatedSourceNames.entries()].filter(
  ([, count]) => count > 25,
);
const quarantinedKeys = new Set(quarantined.map(([key]) => key));
const acceptedRows = rows.filter(
  (row) =>
    !quarantinedKeys.has(`${row.source}|${row.name.toLocaleLowerCase("ru")}`),
);

const grouped = new Map();
for (const row of acceptedRows) {
  const existing = grouped.get(row.key);
  if (!existing) {
    grouped.set(row.key, {
      ...row,
      suppliers: [row.supplier],
      sourceRecords: [row],
    });
    continue;
  }
  existing.suppliers = [...new Set([...existing.suppliers, row.supplier])];
  existing.sourceRecords.push(row);
  if (!existing.brand && row.brand) existing.brand = row.brand;
  if (!existing.manufacturer && row.manufacturer)
    existing.manufacturer = row.manufacturer;
  if (
    normalizeCatalogCategory(existing.category) ===
      "Стоматологические материалы и оборудование" &&
    row.category
  )
    existing.category = row.category;
  if (!existing.priceMinor && row.priceMinor)
    existing.priceMinor = row.priceMinor;
  if (!existing.sourceUrl && row.sourceUrl) existing.sourceUrl = row.sourceUrl;
  existing.available ||= row.available;
  if (!existing.quantity && row.quantity) existing.quantity = row.quantity;
}

const products = [...grouped.values()].map((row) => {
  const id = `public-${hash(row.key)}`;
  const description = generateCanonicalDescription({
    name: row.name,
    category: row.category,
    brand: row.brand,
    manufacturer: row.manufacturer,
    unit: row.unit,
    supplierCount: row.suppliers.length,
  });
  const attributes = [
    ["Категория", row.category],
    ["Бренд", row.brand],
    ["Производитель", row.manufacturer],
    ["Артикул поставщика", row.supplierSku],
    ["Единица", row.unit],
    ["Источники", String(row.sourceRecords.length)],
  ].filter(([, value]) => value);
  const offerRecords = [
    ...row.sourceRecords
      .reduce((bySupplier, source) => {
        const current = bySupplier.get(source.supplier);
        const score = (item) =>
          (item.priceMinor ? 4 : 0) +
          (item.available ? 2 : 0) +
          (item.supplierSku ? 1 : 0);
        if (!current || score(source) > score(current))
          bySupplier.set(source.supplier, source);
        return bySupplier;
      }, new Map())
      .values(),
  ];
  const offers = offerRecords.map((source, index) => ({
    id: `${id}-offer-${index}`,
    supplier: {
      id: `supplier-${hash(source.supplier)}`,
      name: source.supplier,
    },
    priceMinor: source.priceMinor ? String(source.priceMinor) : null,
    currency: source.currency,
    normalizedPriceMinor: source.priceMinor ? String(source.priceMinor) : null,
    packaging: {
      name: source.unit || "шт",
      quantityInBaseUnit: "1",
      unit: source.unit || "шт",
    },
    available: source.available,
    confirmationMode: "MANUAL",
    deliveryMethods: ["NATIONWIDE"],
    supplierSku: source.supplierSku,
    verifiedDocuments: false,
    officialDistributor: false,
    supplierWarranty: false,
  }));
  const pricedOffers = offerRecords
    .map((source) => source.priceMinor)
    .filter(Boolean);
  const minPriceMinor = pricedOffers.length ? Math.min(...pricedOffers) : null;
  return {
    id,
    name: row.name,
    description,
    descriptionSources: buildDescriptionSources(row),
    brand: row.brand,
    manufacturer: row.manufacturer,
    category: row.category,
    sourceUrl: row.sourceUrl,
    sourceUpdatedAt: row.sourceUpdatedAt,
    attributes,
    photoStatus: "category_illustration",
    minNormalizedPriceMinor: minPriceMinor ? String(minPriceMinor) : null,
    isAvailable: offerRecords.some((source) => source.available),
    offers,
  };
});

products.sort((a, b) => a.name.localeCompare(b.name, "ru"));
const quarantine = quarantined.map(([key, rowCount]) => {
  const separator = key.indexOf("|");
  return {
    source: key.slice(0, separator),
    repeatedName: key.slice(separator + 1),
    rowCount,
    reason: "Одинаковое название повторяется в разных URL",
  };
});
await fs.writeFile(
  output,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceFiles: files, total: products.length, quarantine, products }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      output,
      sourceFiles: files.length,
      sourceRows: rows.length,
      acceptedRows: acceptedRows.length,
      quarantinedRows: rows.length - acceptedRows.length,
      canonicalCards: products.length,
    },
    null,
    2,
  ),
);
