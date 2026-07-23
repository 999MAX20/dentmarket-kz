import fs from "node:fs/promises";
import path from "node:path";

const catalogUrl = "https://www.lintex.ru/catalog/";
const jsonOutputPath = path.resolve("data/catalog-evidence/lintex-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/lintex-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const catalogHtml = await requestText(catalogUrl);
const candidateUrls = [...new Set([...catalogHtml.matchAll(/<a class=["']catalog-item["'] href=["']([^"']+)/giu)].map((match) => new URL(decode(match[1]), catalogUrl).href))];
const crawled = await pool(candidateUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const breadcrumbs = [...html.matchAll(/class=["']breadcrumb-item[^"']*["'][\s\S]*?<span[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/giu)].map((match) => decode(match[1]));
  if (!breadcrumbs.some((part) => /шовные материалы/iu.test(part))) return null;
  const name = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  if (!name) throw new Error(sourcePageUrl + ": product name not found");
  const subtitle = decode(html.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<p>([\s\S]*?)<\/p>/iu)?.[1]);
  const rawImage = decode(html.match(/<div class=["']page-head__img-wrap["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)/iu)?.[1]);
  const sourceImageUrl = rawImage ? new URL(rawImage, sourcePageUrl).href : "";
  const sections = [...html.matchAll(/<div class=["']dd-group__item["'][^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<div class=["']dd-group__content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/giu)]
    .map((match) => [decode(match[1]), decode(match[2])]).filter(([heading, text]) => heading && text);
  const description = sections.map(([heading, text]) => heading + ": " + text).join(" ") || subtitle;
  return { officialProductId: "LINTEX-" + token(name), brand: "Линтэкс", manufacturer: "ООО «Линтэкс»", name,
    manufacturerRef: "", manufacturerRefs: "", variantCount: 0, variants: [], categoryPath: breadcrumbs.slice(1, -1).join(" > "),
    description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "ru"));
const report = { brand: "Линтэкс", manufacturer: "ООО «Линтэкс»", sourceType: "OFFICIAL_SURGICAL_SUTURE_CATALOG",
  sourceUrl: catalogUrl, lastChecked: new Date().toISOString().slice(0, 10), totals: { catalogFamilies: candidateUrls.length,
    discoveredProducts: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    nomenclatureRequired: products.length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
