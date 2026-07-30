import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const input = path.join(root, "data/templates/product-knowledge-graph.csv");
const allowedTypes = new Set([
  "COMPATIBLE_WITH",
  "REPLACES",
  "CONSUMABLE_FOR",
  "USED_WITH",
  "SUCCESSOR_OF",
  "DISCONTINUED_REPLACED_BY",
]);
const allowedStatuses = new Set([
  "SUGGESTED",
  "VERIFIED",
  "REJECTED",
  "ARCHIVED",
]);
const allowedSources = new Set([
  "MANUFACTURER",
  "REGULATORY_DOCUMENT",
  "OFFICIAL_DISTRIBUTOR",
  "SUPPLIER_FEED",
  "OPEN_CATALOG",
  "DENTMARKET_EDITOR",
]);
const parseLine = (line) => {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += char;
  }
  cells.push(value);
  return cells;
};
const lines = (await fs.readFile(input, "utf8")).trim().split(/\r?\n/);
const headers = parseLine(lines.shift() ?? "");
const rows = lines
  .filter(Boolean)
  .map((line) =>
    Object.fromEntries(parseLine(line).map((value, i) => [headers[i], value])),
  );
const errors = [];
const seen = new Set();
rows.forEach((row, index) => {
  const line = index + 2;
  for (const field of [
    "fromExternalId",
    "toExternalId",
    "source",
    "type",
    "status",
    "confidence",
    "sourceType",
  ]) {
    if (!row[field]) errors.push(`line ${line}: ${field} is required`);
  }
  if (row.fromExternalId && row.fromExternalId === row.toExternalId)
    errors.push(`line ${line}: self relation is forbidden`);
  if (row.type && !allowedTypes.has(row.type))
    errors.push(`line ${line}: unsupported type ${row.type}`);
  if (row.status && !allowedStatuses.has(row.status))
    errors.push(`line ${line}: unsupported status ${row.status}`);
  if (row.sourceType && !allowedSources.has(row.sourceType))
    errors.push(`line ${line}: unsupported sourceType ${row.sourceType}`);
  const confidence = Number(row.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)
    errors.push(`line ${line}: confidence must be between 0 and 1`);
  if (row.status === "VERIFIED" && !row.sourceUrl && !row.evidence)
    errors.push(`line ${line}: VERIFIED relation needs sourceUrl or evidence`);
  const key = [row.fromExternalId, row.toExternalId, row.type].join("|");
  if (seen.has(key)) errors.push(`line ${line}: duplicate relation ${key}`);
  seen.add(key);
});
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  JSON.stringify(
    {
      ok: true,
      rows: rows.length,
      verified: rows.filter((row) => row.status === "VERIFIED").length,
    },
    null,
    2,
  ),
);
