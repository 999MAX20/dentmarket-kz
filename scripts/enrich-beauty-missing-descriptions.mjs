#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = process.cwd();
const file = path.join(root, "data/intake/beauty-kz/public-catalog-sitemap.csv");
const clean = (value) => String(value ?? "")
  .replace(/<script[\s\S]*?<\/script>/giu, " ")
  .replace(/<style[\s\S]*?<\/style>/giu, " ")
  .replace(/<[^>]+>/gu, " ")
  .replace(/&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/&#x27;/gu, "'")
  .replace(/&nbsp;/gu, " ").replace(/&ndash;/gu, "–").replace(/&mdash;/gu, "—")
  .replace(/&#\d+;/gu, " ").replace(/\s+/gu, " ").trim();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const meta = (html, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const forward = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "iu"));
  const reverse = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["']`, "iu"));
  return clean(forward?.[1] ?? reverse?.[1] ?? "");
};
const jsonLdDescription = (html) => {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      const product = items.find((item) => item?.["@type"] === "Product");
      if (clean(product?.description).length >= 40) return clean(product.description);
    } catch { /* public pages may contain malformed JSON-LD */ }
  }
  return "";
};
const tabDescription = (html) => {
  const start = html.search(/<div[^>]+id=["']tab-description["'][^>]*>/iu);
  if (start < 0) return "";
  const rest = html.slice(start);
  const end = rest.search(/<div[^>]+id=["']tab-(?:review|characteristics|features)["'][^>]*>/iu);
  const block = end > 0 ? rest.slice(0, end) : rest.slice(0, 120000);
  const text = clean(block);
  return text.length >= 40 ? text : "";
};
const rows = parse(await fs.readFile(file), { columns: true, skip_empty_lines: true, bom: true });
const headers = Object.keys(rows[0] ?? {});
const candidates = rows.filter((row) => !row.description && row.sourceUrl);
let enriched = 0;
let removedNonProducts = 0;
for (const row of candidates) {
  try {
    const response = await fetch(row.sourceUrl, { headers: { "user-agent": "DentMarket public catalog research/1.0" } });
    if (!response.ok) continue;
    const html = await response.text();
    const description = jsonLdDescription(html) || meta(html, "description") || meta(html, "og:description") || tabDescription(html);
    if (description.length >= 40) {
      row.description = description;
      enriched += 1;
    } else if (/\/catalog\//iu.test(new URL(row.sourceUrl).pathname) && !/<(?:h1|h2)[^>]*>[^<]{3,}<\/(?:h1|h2)>/iu.test(html)) {
      row.__remove = true;
      removedNonProducts += 1;
    }
  } catch { /* public source may be unavailable; retain the review queue */ }
}
const kept = rows.filter((row) => !row.__remove).map(({ __remove, ...row }) => row);
await fs.writeFile(file, `${headers.join(",")}\n${kept.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`);
console.log(JSON.stringify({ candidates: candidates.length, enriched, removedNonProducts, remaining: kept.filter((row) => !row.description).length, file }, null, 2));
