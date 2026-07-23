import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://mercury-dent.pro";
const sitemapUrl = `${origin}/sitemap-iblock-2.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/mercury-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/mercury-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(35_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(12, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }
const categoryNames = { "stomatologicheskie-ustanovki": "Стоматологические установки", "stomatologicheskie-stulya": "Стоматологические стулья", "stomatologicheskie-nakonechniki": "Стоматологические наконечники", mikroskopy: "Микроскопы", implantologiya: "Имплантология", kompressory: "Компрессоры", "polimerizatsionnye-lampy": "Полимеризационные лампы", matrasy: "Матрасы для стоматологических кресел", mikromotory: "Микромоторы", irrigatory: "Ирригаторы" };

const sitemap = await requestText(sitemapUrl);
const allUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))];
const detailUrls = allUrls.filter((url) => { const parts = new URL(url).pathname.split("/").filter(Boolean); return parts[0] === "catalog" && parts.length >= 2; });
const crawled = await pool(detailUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const name = decode(html.match(/<h1 class=["']title-3["']>([\s\S]*?)<\/h1>/iu)?.[1] || html.match(/product-head__title["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  const manufacturerRef = decode(html.match(/product-head__id["'][^>]*>\s*Артикул:\s*([^<]+)/iu)?.[1]);
  const productHead = html.match(/<section class=["']product-head["']>([\s\S]*?)<\/section>/iu)?.[1] ?? "";
  const imageUrls = [...new Set([...productHead.matchAll(/(?:href|src)=["'](\/upload\/iblock\/[^"']+)/giu)].map((match) => new URL(match[1], origin).href))];
  const specs = Object.fromEntries([...html.matchAll(/product-info-item__title["'][^>]*>([\s\S]*?)<\/span>\s*<span class=["']body-3 product-info-item__value["'][^>]*>([\s\S]*?)<\/span>/giu)].map((match) => [decode(match[1]).replace(/:$/u, ""), decode(match[2])]));
  const categorySlug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean)[1];
  if (!name || !productHead) return { sourcePageUrl, skipped: "CATEGORY_OR_NON_PRODUCT_PAGE" };
  const sourceSlug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).at(-1);
  return { officialProductId: `MERCURY-${manufacturerRef || sourceSlug.toUpperCase()}`, brand: "Mercury", manufacturer: "Mercury Dental Equipment", name, manufacturerRef, manufacturerRefs: manufacturerRef, model: name.replace(/^.*?Mercury\s*/iu, "").trim(), variantCount: 1, variants: manufacturerRef ? [{ manufacturerRef, specifications: specs }] : [], categoryPath: categoryNames[categorySlug] || categorySlug, description: decode(html.match(/<div id=["']tab1["'][^>]*>([\s\S]*?)<\/div>\s*<div id=["']tab2/iu)?.[1]).slice(0, 7000), specifications: specs, sourceImageUrl: imageUrls[0] || "", imageUrls: imageUrls.join(" | "), imageCount: imageUrls.length, sourcePageUrl, kzEvidence: "BRAND_OBSERVED_AT_KAZAKHSTAN_RETAILER", status: !imageUrls.length ? "PHOTO_REQUIRED" : manufacturerRef ? "KZ_SKU_EVIDENCE_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const skipped = crawled.filter((record) => record?.skipped);
const products = [...new Map(crawled.filter((record) => record && !record.error && !record.skipped).map((product) => [product.manufacturerRef || product.officialProductId, product])).values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
const report = { brand: "Mercury", manufacturer: "Mercury Dental Equipment", sourceType: "OFFICIAL_CURRENT_BRAND_PRODUCT_SITEMAP", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { completeCurrentProductSitemapTraversed: true, exactBrandArticlesPreserved: true, exactOfficialProductImagesOnly: true, categoryPagesExcluded: true, kzAvailabilityRequiresSupplierEvidence: true, missingProductsRetainedForReview: true }, totals: { sitemapUrls: allUrls.length, candidateProducts: detailUrls.length, discoveredProducts: products.length, productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateReferencesCollapsed: crawled.filter((record) => record && !record.error && !record.skipped).length - products.length, skippedPages: skipped.length, crawlErrors: errors.length }, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
