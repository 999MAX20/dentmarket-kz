#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = process.cwd();
const file = path.join(root, "data/intake/beauty-kz/public-catalog-sitemap.csv");
const clean = (value) => String(value ?? "").replace(/&amp;/gu, "&").replace(/&#x27;/gu, "'").trim();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const rows = parse(await fs.readFile(file), { columns: true, skip_empty_lines: true, bom: true });
const headers = Object.keys(rows[0] ?? {});
const candidates = rows.filter((row) => !row.imageUrl && row.sourceUrl);
let enriched = 0;
for (const row of candidates) {
  try {
    const html = await (await fetch(row.sourceUrl, { headers: { "user-agent": "DentMarket public catalog research/1.0" } })).text();
    const imageTag = html.match(/<img[^>]+id=["']image["'][^>]*>/iu)?.[0] ?? "";
    const image = imageTag.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/iu)?.[1]
      ?? html.match(/<img[^>]+src\s*=\s*["']?([^"'\s>]*(?:\/thumb\/[^"'\s>]*276r276|\/wp-content\/uploads\/[^"'\s>]+))["']?/iu)?.[1];
    if (!image) continue;
    row.imageUrl = new URL(clean(image), row.sourceUrl).href;
    enriched += 1;
  } catch { /* public source may be unavailable; leave the review queue intact */ }
}
await fs.writeFile(file, `${headers.join(",")}\n${rows.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`);
console.log(JSON.stringify({ candidates: candidates.length, enriched, remaining: candidates.length - enriched, file }, null, 2));
