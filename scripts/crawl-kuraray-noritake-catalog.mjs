import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.kuraraynoritake.eu/sitemaps/sitemap_en.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/kuraray-noritake-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/kuraray-noritake-manufacturer-catalog-queue.csv");
const clean = (value) => String(value ?? "").replace(/<[^>]*>/gu, " ").replaceAll("&amp;", "&").replaceAll("&#x20;", " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const fetchText = async (url) => { const response = await fetch(url, { headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" } }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.text(); };
const absoluteUrl = (value, base) => { try { return new URL(value, base).href; } catch { return ""; } };

const sitemap = await fetchText(sitemapUrl);
const pageBlocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/gu)].map((match) => match[1]);
const parentPages = pageBlocks
  .filter((block) => /<image:loc>[^<]*\/media\/catalog\/product\//u.test(block))
  .map((block) => ({
    sourcePageUrl: clean(block.match(/<loc>([^<]+)<\/loc>/u)?.[1]),
    sitemapImageUrl: clean(block.match(/<image:loc>([^<]+)<\/image:loc>/u)?.[1]),
  }));
const products = [];
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < parentPages.length) {
    const { sourcePageUrl, sitemapImageUrl } = parentPages[cursor++];
    try {
      const html = await fetchText(sourcePageUrl);
      const parentName = clean(html.match(/<meta property="og:title" content="([^"]+)"/iu)?.[1]?.split("|")[0]);
      if (!parentName) throw new Error("family name not found");
      const description = clean(html.match(/<meta property="og:description" content="([^"]*)"/iu)?.[1]);
      const parentImage = absoluteUrl(html.match(/<meta property="og:image" content="([^"]+)"/iu)?.[1], sourcePageUrl);
      const variants = [];
      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/giu)) {
        try {
          const data = JSON.parse(match[1]);
          if (data?.["@type"] !== "Product" || !data.sku) continue;
          const manufacturerRef = clean(data.sku).replace(/^#/u, "");
          if (!manufacturerRef || variants.some((variant) => variant.manufacturerRef === manufacturerRef)) continue;
          variants.push({
            variantLabel: [clean(data.name), clean(data.description)].filter(Boolean).join(" · "),
            manufacturerRef,
            sourceImageUrl: absoluteUrl(data.image, sourcePageUrl),
            sourcePageUrl: absoluteUrl(data.offers?.url, sourcePageUrl) || sourcePageUrl,
            status: "OFFICIAL_REFERENCE_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED",
          });
        } catch {}
      }
      const id = sourcePageUrl.match(/\/id\/(\d+)$/u)?.[1];
      const sourceImageUrl = parentImage || sitemapImageUrl || variants.find((variant) => variant.sourceImageUrl)?.sourceImageUrl || "";
      products.push({
        officialProductId: `KURARAY-NORITAKE-${id}`,
        brand: "Kuraray Noritake",
        manufacturer: "Kuraray Noritake Dental Inc.",
        name: parentName,
        manufacturerRef: variants[0]?.manufacturerRef ?? "",
        manufacturerRefs: variants.map((variant) => variant.manufacturerRef).join(" | "),
        model: parentName,
        variantCount: Math.max(1, variants.length),
        variants: variants.length ? variants : [{ variantLabel: parentName, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }],
        categoryPath: "Kuraray Noritake / Dental products",
        description,
        sourceImageUrl,
        imageUrls: [...new Set([sourceImageUrl, ...variants.map((variant) => variant.sourceImageUrl)].filter(Boolean))].join(" | "),
        imageCount: sourceImageUrl ? 1 : 0,
        sourcePageUrl,
        additionalSourceUrls: sitemapUrl,
        kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED",
        status: !sourceImageUrl ? "PHOTO_REQUIRED" : variants.length ? "OFFICIAL_REFERENCE_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED",
      });
    } catch (error) { errors.push({ sourcePageUrl, error: String(error?.message ?? error) }); }
  }
};
await Promise.all(Array.from({ length: 8 }, () => worker()));
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const duplicateOwnership = new Map();
for (const product of products) {
  for (const variant of product.variants.filter((item) => item.manufacturerRef)) {
    const occurrences = duplicateOwnership.get(variant.manufacturerRef) ?? [];
    occurrences.push({ product, variant });
    duplicateOwnership.set(variant.manufacturerRef, occurrences);
  }
}
const consolidatedRefs = [];
for (const [manufacturerRef, occurrences] of duplicateOwnership) {
  if (occurrences.length < 2) continue;
  const scored = occurrences.map((occurrence) => {
    const family = clean(occurrence.product.name).toLowerCase();
    const label = clean(occurrence.variant.variantLabel).toLowerCase();
    const significantTokens = family.split(/[^a-z0-9]+/u).filter((token) => token.length > 3 && !["composite", "accessories"].includes(token));
    const score = significantTokens.filter((token) => label.includes(token)).length * 10
      + (/accessor/iu.test(family) && /nozzle|accessor/iu.test(label) ? 5 : 0);
    return { ...occurrence, score };
  }).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name, "en"));
  const owner = scored[0];
  for (const duplicate of scored.slice(1)) duplicate.product.variants = duplicate.product.variants.filter((variant) => variant.manufacturerRef !== manufacturerRef);
  consolidatedRefs.push({ manufacturerRef, canonicalFamily: owner.product.name, removedFrom: scored.slice(1).map((entry) => entry.product.name) });
}
for (const product of products) {
  product.manufacturerRef = product.variants.find((variant) => variant.manufacturerRef)?.manufacturerRef ?? "";
  product.manufacturerRefs = product.variants.map((variant) => variant.manufacturerRef).filter(Boolean).join(" | ");
  product.variantCount = Math.max(1, product.variants.length);
}
const refs = products.flatMap((product) => product.variants.map((variant) => variant.manufacturerRef).filter(Boolean));
const duplicateRefs = [...new Set(refs.filter((ref, index) => refs.indexOf(ref) !== index))].sort();
const report = { brand: "Kuraray Noritake", manufacturer: "Kuraray Noritake Dental Inc.", sourceType: "CURRENT_OFFICIAL_ENGLISH_SITEMAP_AND_STRUCTURED_PRODUCT_DATA", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { allOfficialFamilyPagesCollected: true, exactOfficialVariantSkusCollected: true, duplicateReferencesConsolidatedToCanonicalFamily: true, exactOfficialImagesPreserved: true, noManufacturerReferenceInvented: true, missingFieldsNeverDeleteCard: true }, totals: { officialFamilyPages: parentPages.length, discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithImages: products.filter((product) => product.imageCount > 0).length, productsWithReferences: products.filter((product) => product.manufacturerRefs).length, exactReferences: refs.length, consolidatedDuplicateReferences: consolidatedRefs.length, duplicateReferencesAcrossProducts: duplicateRefs.length, crawlErrors: errors.length }, consolidatedRefs, duplicateRefs, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
