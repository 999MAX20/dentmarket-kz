import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://medidez.kz/sitemap-store.xml";
const mainSitemapUrl = "https://medidez.kz/sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/medidez-kz-catalog.json");
const queueOutputPath = path.resolve("data/curation/medidez-kz-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;|&#xfeff;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const [sitemap, mainSitemap] = await Promise.all([requestText(sitemapUrl), requestText(mainSitemapUrl)]);
const productUrls = [...new Set([sitemap, mainSitemap].flatMap((xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1]).replace(/#content\r?$/u, "")))
  .filter((url) => /^https?:\/\//u.test(url))
  .map((url) => url === "http://v-dez-iso" ? "https://medidez.kz/v-dez-iso" : url.replace(/^http:\/\/medidez\.kz/iu, "https://medidez.kz")))].filter((url) => !/\/(?:fi-declean4|md-alkaline1)$/u.test(url));
const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  if (!/Страна производства:<\/strong>\s*Казахстан/iu.test(html)) return null;
  const rawName = html.match(/class=["'][^"']*js-product-name[^"']*["'][^>]*[^>]*>([\s\S]*?)<\/div>/iu)?.[1]
    ?? html.match(/<h1 class=["']tn-atom["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1];
  const name = decode(rawName).replace(/^(Страница товара\s+)?/iu, "");
  if (!name) throw new Error(sourcePageUrl + ": product name not found");
  const rawImage = decode(html.match(/<meta itemprop=["']image["'] content=["']([^"']+)/iu)?.[1]
    ?? html.match(/<meta property=["']og:image["'] content=["']([^"']+)/iu)?.[1]);
  const sourceImageUrl = rawImage ? new URL(rawImage, sourcePageUrl).href : "";
  const description = decode(html.match(/<meta name=["']description["'] content=["']([^"']*)/iu)?.[1]);
  const packaging = decode(html.match(/(?:﻿)?Упаковка:\s*<\/strong>([\s\S]*?)(?:<br\s*\/?>\s*<br|<\/div>)/iu)?.[1]);
  const shelfLife = decode(html.match(/Срок годности:\s*<\/strong>([\s\S]*?)(?:<br\s*\/?>\s*<br|<\/div>)/iu)?.[1]);
  return { officialProductId: "MEDIDEZ-" + token(name), brand: "МедиДез", manufacturer: "ТОО «НПО МедиДез»", name,
    manufacturerRef: "", manufacturerRefs: "", variantCount: 0, variants: [], variantDimensions: { packaging }, packaging, shelfLife,
    categoryPath: "Дезинфекция и стерилизация", description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl, kzEvidence: "EXACT_KZ_MANUFACTURER_LISTING", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const byName = new Map();
for (const product of crawled.filter((record) => record && !record.error)) {
  const key = token(product.name);
  const previous = byName.get(key);
  if (!previous || (!previous.packaging && product.packaging) || (!previous.sourceImageUrl && product.sourceImageUrl)) byName.set(key, product);
}
const products = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
const report = { brand: "МедиДез", manufacturer: "ТОО «НПО МедиДез»", sourceType: "OFFICIAL_KAZAKHSTAN_MANUFACTURER_STORE_SITEMAP", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { sitemapProductUrls: productUrls.length, discoveredProducts: products.length,
    productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    productsWithPackaging: products.filter((product) => product.packaging).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "packaging", "shelfLife", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
