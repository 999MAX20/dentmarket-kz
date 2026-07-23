import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.averon.ru/sitemap-iblock-12.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/averon-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/averon-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(12, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const sitemap = await requestText(sitemapUrl);
const catalogUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])).filter(Boolean))];
const crawled = await pool(catalogUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const schemas = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)].map((match) => match[1].trim());
  let product;
  for (const schema of schemas) {
    try { const parsed = JSON.parse(schema); const candidates = Array.isArray(parsed) ? parsed : parsed?.["@graph"] ?? [parsed]; product = candidates.find((candidate) => String(candidate?.["@type"]).toLocaleLowerCase("en") === "product"); if (product) break; } catch { /* Not every embedded schema block is valid JSON. */ }
  }
  if (!product?.name) return { sourcePageUrl, skipped: "CATEGORY_OR_INFORMATION_PAGE" };
  const manufacturerRef = decode(product.sku);
  const sourceImageUrl = Array.isArray(product.image) ? decode(product.image[0]) : decode(product.image);
  const categoryPath = [...html.matchAll(/itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/giu)].map((match) => decode(match[1])).filter(Boolean).join(" / ");
  return { officialProductId: manufacturerRef ? `AVERON-${token(manufacturerRef)}` : `AVERON-${token(new URL(sourcePageUrl).pathname)}`,
    brand: "Averon", manufacturer: "НПК АВЕРОН", name: decode(product.name), manufacturerRef, manufacturerRefs: manufacturerRef,
    variantCount: 1, variants: [], categoryPath, description: decode(product.description), sourceImageUrl,
    imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl,
    kzEvidence: "OFFICIAL_BRAND_SHOP_IN_ALMATY", status: sourceImageUrl && manufacturerRef ? "KZ_SKU_EVIDENCE_REQUIRED" : sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const skipped = crawled.filter((record) => record?.skipped).length;
const rawProducts = crawled.filter((record) => record && !record.error && !record.skipped);
const products = [...new Map(rawProducts.map((product) => [product.officialProductId, product])).values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
const duplicateRefs = [...new Set(rawProducts.map((product) => product.manufacturerRef).filter((ref, index, all) => ref && all.indexOf(ref) !== index))];
const report = { brand: "Averon", manufacturer: "НПК АВЕРОН", sourceType: "OFFICIAL_CURRENT_PRODUCT_SITEMAP_JSON_LD", sourceUrl: sitemapUrl,
  kzSourceUrl: "https://www.averon.ru/contact/shops/averon-almaty-kazakhstan/", lastChecked: new Date().toISOString().slice(0, 10),
  totals: { sitemapCatalogUrls: catalogUrls.length, categoryOrInformationPages: skipped, discoveredProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    duplicateManufacturerRefs: duplicateRefs.length, crawlErrors: errors.length }, duplicateRefs, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
