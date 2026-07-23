import fs from "node:fs/promises";
import path from "node:path";

const apiBase = "https://falconmedical.pl/wp-json/wc/store/v1/products";
const sourceUrl = "https://falconmedical.pl/en/product-category/dental/";
const jsonOutputPath = path.resolve("data/catalog-evidence/falcon-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/falcon-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestPage(page) { const url = `${apiBase}?category=53&per_page=100&page=${page}`; const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(45_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return { products: await response.json(), total: Number(response.headers.get("x-wp-total") || 0), totalPages: Number(response.headers.get("x-wp-totalpages") || 0) }; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(10, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { page: items[index], error: String(error) }; } } })); return output; }
const excludedCategories = /Dental Materials|Cleaning and disinfection|Disposable products|Oral hygiene|Clinic accessories|Teaching aids|Promotional items/i;
const thirdPartyNames = /DiaDent|Pastelli|Wojdak|Eisenbacher|BISICO|ProNext|ProOne|Reciproc|W\+ /iu;
const falconSku = /^[A-Z]{1,4}\.[A-Z0-9]{2,5}\.[A-Z0-9]{2,6}(?:[-/A-Z0-9.]*)?$/u;

const first = await requestPage(1);
const pages = await pool(Array.from({ length: first.totalPages - 1 }, (_, index) => index + 2), requestPage);
const errors = pages.filter((page) => page?.error);
const all = [...first.products, ...pages.filter((page) => !page.error).flatMap((page) => page.products)];
const candidates = all.filter((product) => falconSku.test(decode(product.sku)) && !thirdPartyNames.test(decode(product.name)) && !product.categories.some((category) => excludedCategories.test(category.name)));
const keyCounts = new Map();
for (const product of candidates) keyCounts.set(decode(product.sku), (keyCounts.get(decode(product.sku)) ?? 0) + 1);
const products = candidates.map((product) => {
  const manufacturerRef = decode(product.sku);
  const categoryPath = product.categories.filter((category) => category.slug !== "dental").map((category) => category.name).reverse().join(" / ");
  const sourceImageUrl = product.images?.[0]?.src ?? "";
  const duplicateSuffix = (keyCounts.get(manufacturerRef) ?? 0) > 1 ? `-${token(product.name)}` : "";
  return { officialProductId: `FALCON-${token(manufacturerRef)}${duplicateSuffix}`, brand: "Falcon", manufacturer: "Falcon Medical Polska Sp. z o.o.", name: decode(product.name), manufacturerRef, manufacturerRefs: manufacturerRef, model: "", variantCount: 1, variants: [], categoryPath, description: decode(product.short_description || product.description), sourceImageUrl, imageUrls: (product.images ?? []).map((image) => image.src).join(" | "), imageCount: product.images?.length ?? 0, sourcePageUrl: product.permalink, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: sourceImageUrl ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED" };
}).sort((a, b) => a.manufacturerRef.localeCompare(b.manufacturerRef, "en"));
const duplicateManufacturerRefs = [...keyCounts].filter(([, count]) => count > 1).map(([manufacturerRef, count]) => ({ manufacturerRef, count }));
const report = { brand: "Falcon", manufacturer: "Falcon Medical Polska Sp. z o.o.", sourceType: "OFFICIAL_CURRENT_WOOCOMMERCE_DENTAL_INSTRUMENT_CATALOG", sourceUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { entireDentalStoreTraversed: true, falconInstrumentCodePatternRequired: true, knownThirdPartyBrandsExcluded: true, resellerOnlyMaterialAndDisposableCategoriesExcluded: true, exactOfficialProductImagesOnly: true, duplicateCodesRetainedAndFlagged: true }, totals: { officialDentalStoreProducts: first.total, apiPages: first.totalPages, filteredFalconProducts: products.length, variantSkus: products.length, productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateManufacturerRefs: duplicateManufacturerRefs.length, crawlErrors: errors.length }, duplicateManufacturerRefs, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
