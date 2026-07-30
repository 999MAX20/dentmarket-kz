import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(`${root}/apps/buyer-web/app/data/public-catalog-fallback.json`, "utf8"));
const apply = process.argv.includes("--apply");
const size = 250;
const now = new Date().toISOString();
if (!process.env.DATABASE_URL) {
  const password = execFileSync("security", ["find-generic-password", "-s", "dentmarket-kz-supabase-db", "-w"], { encoding: "utf8" }).trim();
  process.env.DATABASE_URL = `postgresql://postgres.tlxxicjzppflpkcgnauo:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`;
}

const prisma = new PrismaClient();
const norm = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (name, brand) => `${norm(name).toLocaleLowerCase("ru")}|${norm(brand).toLocaleLowerCase("ru")}`;
const slug = (item) => `canonical-${crypto.createHash("sha256").update(`dentmarket:${item.id}`).digest("hex").slice(0, 32)}`;
const code = (value) => norm(value).toLocaleLowerCase("ru").replace(/[^a-zа-яё0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "stomatology";
const chunks = (items) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const q = (value) => value === null || value === undefined ? "NULL" : typeof value === "boolean" ? (value ? "TRUE" : "FALSE") : `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value ?? {}))}::jsonb`;
const uuids = (items) => `ARRAY[${items.filter(Boolean).map(q).join(",")}]::uuid[]`;
const vals = (rows) => rows.map((row) => `(${row.join(",")})`).join(",");

const source = catalog.products.map((item) => ({ ...item, name: norm(item.name), brand: norm(item.brand), manufacturer: norm(item.manufacturer), category: norm(item.category) || "Стоматология" }));

try {
  const [industryRows, units, existingRows, brandRows, manufacturerRows, categoryRows] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT id FROM "Industry" WHERE code='dentistry-kz' LIMIT 1`),
    prisma.$queryRawUnsafe(`SELECT id,code,symbol FROM "UnitOfMeasure"`),
    prisma.$queryRawUnsafe(`SELECT p.id,p.slug,p."canonicalName",p."brandId",b.name AS "brandName",p.gtin,p."externalMetadata" FROM "Product" p LEFT JOIN "Brand" b ON b.id=p."brandId"`),
    prisma.$queryRawUnsafe(`SELECT id,name FROM "Brand"`),
    prisma.$queryRawUnsafe(`SELECT id,name FROM "Manufacturer"`),
    prisma.$queryRawUnsafe(`SELECT id,"industryId",code FROM "Category"`),
  ]);
  const industry = industryRows[0];
  if (!industry) throw new Error("Industry dentistry-kz is missing");
  const unit = units.find((row) => row.code === "piece") ?? units.find((row) => row.symbol === "шт");
  const brands = new Map(brandRows.map((row) => [row.name, row]));
  const manufacturers = new Map(manufacturerRows.map((row) => [row.name, row]));
  const categories = new Map(categoryRows.filter((row) => row.industryId === industry.id).map((row) => [row.code, row]));
  const existingByKey = new Map();
  for (const row of existingRows) if (!existingByKey.has(key(row.canonicalName, row.brandName))) existingByKey.set(key(row.canonicalName, row.brandName), row);

  const missingBrands = [...new Set(source.map((item) => item.brand).filter(Boolean))].filter((name) => !brands.has(name)).map((name) => [q(crypto.randomUUID()), q(name), q("ACTIVE")]);
  const missingManufacturers = [...new Set(source.map((item) => item.manufacturer).filter(Boolean))].filter((name) => !manufacturers.has(name)).map((name) => [q(crypto.randomUUID()), q(name), q("ACTIVE")]);
  const missingCategories = [...new Set(source.map((item) => item.category))].map((name) => ({ name, code: code(name) })).filter((item) => !categories.has(item.code)).map((item) => [q(crypto.randomUUID()), q(industry.id), q(item.code), q(item.name), q(item.name), q(item.code), q("ACTIVE")]);
  if (apply) {
    for (const part of chunks(missingBrands)) await prisma.$executeRawUnsafe(`INSERT INTO "Brand"(id,name,status) SELECT v.id::uuid,v.name,v.status::"RecordStatus" FROM (VALUES ${vals(part)}) v(id,name,status) WHERE NOT EXISTS (SELECT 1 FROM "Brand" b WHERE b.name=v.name)`);
    for (const part of chunks(missingManufacturers)) await prisma.$executeRawUnsafe(`INSERT INTO "Manufacturer"(id,name,status) SELECT v.id::uuid,v.name,v.status::"RecordStatus" FROM (VALUES ${vals(part)}) v(id,name,status) WHERE NOT EXISTS (SELECT 1 FROM "Manufacturer" m WHERE m.name=v.name)`);
    for (const part of chunks(missingCategories)) await prisma.$executeRawUnsafe(`INSERT INTO "Category"(id,"industryId",code,"nameRu","nameKk",path,status) SELECT v.id::uuid,v."industryId"::uuid,v.code,v."nameRu",v."nameKk",v.path,v.status::"RecordStatus" FROM (VALUES ${vals(part)}) v(id,"industryId",code,"nameRu","nameKk",path,status) WHERE NOT EXISTS (SELECT 1 FROM "Category" c WHERE c."industryId"=v."industryId"::uuid AND c.code=v.code)`);
    const [freshBrands, freshManufacturers, freshCategories] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT id,name FROM "Brand"`),
      prisma.$queryRawUnsafe(`SELECT id,name FROM "Manufacturer"`),
      prisma.$queryRawUnsafe(`SELECT id,"industryId",code FROM "Category" WHERE "industryId"=${q(industry.id)}`),
    ]);
    brands.clear(); freshBrands.forEach((row) => brands.set(row.name, row));
    manufacturers.clear(); freshManufacturers.forEach((row) => manufacturers.set(row.name, row));
    categories.clear(); freshCategories.forEach((row) => categories.set(row.code, row));
  }

  const resolved = source.map((item) => {
    const existing = existingByKey.get(key(item.name, item.brand));
    return { ...item, existing, slug: existing?.slug ?? slug(item), productId: existing?.id ?? crypto.randomUUID() };
  });
  const newProducts = resolved.filter((item) => !item.existing).map((item) => [q(item.productId), q(item.name), q(item.slug), q(item.brand ? brands.get(item.brand)?.id ?? null : null), q(item.manufacturer ? manufacturers.get(item.manufacturer)?.id ?? null : null), q(item.manufacturerSku ?? null), q(item.gtin ?? null), q(/установ|рентген|сканер|компрессор|автоклав|печь|фрезер|оборудован/i.test(item.name) ? "equipment" : "consumable"), q("ACTIVE"), j({ source: "public-catalog-fallback", sourceId: item.id, sourceUrl: item.sourceUrl ?? null, importedAsCanonicalDraft: true }), q(item.description || `${item.name}. Категория: ${item.category}.`), j({ source: "public-catalog-fallback", sourceUrl: item.sourceUrl ?? null }), q(now)]);

  const summary = { sourceCards: source.length, existingMatched: resolved.length - newProducts.length, newCards: newProducts.length, variantsEnsured: 0, mediaEnsured: 0, searchDocumentsEnsured: 0, mode: apply ? "apply" : "dry-run" };
  if (apply) for (const part of chunks(newProducts)) await prisma.$executeRawUnsafe(`INSERT INTO "Product"(id,"canonicalName",slug,"brandId","manufacturerId","manufacturerSku",gtin,"productType",status,"externalMetadata",description,"descriptionSources","updatedAt") VALUES ${vals(part)} ON CONFLICT(slug) DO NOTHING`);
  const productMap = new Map(resolved.map((item) => [item.id, item.productId]));
  if (!apply) {
    summary.variantsEnsured = source.reduce((sum, item) => sum + Math.max(1, item.variants?.length ?? 0), 0);
    summary.mediaEnsured = source.reduce((sum, item) => sum + (item.media?.length ?? 0), 0);
    summary.searchDocumentsEnsured = source.length;
    console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
    process.exit(0);
  }

  const industries = [], productCategories = [];
  for (const item of resolved) {
    industries.push([q(item.productId), q(industry.id)]);
    const category = categories.get(code(item.category));
    if (category) productCategories.push([q(item.productId), q(category.id)]);
  }
  for (const part of chunks(industries)) await prisma.$executeRawUnsafe(`INSERT INTO "ProductIndustry"("productId","industryId") SELECT v.productId::uuid,v.industryId::uuid FROM (VALUES ${vals(part)}) v(productId,industryId) WHERE NOT EXISTS (SELECT 1 FROM "ProductIndustry" x WHERE x."productId"=v.productId::uuid AND x."industryId"=v.industryId::uuid)`);
  for (const part of chunks(productCategories)) await prisma.$executeRawUnsafe(`INSERT INTO "ProductCategory"("productId","categoryId") SELECT v.productId::uuid,v.categoryId::uuid FROM (VALUES ${vals(part)}) v(productId,categoryId) WHERE NOT EXISTS (SELECT 1 FROM "ProductCategory" x WHERE x."productId"=v.productId::uuid AND x."categoryId"=v.categoryId::uuid)`);

  const ids = resolved.map((item) => q(item.productId));
  const existingVariants = await prisma.$queryRawUnsafe(`SELECT id,"productId",sku,gtin FROM "ProductVariant" WHERE "productId" IN (${ids.join(",")})`);
  const variantKeys = new Set(existingVariants.map((row) => `${row.productId}|${row.sku ?? ""}|${row.gtin ?? ""}`));
  const variantRows = [];
  for (const item of resolved) for (const variant of item.variants?.length ? item.variants : [{ sku: null, gtin: null, label: "Стандартный вариант", attributes: {} }]) {
    const variantKey = `${item.productId}|${variant.sku ?? ""}|${variant.gtin ?? ""}`;
    if (variantKeys.has(variantKey)) continue;
    variantRows.push([q(crypto.randomUUID()), q(item.productId), q(variant.sku ?? null), q(variant.gtin ?? null), q(unit?.id ?? null), q("ACTIVE"), j({ sourceId: item.id, sourceUrl: item.sourceUrl ?? null, label: variant.label ?? null, attributes: variant.attributes ?? {} }), q(now)]);
    variantKeys.add(variantKey);
  }
  for (const part of chunks(variantRows)) await prisma.$executeRawUnsafe(`INSERT INTO "ProductVariant"(id,"productId",sku,gtin,"saleUnitId",status,"externalMetadata","updatedAt") VALUES ${vals(part)}`);
  summary.variantsEnsured = existingVariants.length + variantRows.length;

  const searchRows = resolved.map((item) => {
    const terms = [item.name, item.brand, item.manufacturer, item.category, ...(item.attributes ?? []).flat(), ...(item.aliases ?? [])].filter(Boolean).join(" ");
    return [q(item.productId), q(terms), q(terms.toLocaleLowerCase("ru")), j({ source: "public-catalog-fallback", category: item.category, brand: item.brand || null }), uuids([categories.get(code(item.category))?.id]), uuids([industry.id]), q(false), q(now)];
  });
  for (const part of chunks(searchRows)) {
    const partIds = part.map((row) => row[0]).join(",");
    await prisma.$executeRawUnsafe(`DELETE FROM "ProductSearchDocument" WHERE "productId" IN (${partIds})`);
    await prisma.$executeRawUnsafe(`INSERT INTO "ProductSearchDocument"("productId","searchableText","normalizedText",facets,"categoryIds","industryIds","isAvailable","updatedAt") VALUES ${vals(part)}`);
  }
  summary.searchDocumentsEnsured = searchRows.length;

  const mediaRows = [];
  for (const item of resolved) for (const media of item.media ?? []) mediaRows.push([q(crypto.randomUUID()), q(item.productId), q(media.sourceUrl ?? null), q(media.altText ?? `${item.name} — фото товара`), q(media.width ?? null), q(media.height ?? null), q(media.mimeType ?? null), q(media.securePath ? "READY" : "PENDING"), j(media.metadata ?? {}), q(now)]);
  for (const part of chunks(mediaRows)) await prisma.$executeRawUnsafe(`INSERT INTO "ProductMedia"(id,"productId","sourceUrl","altText",width,height,"mimeType",status,metadata,"updatedAt") SELECT v.id::uuid,v."productId"::uuid,v."sourceUrl",v."altText",v.width::integer,v.height::integer,v."mimeType",v.status,v.metadata,v."updatedAt"::timestamp FROM (VALUES ${vals(part)}) v(id,"productId","sourceUrl","altText",width,height,"mimeType",status,metadata,"updatedAt") WHERE NOT EXISTS(SELECT 1 FROM "ProductMedia" m WHERE m."productId"=v."productId"::uuid AND m."sourceUrl"=v."sourceUrl")`);
  summary.mediaEnsured = mediaRows.length;
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
} finally {
  await prisma.$disconnect();
}
