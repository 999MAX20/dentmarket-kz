import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const projectRef = "tlxxicjzppflpkcgnauo";
const now = new Date().toISOString();
const baseUrl = `https://${projectRef}.supabase.co/rest/v1`;
const apiKeys = JSON.parse(execFileSync("pnpm", ["dlx", "supabase", "projects", "api-keys", "--project-ref", projectRef], { encoding: "utf8" }));
const serviceKey = apiKeys.keys.find((key) => key.id === "service_role")?.api_key;
if (!serviceKey) throw new Error("Supabase service role key is unavailable");

const root = path.resolve(process.cwd());
const files = (process.argv.slice(2).length ? process.argv.slice(2) : (await fs.readdir(path.join(root, "data/imports"))).filter((file) => file.endsWith(".csv")).map((file) => path.join("data/imports", file)));
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

async function request(table, options = {}) {
  const url = new URL(`${baseUrl}/${table}`);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, { method: options.method ?? "GET", headers: { ...headers, ...(options.prefer ? { Prefer: options.prefer } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${table} ${response.status}: ${text.slice(0, 1000)}`);
  return text ? JSON.parse(text) : [];
}

const value = (row, ...keys) => keys.map((key) => row[key]).find((item) => item !== undefined && item !== null && String(item).trim() !== "") ?? "";
const normalize = (item) => String(item || "").replace(/\s+/g, " ").trim();
const code = (item) => normalize(item).toLocaleLowerCase("ru").replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "stomatology";
const canonicalKey = (row) => [row.gtin, row.name, row.brand, row.manufacturer, row.category].map((item) => normalize(item).toLocaleLowerCase("ru")).filter(Boolean).join("|");
const slug = (key) => `canonical-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
const descriptionFor = (row) => [row.name, row.category ? `Категория: ${row.category}.` : null, row.brand ? `Бренд: ${row.brand}.` : null, row.manufacturer ? `Производитель: ${row.manufacturer}.` : null, row.gtin ? `GTIN: ${row.gtin}.` : null].filter(Boolean).join(" ");
const batch = (items, size = 100) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const rows = [];
for (const file of files) {
  const parsed = parse(await fs.readFile(path.resolve(root, file)), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true });
  for (const raw of parsed) {
    const name = normalize(value(raw, "name", "productName", "title"));
    const externalId = normalize(value(raw, "externalId", "id", "sku", "supplierSku"));
    if (!name || !externalId) continue;
    const source = normalize(value(raw, "source")) || path.basename(file, path.extname(file)).replace(/-catalog$/, "");
    rows.push({ source, externalId, sourceUrl: normalize(value(raw, "sourceUrl", "url")) || null, name, brand: normalize(value(raw, "brand")) || null, manufacturer: normalize(value(raw, "manufacturer")) || null, supplierSku: normalize(value(raw, "supplierSku", "sku")) || null, gtin: normalize(value(raw, "gtin")) || null, category: normalize(value(raw, "category")) || "Стоматология", unit: normalize(value(raw, "unit")) || "piece", imageSources: [value(raw, "imageUrl", "image_url", "image", "photoUrl")].map(normalize).filter(Boolean) });
  }
}

const cards = new Map();
for (const row of rows) {
  const key = canonicalKey(row);
  const existing = cards.get(key);
  if (existing) {
    existing.sourceRecords.push({ source: row.source, externalId: row.externalId, sourceUrl: row.sourceUrl });
    existing.imageSources.push(...row.imageSources);
    if (!existing.supplierSku && row.supplierSku) existing.supplierSku = row.supplierSku;
  } else cards.set(key, { ...row, key, sourceRecords: [{ source: row.source, externalId: row.externalId, sourceUrl: row.sourceUrl }] });
}
const cardRows = [...cards.values()].map((row) => ({ ...row, slug: slug(row.key), imageSources: [...new Set(row.imageSources)], sourceRecords: row.sourceRecords.slice(0, 100) }));

const [industries, units, categories, brands, manufacturers] = await Promise.all([
  request("Industry", { query: { code: "eq.dentistry-kz", select: "id,code" } }),
  request("UnitOfMeasure", { query: { select: "id,code,symbol" } }),
  request("Category", { query: { select: "id,industryId,code,nameRu" } }),
  request("Brand", { query: { select: "id,name" } }),
  request("Manufacturer", { query: { select: "id,name" } }),
]);
const industry = industries[0];
if (!industry) throw new Error("Industry dentistry-kz is missing in production database");
const unitMap = new Map(units.flatMap((unit) => [[unit.code, unit], [unit.symbol, unit]]));
const categoryMap = new Map(categories.filter((item) => item.industryId === industry.id).map((item) => [item.code, item]));
const brandMap = new Map(brands.map((item) => [item.name, item]));
const manufacturerMap = new Map(manufacturers.map((item) => [item.name, item]));

const missingCategories = [...new Map(cardRows.map((row) => [code(row.category), { id: crypto.randomUUID(), industryId: industry.id, code: code(row.category), nameRu: row.category, nameKk: row.category, path: code(row.category), depth: 0, status: "ACTIVE" }])).values()].filter((item) => !categoryMap.has(item.code));
for (const part of batch(missingCategories)) {
  const created = await request("Category?on_conflict=industryId%2Ccode", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: part });
  for (const item of created) categoryMap.set(item.code, item);
}

const missingBrands = [...new Set(cardRows.map((row) => row.brand).filter(Boolean))].filter((name) => !brandMap.has(name)).map((name) => ({ id: crypto.randomUUID(), name, status: "ACTIVE" }));
for (const part of batch(missingBrands)) for (const item of await request("Brand?on_conflict=name", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: part })) brandMap.set(item.name, item);
const missingManufacturers = [...new Set(cardRows.map((row) => row.manufacturer).filter(Boolean))].filter((name) => !manufacturerMap.has(name)).map((name) => ({ id: crypto.randomUUID(), name, status: "ACTIVE" }));
for (const part of batch(missingManufacturers)) for (const item of await request("Manufacturer?on_conflict=name", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: part })) manufacturerMap.set(item.name, item);

const products = [];
for (const part of batch(cardRows)) {
  const payload = part.map((row) => ({ id: crypto.randomUUID(), canonicalName: row.name, description: descriptionFor(row), descriptionSources: { sourceRecords: row.sourceRecords, generatedFrom: ["name", "category", "brand", "manufacturer", "gtin"].filter((field) => row[field]) }, slug: row.slug, brandId: row.brand ? brandMap.get(row.brand)?.id ?? null : null, manufacturerId: row.manufacturer ? manufacturerMap.get(row.manufacturer)?.id ?? null : null, manufacturerSku: null, gtin: row.gtin || null, baseUnitId: unitMap.get(row.unit)?.id ?? unitMap.get("piece")?.id ?? null, productType: /установ|рентген|сканер|компрессор|автоклав|печь|фрезер|оборудован/i.test(row.name) ? "equipment" : "consumable", status: "DRAFT", externalMetadata: { canonicalKey: row.key, source: row.source, externalId: row.externalId, sourceUrl: row.sourceUrl, sourceRecords: row.sourceRecords, imageSources: row.imageSources, importedAsCanonicalDraft: true }, updatedAt: now }));
  products.push(...await request("Product?on_conflict=slug", { method: "POST", prefer: "resolution=merge-duplicates,return=representation", body: payload }));
}
const productMap = new Map(products.map((product) => [product.slug, product]));
const existingVariants = await request("ProductVariant", { query: { select: "id,productId" } });
const productIndustry = [], productCategory = [], variantPayload = [], searchPayload = [];
for (const row of cardRows) {
  const product = productMap.get(row.slug);
  if (!product) continue;
  const category = categoryMap.get(code(row.category));
  const unit = unitMap.get(row.unit) ?? unitMap.get("piece");
  productIndustry.push({ productId: product.id, industryId: industry.id });
  if (category) productCategory.push({ productId: product.id, categoryId: category.id });
  if (!existingVariants.some((variant) => variant.productId === product.id)) variantPayload.push({ id: crypto.randomUUID(), productId: product.id, sku: row.supplierSku, gtin: row.gtin || null, saleUnitId: unit?.id ?? null, status: "DRAFT", externalMetadata: { source: row.source, externalId: row.externalId, sourceRecords: row.sourceRecords }, updatedAt: now });
  searchPayload.push({ productId: product.id, searchableText: [row.name, row.brand, row.manufacturer, row.supplierSku, row.gtin].filter(Boolean).join(" "), normalizedText: [row.name, row.brand, row.manufacturer].filter(Boolean).join(" ").toLocaleLowerCase("ru"), facets: { source: row.source, category: row.category }, categoryIds: category ? [category.id] : [], industryIds: [industry.id], isAvailable: false, updatedAt: now });
}
for (const part of batch(productIndustry, 500)) await request("ProductIndustry", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: part });
for (const part of batch(productCategory, 500)) await request("ProductCategory", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", body: part });
for (const part of batch(variantPayload, 500)) await request("ProductVariant", { method: "POST", prefer: "return=minimal", body: part });
for (const part of batch(searchPayload, 500)) await request("ProductSearchDocument?on_conflict=productId", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: part });

console.log(JSON.stringify({ ok: true, sourceRows: rows.length, canonicalCards: cardRows.length, categories: categoryMap.size, variantsCreated: variantPayload.length, pricesImported: 0, quantitiesImported: 0, imagesImported: 0 }, null, 2));
