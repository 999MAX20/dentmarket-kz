import pg from "../apps/api/node_modules/pg/lib/index.js";

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await client.query("BEGIN");
  const industry = (
    await client.query('SELECT id FROM "Industry" WHERE code = $1', [
      "dentistry-kz",
    ])
  ).rows[0];
  const unit = (
    await client.query('SELECT id FROM "UnitOfMeasure" WHERE code = $1', [
      "piece",
    ])
  ).rows[0];
  if (!industry || !unit)
    throw new Error("dentistry-kz industry or piece unit is missing");

  await client.query(
    `
    INSERT INTO "Category" (id, "industryId", code, "nameRu", "nameKk", path, depth, status)
    VALUES (gen_random_uuid(), $1, 'imported-catalog', 'Импортированный каталог', 'Импортталған каталог', 'imported-catalog', 0, 'ACTIVE')
    ON CONFLICT ("industryId", code) DO NOTHING
  `,
    [industry.id],
  );
  const category = (
    await client.query(
      'SELECT id FROM "Category" WHERE "industryId" = $1 AND code = $2',
      [industry.id, "imported-catalog"],
    )
  ).rows[0];

  const variants = await client.query(
    `
    INSERT INTO "ProductVariant" (id, "productId", "saleUnitId", status, "externalMetadata", version, "createdAt", "updatedAt")
    SELECT gen_random_uuid(), p.id, $1, 'DRAFT', jsonb_build_object(
      'source', p."externalMetadata"->>'source',
      'externalId', p."externalMetadata"->>'externalId',
      'sourceUrl', p."externalMetadata"->>'sourceUrl',
      'structureRepair', '2026-07-18-batch'
    ), 1, NOW(), NOW()
    FROM "Product" p
    WHERE p."externalMetadata"->>'importedAsCanonicalDraft' = 'true'
      AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id)
    RETURNING id
  `,
    [unit.id],
  );
  const industries = await client.query(
    `
    INSERT INTO "ProductIndustry" ("productId", "industryId")
    SELECT p.id, $1 FROM "Product" p
    WHERE p."externalMetadata"->>'importedAsCanonicalDraft' = 'true'
      AND NOT EXISTS (SELECT 1 FROM "ProductIndustry" pi WHERE pi."productId" = p.id AND pi."industryId" = $1)
    ON CONFLICT DO NOTHING RETURNING "productId"
  `,
    [industry.id],
  );
  const categories = await client.query(
    `
    INSERT INTO "ProductCategory" ("productId", "categoryId")
    SELECT p.id, $1 FROM "Product" p
    WHERE p."externalMetadata"->>'importedAsCanonicalDraft' = 'true'
      AND NOT EXISTS (SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p.id AND pc."categoryId" = $1)
    ON CONFLICT DO NOTHING RETURNING "productId"
  `,
    [category.id],
  );
  await client.query("COMMIT");
  console.log(
    JSON.stringify({
      variants: variants.rowCount,
      industries: industries.rowCount,
      categories: categories.rowCount,
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
