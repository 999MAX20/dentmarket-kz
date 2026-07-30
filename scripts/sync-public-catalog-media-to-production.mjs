import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";

const root = process.cwd();
const catalog = JSON.parse(fs.readFileSync(`${root}/apps/buyer-web/app/data/public-catalog-fallback.json`, "utf8"));
if (!process.env.DATABASE_URL) {
  const password = execFileSync("security", ["find-generic-password", "-s", "dentmarket-kz-supabase-db", "-w"], { encoding: "utf8" }).trim();
  process.env.DATABASE_URL = `postgresql://postgres.tlxxicjzppflpkcgnauo:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`;
}
const prisma = new PrismaClient();
const q = (value) => value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const j = (value) => `${q(JSON.stringify(value ?? {}))}::jsonb`;
const chunks = (items, size = 250) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
const values = (rows) => rows.map((row) => `(${row.join(",")})`).join(",");
const now = new Date().toISOString();

try {
  const products = await prisma.$queryRawUnsafe(`SELECT p.id,p."canonicalName",b.name AS "brandName",p."externalMetadata" FROM "Product" p LEFT JOIN "Brand" b ON b.id=p."brandId"`);
  const bySourceId = new Map(products.map((row) => [row.externalMetadata?.sourceId, row.id]).filter(([sourceId]) => sourceId));
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru");
  const byNameBrand = new Map();
  for (const row of products) {
    const productKey = `${normalize(row.canonicalName)}|${normalize(row.brandName)}`;
    if (!byNameBrand.has(productKey)) byNameBrand.set(productKey, row.id);
  }
  const existing = await prisma.$queryRawUnsafe(`SELECT "productId","sourceUrl" FROM "ProductMedia"`);
  const existingKeys = new Set(existing.map((row) => `${row.productId}|${row.sourceUrl ?? ""}`));
  const rows = [];
  for (const item of catalog.products) {
    const productId = bySourceId.get(item.id) ?? byNameBrand.get(`${normalize(item.name)}|${normalize(item.brand)}`);
    if (!productId) continue;
    for (const media of item.media ?? []) {
      const sourceUrl = media.sourceUrl ?? null;
      if (existingKeys.has(`${productId}|${sourceUrl ?? ""}`)) continue;
      rows.push([
        q(crypto.randomUUID()), q(productId), q(sourceUrl), q(media.altText ?? `${item.name} — фото товара`),
        media.width == null ? "NULL" : q(media.width), media.height == null ? "NULL" : q(media.height), q(media.mimeType ?? null),
        q(media.securePath ? "READY" : "PENDING"), j(media.metadata ?? {}), q(now),
      ]);
      existingKeys.add(`${productId}|${sourceUrl ?? ""}`);
    }
  }
  for (const part of chunks(rows)) {
    await prisma.$executeRawUnsafe(`INSERT INTO "ProductMedia"(id,"productId","sourceUrl","altText",width,height,"mimeType",status,metadata,"updatedAt") SELECT v.id::uuid,v."productId"::uuid,v."sourceUrl",v."altText",v.width::integer,v.height::integer,v."mimeType",v.status,v.metadata,v."updatedAt"::timestamp FROM (VALUES ${values(part)}) v(id,"productId","sourceUrl","altText",width,height,"mimeType",status,metadata,"updatedAt")`);
  }
  console.log(JSON.stringify({ ok: true, sourceCards: catalog.products.length, mediaAdded: rows.length }, null, 2));
} finally {
  await prisma.$disconnect();
}
