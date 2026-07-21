import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const requireFromApi = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);

function keyBytes(value, name) {
  if (!value) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32)
    throw new Error(`${name} must be a base64-encoded 32-byte key`);
  return decoded;
}

const currentKey = keyBytes(
  process.env.INTEGRATION_ENCRYPTION_KEY,
  "INTEGRATION_ENCRYPTION_KEY",
);
const previousKey = keyBytes(
  process.env.INTEGRATION_ENCRYPTION_KEY_PREVIOUS,
  "INTEGRATION_ENCRYPTION_KEY_PREVIOUS",
);
if (
  currentKey &&
  previousKey &&
  createHash("sha256").update(currentKey).digest("hex") ===
    createHash("sha256").update(previousKey).digest("hex")
) {
  throw new Error(
    "Current and previous integration encryption keys must be different",
  );
}

const databaseUrl =
  process.env.SECURITY_AUDIT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log(
    JSON.stringify(
      {
        environmentKeys: {
          currentConfigured: Boolean(currentKey),
          previousConfigured: Boolean(previousKey),
          distinct:
            !(currentKey && previousKey) || !currentKey.equals(previousKey),
        },
        database: "skipped_without_DATABASE_URL",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const { Client } = requireFromApi("pg");
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  const columns = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'IntegrationConnection' AND column_name = 'encryptedConfiguration')
        OR (table_name = 'SupplierDataSource' AND column_name = 'encryptedConfiguration'))
  `);
  const columnSet = new Set(
    columns.rows.map(
      ({ table_name, column_name }) => `${table_name}.${column_name}`,
    ),
  );
  for (const required of [
    "IntegrationConnection.encryptedConfiguration",
    "SupplierDataSource.encryptedConfiguration",
  ]) {
    if (!columnSet.has(required))
      throw new Error(
        `Required encrypted storage column is missing: ${required}`,
      );
  }

  const configs = await client.query(`
    SELECT 'IntegrationConnection' AS table_name, "configuration" AS configuration, "encryptedConfiguration" AS encrypted
    FROM "IntegrationConnection" WHERE "configuration" IS NOT NULL
    UNION ALL
    SELECT 'SupplierDataSource', "configuration", "encryptedConfiguration"
    FROM "SupplierDataSource" WHERE "configuration" IS NOT NULL
  `);
  const sensitiveKey =
    /(^|_|-)(token|secret|password|passwd|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|authorization|credential)(_|-|$)/i;
  let plaintextSensitiveKeys = 0;
  let encryptedConfigRows = 0;
  const scan = (value) => {
    if (Array.isArray(value)) return value.forEach(scan);
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (sensitiveKey.test(key)) plaintextSensitiveKeys += 1;
      scan(nested);
    }
  };
  for (const row of configs.rows) {
    scan(row.configuration);
    if (row.encrypted) encryptedConfigRows += 1;
  }
  if (plaintextSensitiveKeys > 0)
    throw new Error(
      `Plaintext sensitive configuration keys detected: ${plaintextSensitiveKeys}`,
    );
  console.log(
    JSON.stringify(
      {
        environmentKeys: {
          currentConfigured: Boolean(currentKey),
          previousConfigured: Boolean(previousKey),
          distinct:
            !(currentKey && previousKey) || !currentKey.equals(previousKey),
        },
        database: {
          encryptedColumns: [...columnSet].sort(),
          configurationRows: configs.rowCount,
          encryptedConfigRows,
          plaintextSensitiveKeys,
        },
        valuesRead: false,
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
