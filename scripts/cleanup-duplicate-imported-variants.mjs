import pg from "../apps/api/node_modules/pg/lib/index.js";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  const result = await client.query(`WITH ranked AS (
    SELECT v.id, row_number() OVER (PARTITION BY v."productId" ORDER BY v."createdAt", v.id) AS rn
    FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
    WHERE p."externalMetadata" ->> 'importedAsCanonicalDraft' = 'true'
  ), deletable AS (
    SELECT r.id FROM ranked r WHERE r.rn > 1
      AND NOT EXISTS (SELECT 1 FROM "SupplierOffer" o WHERE o."productVariantId" = r.id)
      AND NOT EXISTS (SELECT 1 FROM "InventoryBalance" b WHERE b."productVariantId" = r.id)
      AND NOT EXISTS (SELECT 1 FROM "SupplierExternalItem" e WHERE e."matchedVariantId" = r.id)
      AND NOT EXISTS (SELECT 1 FROM "SupplierMappingMemory" m WHERE m."productVariantId" = r.id)
  ) DELETE FROM "ProductVariant" v USING deletable d WHERE v.id = d.id RETURNING v.id`);
  console.log(JSON.stringify({ deleted: result.rowCount }));
} finally {
  await client.end();
}
