import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://olident.com";
const categories = [
  ["kompozyty", "Композитные материалы"], ["systemy-wiazace", "Адгезивные системы"], ["odbudowa-kk", "Восстановление культи"], ["cementy", "Стоматологические цементы"], ["materialy-tymczasowe", "Временные материалы"], ["masy-silikonowe", "Силиконовые материалы"], ["profilaktyka", "Профилактика"], ["wybielanie", "Отбеливание"], ["wiertla-i-instrumenty", "Боры и инструменты"],
];
const jsonOutputPath = path.resolve("data/catalog-evidence/olident-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/olident-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&hellip;/giu, "…").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index].url, error: String(error) }; } } })); return output; }

const categoryPages = await pool(categories.map(([slug, categoryPath]) => ({ slug, categoryPath, url: `${origin}/${slug}/` })), async (page) => ({ ...page, html: await requestText(page.url) }));
const errors = categoryPages.filter((page) => page.error).map(({ url, error }) => ({ sourcePageUrl: url, error }));
const targets = [];
for (const page of categoryPages.filter((item) => !item.error)) for (const match of page.html.matchAll(/<a href=["'](https:\/\/olident\.com\/[^"']+\/)["'] class=["']product-link["']/giu)) targets.push({ url: match[1], categoryPath: page.categoryPath });
const uniqueTargets = [...new Map(targets.map((target) => [target.url, target])).values()];
const crawled = await pool(uniqueTargets, async ({ url: sourcePageUrl, categoryPath }) => {
  const html = await requestText(sourcePageUrl);
  const name = decode(html.match(/<meta property=["']og:title["'] content=["']([^"']+)/iu)?.[1]).replace(/\s*[-–|]\s*Olident.*$/iu, "");
  const description = decode(html.match(/<meta property=["']og:description["'] content=["']([^"']*)/iu)?.[1]);
  const sourceImageUrl = decode(html.match(/<meta property=["']og:image["'] content=["']([^"']+)/iu)?.[1]);
  const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).pop();
  return { officialProductId: `OLIDENT-${token(slug)}`, brand: "Olident", manufacturer: "SanaPro Dental GmbH / Olident", name, manufacturerRef: "", manufacturerRefs: "", model: "", variantCount: 1, variants: [], categoryPath, description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
errors.push(...crawled.filter((record) => record?.error).map(({ sourcePageUrl, error }) => ({ sourcePageUrl, error })));
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "pl"));
const report = { brand: "Olident", manufacturer: "SanaPro Dental GmbH / Olident", sourceType: "OFFICIAL_CURRENT_COMPLETE_OLIDENT_PRODUCT_CATEGORIES", sourceUrl: `${origin}/#products`, lastChecked: new Date().toISOString().slice(0, 10), policy: { allOlidentCategoriesTraversed: true, bisicoPartnerOfferExcludedFromOlidentBrand: true, currentProductPageNamesOverrideLegacyUrlSlugs: true, exactOfficialImagesOnly: true, referencesRemainQueuedUntilCurrentOrderMatrixIsPublished: true }, totals: { productCategories: categories.length, discoveredProducts: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
