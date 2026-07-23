import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://amazing-smile.ru/sitemap-store.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/amazing-white-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/amazing-white-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const sitemap = await requestText(sitemapUrl);
const productUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])).filter(Boolean))];
const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const productStart = html.search(/<div[^>]+js-store-product_single/iu);
  const productEnd = productStart >= 0 ? html.indexOf("<!-- catalog single product setup start -->", productStart) : -1;
  const productHtml = productStart >= 0 ? html.slice(productStart, productEnd > productStart ? productEnd : undefined) : html;
  let name = decode(productHtml.match(/class=["'][^"']*js-product-name[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
  const manufacturerRef = decode(productHtml.match(/class=["'][^"']*js-store-prod-sku[^"']*["'][^>]*>[\s\S]*?SKU:\s*([^<]+)/iu)?.[1]);
  const storeProductUid = decode(productHtml.match(/data-product-gen-uid=["']([^"']+)/iu)?.[1]);
  if (!name) throw new Error(sourcePageUrl + ": product name not found");
  const imageUrls = [...new Set([...productHtml.matchAll(/<meta itemprop=["']image["'] content=["']([^"']+)/giu)].map((match) => decode(match[1])).filter(Boolean))];
  const description = decode(productHtml.match(/class=["'][^"']*t762__descr[^"']*["'][^>]+field=["']descr["'][^>]*>([\s\S]*?)<\/div>\s*<div class=["'][^"']*t762__descr/iu)?.[1]
    ?? html.match(/<meta name=["']description["'] content=["']([^"']*)/iu)?.[1]);
  if (/\/pro-topaz-3000-arc\/?$/iu.test(sourcePageUrl) && !/\bPRO\b/iu.test(name)) name += " PRO";
  return { officialProductId: storeProductUid ? "AMAZING-WHITE-STORE-" + storeProductUid : "AMAZING-WHITE-" + token(name), brand: "Amazing White",
    manufacturer: "Amazing White", name, manufacturerRef, manufacturerRefs: manufacturerRef, storeProductUid, variantCount: 1, variants: [],
    categoryPath: "Отбеливание и эстетика", description, sourceImageUrl: imageUrls[0] ?? "", imageUrls: imageUrls.join(" | "), imageCount: imageUrls.length,
    sourcePageUrl, kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: imageUrls.length && manufacturerRef ? "KZ_SKU_EVIDENCE_REQUIRED" : imageUrls.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const rawProducts = crawled.filter((record) => record && !record.error);
const refCounts = new Map();
for (const product of rawProducts) if (product.manufacturerRef) refCounts.set(product.manufacturerRef, (refCounts.get(product.manufacturerRef) ?? 0) + 1);
const duplicateRefs = [...refCounts.entries()].filter(([, count]) => count > 1).map(([ref]) => ref);
const products = rawProducts.map((product) => refCounts.get(product.manufacturerRef) > 1 ? {
  ...product, ambiguousManufacturerRef: product.manufacturerRef, manufacturerRef: "", manufacturerRefs: "", status: "MANUFACTURER_REFERENCE_REQUIRED",
} : product).sort((a, b) => a.name.localeCompare(b.name, "ru"));
const report = { brand: "Amazing White", manufacturer: "Amazing White", sourceType: "OFFICIAL_IMPORTER_CURRENT_STORE_SITEMAP", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { sitemapProductUrls: productUrls.length, discoveredProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    duplicateManufacturerRefs: duplicateRefs.length, productsWithAmbiguousSourceSku: products.filter((product) => product.ambiguousManufacturerRef).length,
    crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
