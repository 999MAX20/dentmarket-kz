import fs from "node:fs/promises";
import path from "node:path";

const sitemapPages = ["https://www.gc.dental/europe/sitemap.xml?page=1", "https://www.gc.dental/europe/sitemap.xml?page=2"];
const jsonOutputPath = path.resolve("data/catalog-evidence/gc-europe-catalog.json");
const queueOutputPath = path.resolve("data/curation/gc-europe-catalog-queue.csv");
const clean = (value) => String(value ?? "").replace(/<[^>]*>/gu, " ").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#039;", "'").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const fetchText = async (url) => { const response = await fetch(url, { headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" } }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.text(); };

const sitemaps = await Promise.all(sitemapPages.map(fetchText));
const urls = [...new Set(sitemaps.flatMap((xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((entry) => clean(entry[1]))).filter((url) => url.includes("/europe/en/products/")))];
const products = [];
const skipped = [];
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < urls.length) {
    const sourcePageUrl = urls[cursor++];
    try {
      const html = await fetchText(sourcePageUrl);
      if (/taken out of our assortment|no longer part of our product range|discontinued/iu.test(html)) {
        skipped.push({ sourcePageUrl, reason: "OFFICIAL_PAGE_MARKED_OUT_OF_ASSORTMENT" });
        continue;
      }
      const jsonLd = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)?.[1];
      const data = jsonLd ? JSON.parse(jsonLd) : null;
      const productNode = data?.["@graph"]?.find?.((entry) => entry?.["@type"] === "Product");
      const name = clean(productNode?.name || html.match(/<h1[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/u)?.[1]);
      const sourceImageUrl = clean(productNode?.image?.url || html.match(/<meta property="og:image" content="([^"]+)"/u)?.[1]);
      const description = clean(productNode?.description || html.match(/<meta name="description" content="([^"]+)"/u)?.[1]);
      if (!name) {
        skipped.push({ sourcePageUrl, reason: "OFFICIAL_PRODUCT_CATEGORY_LANDING_PAGE" });
        continue;
      }
      const slug = sourcePageUrl.split("/").filter(Boolean).at(-1);
      products.push({ officialProductId: `GC-${slug.toUpperCase()}`, brand: "GC", manufacturer: "GC Corporation", name, manufacturerRef: "", manufacturerRefs: "", model: "", variantCount: 1, variants: [{ variantLabel: name, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }], categoryPath: "GC Europe / Dental products", description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, additionalSourceUrls: sitemapPages.join(" | "), kzEvidence: "OFFICIAL_EUROPE_RANGE_AND_BRAND_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" });
    } catch (error) { errors.push({ sourcePageUrl, error: String(error?.message ?? error) }); }
  }
};
await Promise.all(Array.from({ length: 10 }, () => worker()));
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const report = { brand: "GC", manufacturer: "GC Corporation", sourceType: "CURRENT_OFFICIAL_GC_EUROPE_ENGLISH_PRODUCT_SITEMAP", sourceUrl: sitemapPages[0], lastChecked: new Date().toISOString().slice(0, 10), policy: { allEnglishProductPagesChecked: true, officiallyArchivedProductsExcludedAndRecorded: true, categoryLandingPagesExcludedAndRecorded: true, exactOfficialPhotosPreserved: true, noManufacturerReferenceInvented: true, missingFieldsNeverDeleteCard: true }, totals: { sitemapProductPages: urls.length, discoveredProducts: products.length, variantSkus: products.length, productsWithImages: products.filter((product) => product.imageCount > 0).length, productsWithReferences: 0, skippedArchivedProducts: skipped.filter((entry) => entry.reason === "OFFICIAL_PAGE_MARKED_OUT_OF_ASSORTMENT").length, skippedCategoryPages: skipped.filter((entry) => entry.reason === "OFFICIAL_PRODUCT_CATEGORY_LANDING_PAGE").length, crawlErrors: errors.length }, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
