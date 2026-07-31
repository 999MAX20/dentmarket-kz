#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = process.cwd();
const output = path.join(root, "data/intake/beauty-kz/canonical-cards-deduplicated.csv");
const report = path.join(root, "data/reports/beauty-kz/canonical-cards-deduplicated.json");
const files = [
  "data/intake/beauty-kz/ucg-kz.csv",
  "data/intake/beauty-kz/public-catalog-discovery.csv",
  "data/intake/beauty-kz/public-catalog-discovery-expanded.csv",
  "data/intake/beauty-kz/public-catalog-sitemap.csv",
];
const read = async (file) => {
  try { return parse(await fs.readFile(path.join(root, file)), { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true }); }
  catch { return []; }
};
const clean = (value) => String(value ?? "").replace(/<[^>]+>/gu, " ").replace(/&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/\s+/gu, " ").trim();
const normalized = (value) => clean(value).toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const rows = (await Promise.all(files.map(read))).flat().filter((row) => row.externalId && row.name);
const groups = new Map();
for (const row of rows) {
  const identity = `${normalized(row.brand)}|${normalized(row.name)}|${normalized(row.variantLabel)}|${normalized(row.gtin)}`;
  const current = groups.get(identity);
  if (!current) {
    groups.set(identity, { ...row, sourceUrls: row.sourceUrl || "", supplierKeys: row.supplierKey || row.sourceId || "", sourceCount: 1 });
    continue;
  }
  current.sourceUrls = [...new Set([current.sourceUrls, row.sourceUrl].filter(Boolean))].join(" | ");
  current.supplierKeys = [...new Set([current.supplierKeys, row.supplierKey || row.sourceId].filter(Boolean))].join(" | ");
  current.sourceCount += 1;
  if (clean(row.description).length > clean(current.description).length) current.description = row.description;
  if (!current.imageUrl && row.imageUrl) current.imageUrl = row.imageUrl;
  if (!current.brand && row.brand) current.brand = row.brand;
}
const headers = ["externalId", "name", "brand", "manufacturer", "unit", "description", "category", "variantLabel", "imageUrl", "sourceUrls", "supplierKeys", "sourceCount", "priceMinor", "currency", "quantityOnHand", "warehouse", "leadTimeDays", "dataPolicy"];
const unique = [...groups.values()].map((row) => ({ ...row, priceMinor: "", currency: "", quantityOnHand: "", warehouse: "", leadTimeDays: "", dataPolicy: "CANONICAL_ONLY_NO_COMMERCIAL_DATA" }));
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(path.dirname(report), { recursive: true });
await fs.writeFile(output, `${headers.join(",")}\n${unique.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`);
await fs.writeFile(report, `${JSON.stringify({ generatedAt: new Date().toISOString(), inputs: files, sourceRows: rows.length, canonicalCards: unique.length, duplicatesCollapsed: rows.length - unique.length, commercialRows: unique.filter((row) => row.priceMinor || row.currency || row.quantityOnHand || row.warehouse || row.leadTimeDays).length, cardsWithoutImage: unique.filter((row) => !row.imageUrl).length, cardsWithoutDescription: unique.filter((row) => !row.description).length }, null, 2)}\n`);
console.log(JSON.stringify({ sourceRows: rows.length, canonicalCards: unique.length, duplicatesCollapsed: rows.length - unique.length }, null, 2));
