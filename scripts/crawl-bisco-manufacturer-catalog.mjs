import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.bisco.com/xmlsitemap.php?type=products&page=1";
const jsonOutputPath = path.resolve("data/catalog-evidence/bisco-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/bisco-manufacturer-catalog-queue.csv");
const concurrency = 8;

const clean = (value) => String(value ?? "")
  .replace(/<[^>]*>/gu, " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#x27;", "'")
  .replaceAll("&trade;", "™")
  .replaceAll("&reg;", "®")
  .replaceAll("&nbsp;", " ")
  .replace(/\s+/gu, " ")
  .trim();
const match = (html, expression) => clean(html.match(expression)?.[1] ?? "");
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const fetchText = async (url) => {
  const response = await fetch(url, { headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" }, redirect: "follow" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
};

const sitemap = await fetchText(sitemapUrl);
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((entry) => clean(entry[1]));
const products = [];
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < urls.length) {
    const sourcePageUrl = urls[cursor++];
    try {
      const html = await fetchText(sourcePageUrl);
      const name = match(html, /<h1[^>]*class="productView-title"[^>]*>([\s\S]*?)<\/h1>/u);
      const manufacturerRef = match(html, /<span[^>]*data-product-sku[^>]*>([\s\S]*?)<\/span>/u)
        || match(html, /"product_attributes"\s*:\s*\{\s*"sku"\s*:\s*"([^"]+)"/u);
      const sourceImageUrl = match(html, /<meta\s+property="og:image"\s+content="([^"]+)"/u);
      const breadcrumbNames = [...html.matchAll(/<li[^>]*class="breadcrumb[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/gu)].map((entry) => clean(entry[1])).filter(Boolean);
      if (!name) throw new Error("product title not found");
      products.push({
        officialProductId: `BISCO-${manufacturerRef || sourcePageUrl.split("/").filter(Boolean).at(-1).toUpperCase()}`,
        brand: "BISCO",
        manufacturer: "BISCO, Inc.",
        name,
        manufacturerRef,
        manufacturerRefs: manufacturerRef,
        model: "",
        variantCount: 1,
        variants: [{ variantLabel: name, manufacturerRef, status: manufacturerRef ? "REFERENCE_CONFIRMED" : "MANUFACTURER_REFERENCE_REQUIRED" }],
        categoryPath: breadcrumbNames.slice(1, -1).join(" / ") || "Стоматологические материалы",
        description: "Текущая товарная позиция подтверждена официальным каталогом BISCO. Варианты фасовки и оттенка сопоставляются по заводскому артикулу.",
        sourceImageUrl,
        imageUrls: sourceImageUrl,
        imageCount: sourceImageUrl ? 1 : 0,
        sourcePageUrl,
        additionalSourceUrls: sitemapUrl,
        kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED",
        status: !sourceImageUrl ? "PHOTO_REQUIRED" : !manufacturerRef ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED",
      });
    } catch (error) {
      errors.push({ sourcePageUrl, error: String(error?.message ?? error) });
    }
  }
};
await Promise.all(Array.from({ length: concurrency }, () => worker()));
products.sort((a, b) => a.name.localeCompare(b.name, "en"));

const refCounts = new Map();
for (const product of products) if (product.manufacturerRef) refCounts.set(product.manufacturerRef, (refCounts.get(product.manufacturerRef) ?? 0) + 1);
const duplicateReferenceProducts = products.filter((product) => product.manufacturerRef && refCounts.get(product.manufacturerRef) > 1);
const report = {
  brand: "BISCO",
  manufacturer: "BISCO, Inc.",
  sourceType: "CURRENT_OFFICIAL_PRODUCT_SITEMAP_AND_PRODUCT_PAGES",
  sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { allCurrentSitemapProductsCollected: true, exactOfficialProductPhotoRequired: true, exactManufacturerSkuPreserved: true, brandLevelKzPresenceDoesNotAuthorizeAutomaticSkuPublication: true, missingFieldsNeverDeleteCard: true },
  totals: {
    sitemapProducts: urls.length,
    discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: products.filter((product) => product.manufacturerRef).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    duplicateReferenceProducts: duplicateReferenceProducts.length,
    crawlErrors: errors.length,
  },
  errors,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
