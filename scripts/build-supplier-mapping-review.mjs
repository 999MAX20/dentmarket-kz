import fs from "node:fs/promises";
import pg from "../apps/api/node_modules/pg/lib/index.js";

const { Client } = pg;
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
await client.connect();
try {
  const rows = (
    await client.query(
      `SELECT p."canonicalName", p."externalMetadata" ->> 'source' AS source, p."externalMetadata" ->> 'externalId' AS "externalId", p."externalMetadata" ->> 'sourceUrl' AS "sourceUrl", v.id AS "productVariantId", CASE WHEN p.status = 'ACTIVE' THEN 'CONFIRMED' ELSE 'DRAFT_REVIEW' END AS "cardStatus" FROM "Product" p JOIN "ProductVariant" v ON v."productId" = p.id WHERE p."externalMetadata" ->> 'importedAsCanonicalDraft' = 'true' AND p."externalMetadata" ->> 'source' IN ('allfordent', 'amdgroup', 'amdgroup-crawled', 'amdgroup-public', 'stomir', 'stomir-crawled', 'stomir-public', 'denti-kz', 'dentalmarket-kz', 'dental-market-kz', 'ddd-kz', 'mediclus-kz', 'nordstom-public', 'profident-s-kz') ORDER BY source, p."canonicalName"`,
    )
  ).rows;
  const header = [
    "supplierSource",
    "externalId",
    "canonicalName",
    "sourceUrl",
    "productVariantId",
    "cardStatus",
  ];
  const output = [header.join(",")];
  for (const row of rows)
    output.push(
      [
        row.source,
        row.externalId,
        row.canonicalName,
        row.sourceUrl,
        row.productVariantId,
        row.cardStatus,
      ]
        .map(csv)
        .join(","),
    );
  await fs.writeFile(
    "data/supplier-mapping-review.csv",
    `${output.join("\n")}\n`,
  );
  const summary = Object.groupBy(rows, (row) => row.source);
  console.log(
    JSON.stringify({
      rows: rows.length,
      bySource: Object.fromEntries(
        Object.entries(summary).map(([key, value]) => [key, value.length]),
      ),
      output: "data/supplier-mapping-review.csv",
      readyForOfferCreation: rows.filter(
        (row) => row.cardStatus === "CONFIRMED",
      ).length,
    }),
  );
} finally {
  await client.end();
}
