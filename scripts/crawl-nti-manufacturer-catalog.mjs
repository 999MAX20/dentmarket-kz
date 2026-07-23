import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://www.nti.de";
const sitemapUrl = `${origin}/userdata/sitemaps/sitemap-items-catalog-en.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/nti-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/nti-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(35_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(12, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const sitemap = await requestText(sitemapUrl);
const detailUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])).filter((url) => /^https:\/\/www\.nti\.de\/en\/.+-p\d+\/$/u.test(url)))];
const crawled = await pool(detailUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const headingHtml = html.match(/<h1 class=["']itemcardHeadline["']>([\s\S]*?)<\/h1>/iu)?.[1] ?? "";
  const heading = decode(headingHtml);
  const analyticsScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
  const mainAnalytics = analyticsScripts.find((script) => /event:\s*["']view_item["']/iu.test(script) && !/item_list_name/iu.test(script)) ?? "";
  const catalogAnalytics = analyticsScripts.filter((script) => /item_list_name:\s*["']Catalog["']/iu.test(script)).join("\n");
  const refs = [...new Set([...mainAnalytics.matchAll(/item_id:\s*["']([^"']+)["']/giu), ...catalogAnalytics.matchAll(/item_id:\s*["']([^"']+)["']/giu)].map((match) => decode(match[1])).filter(Boolean))];
  const primaryRef = decode(headingHtml.match(/<strong>([\s\S]*?)<\/strong>/iu)?.[1]) || refs[0] || "";
  const name = decode(headingHtml.replace(/<strong>[\s\S]*?<\/strong>/iu, "")) || heading.replace(primaryRef, "").trim();
  const rawImages = [...new Set([...html.matchAll(/class=["']itemcardImages__item["'][^>]*data-original=["']([^"']+)/giu)].map((match) => match[1]))];
  const imageUrls = rawImages.map((value) => new URL(value, sourcePageUrl).href);
  const categoryPath = decode(html.match(/<a class=["']breadcrumbBackbutton["'][^>]*>([\s\S]*?)<\/a>/iu)?.[1]?.replace(/Back to article overview/iu, "")) || decode(html.match(/item_category:\s*["']([^"']+)/iu)?.[1]);
  if (!name || refs.length === 0) return { sourcePageUrl, skipped: "PRODUCT_IDENTITY_OR_REFERENCES_MISSING" };
  return {
    officialProductId: `NTI-${primaryRef || refs[0]}`,
    brand: "NTI",
    manufacturer: "NTI-Kahla GmbH",
    name,
    manufacturerRef: primaryRef || refs[0],
    manufacturerRefs: refs.join(" | "),
    model: primaryRef || refs[0],
    variantCount: refs.length,
    variants: refs.map((manufacturerRef) => ({ manufacturerRef })),
    categoryPath,
    description: decode(html.match(/<meta name=["']description["'] content=["']([^"']*)/iu)?.[1]),
    sourceImageUrl: imageUrls[0] || "",
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl,
    kzEvidence: "BRAND_OBSERVED_AT_KAZAKHSTAN_DISTRIBUTOR",
    status: imageUrls.length ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED",
  };
});
const errors = crawled.filter((record) => record?.error);
const skipped = crawled.filter((record) => record?.skipped);
const products = crawled.filter((record) => record && !record.error && !record.skipped).sort((a, b) => a.name.localeCompare(b.name, "en"));
const duplicateRefs = new Map();
for (const product of products) for (const ref of product.variants.map((variant) => variant.manufacturerRef)) { const records = duplicateRefs.get(ref) ?? []; records.push(product.sourcePageUrl); duplicateRefs.set(ref, records); }
const duplicateReferenceConflicts = [...duplicateRefs.entries()].filter(([, urls]) => new Set(urls).size > 1).map(([manufacturerRef, urls]) => ({ manufacturerRef, sourcePageUrls: [...new Set(urls)] }));
const report = { brand: "NTI", manufacturer: "NTI-Kahla GmbH", sourceType: "OFFICIAL_CURRENT_MANUFACTURER_ITEM_SITEMAP", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { completeCurrentEnglishItemSitemapTraversed: true, actualManufacturerItemIdsPreservedAsVariants: true, noCartesianVariantExpansion: true, exactOfficialFamilyImagesOnly: true, kzAvailabilityRequiresSupplierEvidence: true, missingImagesRetainedForReview: true }, totals: { sitemapProducts: detailUrls.length, discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateReferenceConflicts: duplicateReferenceConflicts.length, skippedPages: skipped.length, crawlErrors: errors.length }, duplicateReferenceConflicts, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
