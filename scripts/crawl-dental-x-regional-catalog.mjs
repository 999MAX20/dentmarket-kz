import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://dentalx.ru/sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/dental-x-regional-catalog.json");
const queueOutputPath = path.resolve("data/curation/dental-x-regional-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "curl/8.7.1" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }
const categoryNames = {
  "avtoklavy-meditsinskie": "Автоклавы",
  "upakovochnye-mashiny": "Термозапечатывающие устройства",
  demineralizatory: "Деминерализаторы",
  "apparat-dlya-stikerov": "Маркировка стерилизации",
  steritesty: "Контроль стерилизации",
  "universalnye-podnosy-mx180": "Стерилизационные принадлежности",
  "stomatologicheskie-stulya": "Стулья врача",
  "rulony-dlya-sterilizatsii-steriline": "Рулоны для стерилизации",
  "protokolirovanie-i-podklyuchenie-k-pk": "Прослеживаемость стерилизации",
};

const sitemap = await requestText(sitemapUrl);
const allUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))];
const shopUrls = allUrls.filter((url) => /^https:\/\/dentalx\.ru\/shop\/[^/]+\/[^/]+\/$/u.test(url));
const crawled = await pool(shopUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
  let product;
  let webpage;
  for (const source of scripts) {
    const data = JSON.parse(source);
    const nodes = data?.["@graph"] ?? [data];
    product ??= nodes.find((node) => node?.["@type"] === "Product");
    webpage ??= nodes.find((node) => node?.["@type"] === "WebPage");
  }
  if (!product) return { sourcePageUrl, skipped: "NO_PRODUCT_SCHEMA" };
  const regionalCatalogSku = decode(product.sku);
  const imageUrls = [...new Set([product.image, product.offers?.image, ...[...html.matchAll(/data-smink-gallery-src=["']([^"']+)/giu)].map((match) => new URL(match[1], sourcePageUrl).href)].filter(Boolean))];
  const attributes = {};
  for (const match of html.matchAll(/<p class=["']p-name["']>([\s\S]*?)<\/p>[\s\S]*?<span class=["']p-value["']>([\s\S]*?)<\/span>/giu)) attributes[decode(match[1])] = decode(match[2]);
  const descriptionBlock = html.match(/<div class=["'][^"']*__js_text-block[^"']*["'][^>]*data-text-block=["']2["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1];
  const categorySlug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean)[1];
  return {
    officialProductId: `DENTAL-X-REGIONAL-${regionalCatalogSku || token(product.name)}`,
    brand: "Dental X",
    manufacturer: "Dental X / NSK Dental Italy S.r.l.",
    name: decode(product.name),
    manufacturerRef: "",
    manufacturerRefs: "",
    regionalCatalogSku,
    supplierRefs: regionalCatalogSku,
    variantCount: 1,
    variants: [],
    categoryPath: categoryNames[categorySlug] ?? decode(categorySlug),
    attributes,
    description: decode(descriptionBlock || product.description),
    sourceImageUrl: imageUrls[0] ?? "",
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl,
    sourceModifiedAt: webpage?.dateModified ?? "",
    kzEvidence: "REGIONAL_BRAND_CATALOG_WITH_KAZAKHSTAN_CONTACT",
    status: imageUrls.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
  };
});
const errors = crawled.filter((record) => record?.error);
const skipped = crawled.filter((record) => record?.skipped);
const products = crawled.filter((record) => record && !record.error && !record.skipped).sort((a, b) => a.name.localeCompare(b.name, "ru"));
const regionalSkuCounts = new Map();
for (const product of products) if (product.regionalCatalogSku) regionalSkuCounts.set(product.regionalCatalogSku, (regionalSkuCounts.get(product.regionalCatalogSku) ?? 0) + 1);
const duplicateRegionalSkus = [...regionalSkuCounts].filter(([, count]) => count > 1).map(([sku]) => sku);
const report = {
  brand: "Dental X",
  manufacturer: "Dental X / NSK Dental Italy S.r.l.",
  sourceType: "REGIONAL_BRAND_CATALOG_WITH_KAZAKHSTAN_CONTACT_AND_LEGACY_PORTFOLIO",
  sourceUrl: sitemapUrl,
  currentBrandSuccessorUrl: "https://dxp-sterilization.com/en/products/",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { regionalCatalogSkuIsNotAssumedToBeManufacturerReference: true, legacyDentalXCardsAreNotAutoMergedIntoDxp: true, exactRegionalProductImagesAcceptedAsIdentityEvidence: true },
  totals: { sitemapUrls: allUrls.length, candidateProductUrls: shopUrls.length, discoveredProducts: products.length, regionalCatalogSkus: products.filter((product) => product.regionalCatalogSku).length, duplicateRegionalSkus: duplicateRegionalSkus.length, productsWithImages: products.filter((product) => product.imageCount > 0).length, skippedPages: skipped.length, crawlErrors: errors.length },
  duplicateRegionalSkus,
  skipped,
  errors,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "regionalCatalogSku", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "sourceModifiedAt", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
