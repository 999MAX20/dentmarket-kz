import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.ultradent.com/sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/ultradent-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/ultradent-manufacturer-catalog-queue.csv");
const clean = (value) => String(value ?? "").replace(/<[^>]*>/gu, " ").replaceAll("&#x2122;", "™").replaceAll("&amp;", "&").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const fetchText = async (url) => { const response = await fetch(url, { headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" } }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.text(); };

const xml = await fetchText(sitemapUrl);
const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((entry) => clean(entry[1])).filter((url) => url.includes("/products/categories/")))];
const products = [];
const skipped = [];
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < urls.length) {
    const sourcePageUrl = urls[cursor++];
    try {
      const html = await fetchText(sourcePageUrl);
      const serialized = html.match(/window\.upi\.apps\.productpage\.ProductModel\s*=\s*([\s\S]*?);<\/script>/u)?.[1];
      if (!serialized) { skipped.push({ sourcePageUrl, reason: "OFFICIAL_CATEGORY_OR_MARKETING_PAGE_WITHOUT_ORDER_MODEL" }); continue; }
      const model = JSON.parse(serialized);
      const name = clean(model.name);
      if (!name || !Array.isArray(model.skus)) { skipped.push({ sourcePageUrl, reason: "NO_PRODUCT_FAMILY_OR_SKUS" }); continue; }
      const optionNames = new Map((model.optionDetails ?? []).map((option) => [String(option.id), clean(option.longName || option.shortName)]));
      const seenRefs = new Set();
      const variants = model.skus.map((sku) => {
        const manufacturerRef = clean(sku.id).replace(/-US$/u, "");
        const choices = Object.values(sku.options ?? {}).map((id) => optionNames.get(String(id))).filter(Boolean);
        const variantLabel = [clean(sku.itemLongName || sku.itemName || name), ...choices, clean(sku.unitSize)].filter(Boolean).join(" · ");
        const sourceImageUrl = clean(sku.images?.find((image) => image.src)?.src);
        return { variantLabel, manufacturerRef, sourceImageUrl, isOrderable: Boolean(sku.isOrderable || sku.isWebOrderable), status: "REFERENCE_CONFIRMED" };
      }).filter((variant) => variant.manufacturerRef && !seenRefs.has(variant.manufacturerRef) && seenRefs.add(variant.manufacturerRef));
      const sourceImageUrl = clean(model.images?.find((image) => image.src)?.src || variants.find((variant) => variant.sourceImageUrl)?.sourceImageUrl);
      const categoryParts = sourcePageUrl.split("/products/categories/")[1]?.split("/").slice(0, -1) ?? [];
      products.push({ officialProductId: `ULTRADENT-${model.id || sourcePageUrl.split("/").filter(Boolean).at(-1).toUpperCase()}`, brand: "Ultradent", manufacturer: "Ultradent Products, Inc.", name, manufacturerRef: variants[0]?.manufacturerRef ?? "", manufacturerRefs: variants.map((variant) => variant.manufacturerRef).join(" | "), model: name, variantCount: Math.max(1, variants.length), variants: variants.length ? variants : [{ variantLabel: name, manufacturerRef: "", sourceImageUrl: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }], categoryPath: `Ultradent / ${categoryParts.join(" / ")}`, description: "Семейство, варианты, фасовки и коды подтверждены текущей официальной моделью заказа Ultradent.", sourceImageUrl, imageUrls: [...new Set(variants.map((variant) => variant.sourceImageUrl).filter(Boolean))].join(" | ") || sourceImageUrl, imageCount: new Set(variants.map((variant) => variant.sourceImageUrl).filter(Boolean)).size || (sourceImageUrl ? 1 : 0), sourcePageUrl, additionalSourceUrls: sitemapUrl, kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED", status: !sourceImageUrl ? "PHOTO_REQUIRED" : !variants.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED" });
    } catch (error) { errors.push({ sourcePageUrl, error: String(error?.message ?? error) }); }
  }
};
await Promise.all(Array.from({ length: 14 }, () => worker()));
const productsById = new Map();
for (const product of products) {
  const existing = productsById.get(product.officialProductId);
  if (!existing) {
    productsById.set(product.officialProductId, product);
    continue;
  }
  existing.categoryPath = [...new Set(`${existing.categoryPath} | ${product.categoryPath}`.split(" | "))].join(" | ");
  existing.additionalSourceUrls = [...new Set(`${existing.additionalSourceUrls} | ${product.sourcePageUrl}`.split(" | "))].join(" | ");
  if (product.sourcePageUrl.length < existing.sourcePageUrl.length) existing.sourcePageUrl = product.sourcePageUrl;
}
products.length = 0;
products.push(...productsById.values());
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const allRefs = products.flatMap((product) => product.variants.map((variant) => variant.manufacturerRef).filter(Boolean));
const duplicateReferences = [...new Set(allRefs.filter((ref, index) => allRefs.indexOf(ref) !== index))];
const report = { brand: "Ultradent", manufacturer: "Ultradent Products, Inc.", sourceType: "CURRENT_OFFICIAL_PRODUCT_SITEMAP_AND_EMBEDDED_ORDER_MODELS", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { everyOfficialCategoryUrlCheckedForOrderModel: true, repeatedCategoryUrlsCollapsedByOfficialProductModelId: true, exactOfficialSkuIdsAndImagesPreserved: true, optionNamesExpandedIntoVariantLabels: true, duplicateReferencesAudited: true, missingFieldsNeverDeleteCard: true }, totals: { sitemapCategoryUrls: urls.length, uniqueOfficialProductModels: products.length, discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), orderableVariantSkus: products.flatMap((product) => product.variants).filter((variant) => variant.isOrderable).length, productsWithReferences: products.filter((product) => product.manufacturerRefs).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateReferences: duplicateReferences.length, skippedPages: skipped.length, crawlErrors: errors.length }, duplicateReferences, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
