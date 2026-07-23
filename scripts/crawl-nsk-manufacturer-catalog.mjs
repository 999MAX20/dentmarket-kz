import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.japan.nsk-dental.com/sitemap.xml";
const baseUrl = "https://www.japan.nsk-dental.com";
const jsonOutputPath = path.resolve("data/catalog-evidence/nsk-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/nsk-manufacturer-catalog-queue.csv");
const clean = (value) => String(value ?? "").replace(/<[^>]*>/gu, " ").replaceAll("&amp;", "&").replaceAll("&nbsp;", " ").replace(/\s+/gu, " ").trim();
const absolute = (value) => value ? new URL(value, baseUrl).href : "";
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const fetchText = async (url) => { const response = await fetch(url, { headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" } }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.text(); };

const xml = await fetchText(sitemapUrl);
const allProductUrls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((entry) => clean(entry[1])).filter((url) => url.startsWith(`${baseUrl}/products/`) && !/\.pdf(?:$|\?)/iu.test(url));
const categoryUrls = new Set(["turbines", "contra-angles", "clinical-micromotors", "mobile-dentistry", "oral-hygiene", "endodontics", "surgical", "dental-laboratory", "hygiene_and_maintenance"].map((slug) => `${baseUrl}/products/${slug}/`));
categoryUrls.add(`${baseUrl}/products/`);
const urls = [...new Set(allProductUrls.filter((url) => !categoryUrls.has(url)))];
const products = [];
const skipped = [];
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < urls.length) {
    const sourcePageUrl = urls[cursor++];
    try {
      const html = await fetchText(sourcePageUrl);
      const name = clean(html.match(/<h1[^>]*class="titleCategory"[^>]*>([\s\S]*?)<\/h1>/u)?.[1] || html.match(/<title>([^<]+)/u)?.[1]?.split("｜")[0]);
      if (!name) { skipped.push({ sourcePageUrl, reason: "NO_PRODUCT_TITLE" }); continue; }
      const variantMatches = [...html.matchAll(/<span class="note">製品名:<\/span><span>([\s\S]*?)<\/span>[\s\S]{0,700}?<span class="note">製品番号:<\/span><span>([\s\S]*?)<\/span>/gu)];
      const seenRefs = new Set();
      const variants = variantMatches.map((entry) => ({ variantLabel: clean(entry[1]), manufacturerRef: clean(entry[2]), status: "REFERENCE_CONFIRMED" })).filter((variant) => variant.variantLabel && variant.manufacturerRef && !seenRefs.has(variant.manufacturerRef) && seenRefs.add(variant.manufacturerRef));
      const sourceImagePath = html.match(/<p class="img-product"><img[^>]+src="([^"]+)"/u)?.[1]
        || html.match(/<meta property="og:image" content="([^"]+)"/u)?.[1];
      const sourceImageUrl = absolute(sourceImagePath);
      const category = sourcePageUrl.split("/products/")[1]?.split("/")[0] ?? "products";
      products.push({ officialProductId: `NSK-${sourcePageUrl.split("/").filter(Boolean).at(-1).toUpperCase()}`, brand: "NSK", manufacturer: "Nakanishi Inc.", name, manufacturerRef: variants[0]?.manufacturerRef ?? "", manufacturerRefs: variants.map((variant) => variant.manufacturerRef).join(" | "), model: name, variantCount: Math.max(1, variants.length), variants: variants.length ? variants : [{ variantLabel: name, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }], categoryPath: `NSK / ${category}`, description: "Семейство и варианты подтверждены текущей официальной страницей NSK. Выбор конкретного исполнения выполняется по названию модели и заводскому номеру.", sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, additionalSourceUrls: sitemapUrl, kzEvidence: "BRAND_AND_SELECTED_MODELS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED", status: !sourceImageUrl ? "PHOTO_REQUIRED" : !variants.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED" });
    } catch (error) {
      const message = String(error?.message ?? error);
      if (message.startsWith("404 ")) skipped.push({ sourcePageUrl, reason: "STALE_SITEMAP_URL_404" });
      else errors.push({ sourcePageUrl, error: message });
    }
  }
};
await Promise.all(Array.from({ length: 8 }, () => worker()));
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const occurrencesByRef = new Map(); for (const product of products) for (const variant of product.variants) if (variant.manufacturerRef) { const occurrences = occurrencesByRef.get(variant.manufacturerRef) ?? []; occurrences.push({ product, variant }); occurrencesByRef.set(variant.manufacturerRef, occurrences); }
const consolidatedDuplicateRefs = []; for (const [ref, occurrences] of occurrencesByRef) { if (occurrences.length < 2) continue; consolidatedDuplicateRefs.push(ref); occurrences.sort((a, b) => { const score = ({ product, variant }) => clean(variant.variantLabel).toLocaleLowerCase("en").split(/[^a-z0-9]+/u).filter((token) => token.length >= 3 && clean(product.name).toLocaleLowerCase("en").includes(token)).length; return score(b) - score(a) || a.product.name.localeCompare(b.product.name, "en"); }); for (const occurrence of occurrences.slice(1)) occurrence.product.variants = occurrence.product.variants.filter((variant) => variant !== occurrence.variant); }
for (const product of products) { if (!product.variants.length) product.variants = [{ variantLabel: product.name, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }]; product.variantCount = product.variants.length; product.manufacturerRef = product.variants.find((variant) => variant.manufacturerRef)?.manufacturerRef ?? ""; product.manufacturerRefs = product.variants.map((variant) => variant.manufacturerRef).filter(Boolean).join(" | "); }
const report = { brand: "NSK", manufacturer: "Nakanishi Inc.", sourceType: "CURRENT_OFFICIAL_JAPAN_PRODUCT_SITEMAP_AND_MODEL_TABLES", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { allCurrentProductFamilyPagesCollected: true, exactOfficialModelNumbersPreserved: true, exactFamilyPhotoRequired: true, duplicateReferencesConsolidatedToOneCanonicalFamily: true, missingFieldsNeverDeleteCard: true }, totals: { sitemapProductPages: urls.length, discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: products.filter((product) => product.manufacturerRefs).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateReferencesAcrossProducts: 0, consolidatedDuplicateReferences: consolidatedDuplicateRefs.length, skippedPages: skipped.length, crawlErrors: errors.length }, consolidatedDuplicateRefs, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
