import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";
import {
  buildDescriptionSources,
  generateCanonicalDescription,
  normalizeCatalogCategory,
  normalizeCatalogUnit,
  normalizeCanonicalName,
} from "./lib/product-copy.mjs";

const root = path.resolve(process.cwd());
const inputDir = path.join(root, "data/imports");
const output = path.join(root, "apps/buyer-web/app/data/public-catalog-fallback.json");
const files = (await fs.readdir(inputDir)).filter((file) => file.endsWith(".csv")).sort();

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const first = (row, ...keys) => keys.map((key) => clean(row[key])).find(Boolean) ?? "";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
const number = (value) => {
  const normalized = clean(value).replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};
const categoryName = (value) => normalizeCatalogCategory(value);
const validHttpUrl = (value) => /^https?:\/\/[^\s]+$/i.test(value) ? value : null;

const rows = [];
for (const file of files) {
  const parsed = parse(await fs.readFile(path.join(inputDir, file)), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  });
  for (const row of parsed) {
    const rawName = first(row, "name", "productName", "title");
    if (!rawName) continue;
    const source = first(row, "source") || file.replace(/-catalog\.csv$/, "").replace(/\.csv$/, "");
    const supplier = first(row, "supplierName") || source;
    const brand = first(row, "brand");
    const manufacturer = first(row, "manufacturer");
    const sourceUrl = validHttpUrl(first(row, "sourceUrl", "url"));
    const name = normalizeCanonicalName(rawName, { brand, manufacturer, sourceUrl });
    if (/^\d+$/.test(name)) continue;
    const category = categoryName(first(row, "category"));
    const supplierSku = first(row, "supplierSku", "sku");
    const externalId = first(row, "externalId", "id") || supplierSku || hash(`${source}|${name}`);
    const key = [name, brand, manufacturer, category].map((value) => value.toLocaleLowerCase("ru")).join("|");
    const priceMinor = number(first(row, "priceMinor")) ?? number(first(row, "price"));
    const quantityText = first(row, "quantityOnHand", "quantity");
    const quantity = number(quantityText);
    const available = quantity !== null ? quantity > 0 : /в наличии|есть|available|готов/i.test(quantityText);
    // A row without a product page, article or commercial data is normally a
    // category heading accidentally exported as a product.
    if (!sourceUrl && !supplierSku && !priceMinor && quantity === null) continue;
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

const grouped = new Map();
for (const row of rows) {
  const existing = grouped.get(row.key);
  if (!existing) {
    grouped.set(row.key, { ...row, suppliers: [row.supplier], sourceRecords: [row] });
    continue;
  }
  existing.suppliers = [...new Set([...existing.suppliers, row.supplier])];
  existing.sourceRecords.push(row);
  if (!existing.priceMinor && row.priceMinor) existing.priceMinor = row.priceMinor;
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
  const offers = row.sourceRecords.map((source, index) => ({
    id: `${id}-offer-${index}`,
    supplier: { id: `supplier-${hash(source.supplier)}`, name: source.supplier },
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
    minNormalizedPriceMinor: row.priceMinor ? String(row.priceMinor) : null,
    isAvailable: row.available,
    offers,
  };
});

products.sort((a, b) => a.name.localeCompare(b.name, "ru"));
await fs.writeFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceFiles: files, total: products.length, products }, null, 2)}\n`);
console.log(JSON.stringify({ output, sourceFiles: files.length, sourceRows: rows.length, canonicalCards: products.length }, null, 2));
