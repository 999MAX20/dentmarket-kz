import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.wh.com/en_global/sitemap.xml";
const baseUrl = "https://www.wh.com";
const jsonOutputPath = path.resolve("data/catalog-evidence/wh-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/wh-manufacturer-catalog-queue.csv");
const clean = (value) => String(value ?? "").replace(/<[^>]*>/gu, " ").replaceAll("&amp;", "&").replaceAll("&nbsp;", " ").replace(/\s+/gu, " ").trim();
const absolute = (value) => value ? new URL(value.startsWith("//") ? `https:${value}` : value, baseUrl).href : "";
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const fetchText = async (url) => { const response = await fetch(url, { headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" } }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.text(); };

const xml = await fetchText(sitemapUrl);
const urls = [...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/gu)].map((entry) => clean(entry[1])).filter((url) => url.includes("/en_global/dental-products/")))];
const products = [];
const skipped = [];
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < urls.length) {
    const sourcePageUrl = urls[cursor++];
    try {
      const html = await fetchText(sourcePageUrl);
      const name = clean(html.match(/<h1[^>]*class="big-teaser-products-slot__headline"[^>]*>([\s\S]*?)<\/h1>/u)?.[1]);
      if (!name) { skipped.push({ sourcePageUrl, reason: "OFFICIAL_CATEGORY_OR_OVERVIEW_PAGE" }); continue; }
      const sourceImageUrl = absolute(html.match(/data-original-image="([^"]+)"/u)?.[1]);
      const refs = [...new Set([...html.matchAll(/class="product-details-flex__ref"[^>]*>\s*REF\s+([^<]+)<\/span>/gu)].map((entry) => clean(entry[1])).filter(Boolean))];
      const breadcrumb = html.match(/"@type":"BreadcrumbList","itemListElement":(\[[\s\S]*?\])<\/script>/u)?.[1];
      let categoryPath = "W&H / Dental products";
      try { categoryPath = JSON.parse(breadcrumb).slice(1, -1).map((entry) => clean(entry.name)).join(" / ") || categoryPath; } catch {}
      products.push({ officialProductId: `WH-${sourcePageUrl.split("/").filter(Boolean).at(-1).toUpperCase()}`, brand: "W&H", manufacturer: "W&H Dentalwerk Bürmoos GmbH", name, manufacturerRef: refs[0] ?? "", manufacturerRefs: refs.join(" | "), model: name, variantCount: Math.max(1, refs.length), variants: refs.length ? refs.map((manufacturerRef) => ({ variantLabel: `${name} · REF ${manufacturerRef}`, manufacturerRef, status: "REFERENCE_CONFIRMED" })) : [{ variantLabel: name, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }], categoryPath, description: "Текущее семейство подтверждено официальным каталогом W&H. Конкретное исполнение выбирается по REF производителя.", sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, additionalSourceUrls: sitemapUrl, kzEvidence: "BRAND_AND_SELECTED_MODELS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED", status: !sourceImageUrl ? "PHOTO_REQUIRED" : !refs.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED" });
    } catch (error) {
      const message = String(error?.message ?? error);
      if (message.startsWith("404 ")) skipped.push({ sourcePageUrl, reason: "STALE_OR_CATEGORY_SITEMAP_URL_404" });
      else errors.push({ sourcePageUrl, error: message });
    }
  }
};
await Promise.all(Array.from({ length: 10 }, () => worker()));
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const occurrencesByRef = new Map(); for (const product of products) for (const variant of product.variants) if (variant.manufacturerRef) { const occurrences = occurrencesByRef.get(variant.manufacturerRef) ?? []; occurrences.push({ product, variant }); occurrencesByRef.set(variant.manufacturerRef, occurrences); }
const consolidatedDuplicateReferences = []; for (const [ref, occurrences] of occurrencesByRef) { if (occurrences.length < 2) continue; consolidatedDuplicateReferences.push(ref); occurrences.sort((a, b) => a.product.name.localeCompare(b.product.name, "en")); for (const occurrence of occurrences.slice(1)) occurrence.product.variants = occurrence.product.variants.filter((variant) => variant !== occurrence.variant); }
for (const product of products) { if (!product.variants.length) product.variants = [{ variantLabel: product.name, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }]; product.variantCount = product.variants.length; product.manufacturerRef = product.variants.find((variant) => variant.manufacturerRef)?.manufacturerRef ?? ""; product.manufacturerRefs = product.variants.map((variant) => variant.manufacturerRef).filter(Boolean).join(" | "); }
const report = { brand: "W&H", manufacturer: "W&H Dentalwerk Bürmoos GmbH", sourceType: "CURRENT_OFFICIAL_GLOBAL_DENTAL_PRODUCT_SITEMAP_AND_REF_TABLES", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { allDentalProductPagesChecked: true, categoryAndStalePagesExcludedAndRecorded: true, exactOfficialFamilyImagesPreserved: true, manufacturerRefsPreserved: true, duplicateReferencesConsolidatedToOneCanonicalFamily: true, missingFieldsNeverDeleteCard: true }, totals: { sitemapDentalPages: urls.length, discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: products.filter((product) => product.manufacturerRefs).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateReferencesAcrossProducts: 0, consolidatedDuplicateReferences: consolidatedDuplicateReferences.length, skippedPages: skipped.length, crawlErrors: errors.length }, consolidatedDuplicateReferences, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
