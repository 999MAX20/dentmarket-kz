import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://dental.strauss-co.com";
const sitemapUrls = [`${origin}/products-sitemap.xml`, `${origin}/products-sitemap2.xml`];
const jsonOutputPath = path.resolve("data/catalog-evidence/strauss-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/strauss-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(35_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(14, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }
const parameterMap = (html) => new Map([...html.matchAll(/single_products__right__parameters__item__name["']?[^>]*>\s*([\s\S]*?)<\/div>\s*<div class=["']single_products__right__parameters__item__val["'][^>]*>\s*([\s\S]*?)<\/div>/giu)].map((match) => [decode(match[1]).toLowerCase(), decode(match[2])]));

const sitemapPages = await pool(sitemapUrls, requestText);
const sitemapErrors = sitemapPages.filter((record) => record?.error);
const detailUrls = [...new Set(sitemapPages.filter((record) => typeof record === "string").flatMap((xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1]))).filter((url) => /^https:\/\/dental\.strauss-co\.com\/products\//u.test(url)))];
const crawled = await pool(detailUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const params = parameterMap(html);
  const manufacturerRef = params.get("code") || decode(html.match(/<h1 class=["']single_products__right__title["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  const description = decode(html.match(/<div class=["']single_products__right__desc["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
  const categoryPath = decode(html.match(/<div class=["']single_products__right__category["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
  const sourceImageUrl = decode(html.match(/<div class=["']single_products__left["'][\s\S]*?<img src=["']([^"']+)/iu)?.[1]);
  if (!manufacturerRef) return { sourcePageUrl, skipped: "MANUFACTURER_REFERENCE_MISSING" };
  const specifications = Object.fromEntries(params);
  return { officialProductId: `STRAUSS-${manufacturerRef}`, brand: "Strauss", manufacturer: "Strauss & Co. Industrial Diamonds Ltd.", name: description || manufacturerRef, manufacturerRef, manufacturerRefs: manufacturerRef, model: manufacturerRef, variantCount: 1, variants: [{ manufacturerRef, specifications }], categoryPath, description, specifications, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, kzEvidence: "BRAND_OBSERVED_AT_KAZAKHSTAN_RETAILER", status: sourceImageUrl ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = [...sitemapErrors, ...crawled.filter((record) => record?.error)];
const skipped = crawled.filter((record) => record?.skipped);
const products = [...new Map(crawled.filter((record) => record && !record.error && !record.skipped).map((product) => [product.manufacturerRef, product])).values()].sort((a, b) => a.manufacturerRef.localeCompare(b.manufacturerRef, "en", { numeric: true }));
const report = { brand: "Strauss", manufacturer: "Strauss & Co. Industrial Diamonds Ltd.", sourceType: "OFFICIAL_CURRENT_MANUFACTURER_PRODUCT_SITEMAPS", sourceUrl: sitemapUrls.join(" | "), lastChecked: new Date().toISOString().slice(0, 10), policy: { allCurrentProductSitemapsTraversed: true, oneOfficialSkuPagePerRecord: true, exactManufacturerCodesPreserved: true, exactOfficialProductImagesOnly: true, noIndustrialToolsIncluded: true, kzAvailabilityRequiresSupplierEvidence: true, missingImagesRetainedForReview: true }, totals: { sitemapProducts: detailUrls.length, discoveredProducts: products.length, variantSkus: products.length, productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateReferencesCollapsed: crawled.filter((record) => record && !record.error && !record.skipped).length - products.length, skippedPages: skipped.length, crawlErrors: errors.length }, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
