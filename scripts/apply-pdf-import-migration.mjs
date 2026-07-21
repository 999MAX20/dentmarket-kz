import fs from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const pg = require("pg");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const migrationName = "20260717162000_pdf_supplier_import";
const path = new URL(
  `../apps/api/prisma/migrations/${migrationName}/migration.sql`,
  import.meta.url,
);
const sql = await fs.readFile(path, "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const existing = await client.query(
    "SELECT 1 FROM _prisma_migrations WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL",
    [migrationName],
  );
  if (existing.rowCount === 0) {
    for (const statement of sql
      .split(/;\s*(?:\n|$)/)
      .map((value) => value.trim())
      .filter(Boolean))
      await client.query({ text: statement, queryMode: "simple" });
    await client.query(
      "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES ($1, $2, CURRENT_TIMESTAMP, $3, NULL, NULL, CURRENT_TIMESTAMP, 1)",
      [
        randomUUID(),
        createHash("sha256").update(sql).digest("hex"),
        migrationName,
      ],
    );
  }
  console.log(
    JSON.stringify({ migrationName, applied: existing.rowCount === 0 }),
  );
} finally {
  await client.end();
}
