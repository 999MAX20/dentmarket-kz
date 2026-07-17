import pg from '../apps/api/node_modules/pg/lib/index.js';

const { Client } = pg;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const slugify = (value) => String(value || '').toLocaleLowerCase('ru').replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 64) || 'imported-catalog';

await client.connect();
try {
  const industry = (await client.query('SELECT id FROM "Industry" WHERE code = $1', ['dentistry-kz'])).rows[0];
  const unit = (await client.query('SELECT id FROM "UnitOfMeasure" WHERE code = $1', ['piece'])).rows[0];
  if (!industry || !unit) throw new Error('dentistry-kz industry or piece unit is missing');
  const rows = (await client.query(`SELECT p.id, p."canonicalName", p."externalMetadata" FROM "Product" p WHERE p."externalMetadata" ->> 'importedAsCanonicalDraft' = 'true' AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) ORDER BY p.id`)).rows;
  let repaired = 0;
  for (const row of rows) {
    const metadata = row.externalMetadata && typeof row.externalMetadata === 'object' ? row.externalMetadata : {};
    const source = String(metadata.source || 'imported');
    const pathPart = String(metadata.sourceUrl || '').match(/\/catalog\/([^/?#]+)/i)?.[1];
    const categoryCode = `${slugify(source)}-${slugify(pathPart || 'stomatologiya')}`;
    await client.query('BEGIN');
    try {
      await client.query(`INSERT INTO "Category" (id, "industryId", code, "nameRu", "nameKk", path, depth, status) VALUES (gen_random_uuid(), $1, $2, $3, $4, $2, 0, 'ACTIVE') ON CONFLICT ("industryId", code) DO NOTHING`, [industry.id, categoryCode, pathPart ? `Импорт: ${decodeURIComponent(pathPart).replace(/[-_]+/g, ' ')}` : 'Импортированный каталог', 'Импортталған каталог']);
      const category = (await client.query('SELECT id FROM "Category" WHERE "industryId" = $1 AND code = $2', [industry.id, categoryCode])).rows[0];
      await client.query(`INSERT INTO "ProductVariant" (id, "productId", "saleUnitId", status, "externalMetadata", version, "createdAt", "updatedAt") SELECT gen_random_uuid(), $1, $2, 'DRAFT', $3::jsonb, 1, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM "ProductVariant" WHERE "productId" = $1)`, [row.id, unit.id, JSON.stringify({ source, externalId: metadata.externalId || null, sourceUrl: metadata.sourceUrl || null, structureRepair: '2026-07-17' })]);
      await client.query(`INSERT INTO "ProductIndustry" ("productId", "industryId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [row.id, industry.id]);
      await client.query(`INSERT INTO "ProductCategory" ("productId", "categoryId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [row.id, category.id]);
      await client.query('COMMIT');
      repaired += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  console.log(JSON.stringify({ scanned: rows.length, repaired }));
} finally {
  await client.end();
}
