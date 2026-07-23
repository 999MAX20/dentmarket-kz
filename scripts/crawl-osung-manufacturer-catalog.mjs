import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://osungusa.com";
const jsonOutputPath = path.resolve("data/catalog-evidence/osung-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/osung-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const pages = [];
for (let page = 1; ; page += 1) {
  const url = `${baseUrl}/products.json?limit=250&page=${page}`;
  const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const payload = await response.json();
  const records = Array.isArray(payload.products) ? payload.products : [];
  if (!records.length) break;
  pages.push(records);
}
const sourceProducts = pages.flat().filter((product) => String(product.vendor ?? "").trim().toLowerCase() === "osung");
const rawProducts = sourceProducts.map((product) => {
  const variants = (product.variants ?? []).map((variant) => ({
    manufacturerRef: decode(variant.sku),
    label: decode(variant.title === "Default Title" ? product.title : variant.title),
    barcode: decode(variant.barcode),
    sourceVariantId: String(variant.id ?? ""),
  }));
  const manufacturerRefs = [...new Set(variants.map((variant) => variant.manufacturerRef).filter(Boolean))];
  const imageUrls = [...new Set((product.images ?? []).map((image) => image.src).filter(Boolean))];
  const stableId = manufacturerRefs[0] || product.handle || String(product.id);
  const categoryPath = [decode(product.product_type), ...(product.tags ?? []).map(decode).filter(Boolean).slice(0, 3)].filter(Boolean).join(" > ");
  return {
    officialProductId: `OSUNG-${stableId.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`,
    brand: "OSUNG MND", manufacturer: "OSUNG MND Co., Ltd.", name: decode(product.title),
    manufacturerRef: manufacturerRefs[0] ?? "", manufacturerRefs: manufacturerRefs.join(" | "), variantCount: variants.length,
    variants, categoryPath, description: decode(product.body_html), sourceImageUrl: imageUrls[0] ?? "", imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length, sourcePageUrl: `${baseUrl}/products/${product.handle}`, sourceProductId: String(product.id),
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: !imageUrls.length ? "PHOTO_REQUIRED" : !manufacturerRefs.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED",
  };
});
const grouped = Map.groupBy(rawProducts, (product) => product.manufacturerRef || product.officialProductId);
const products = [...grouped.values()].map((duplicates) => {
  if (duplicates.length === 1) return duplicates[0];
  const ranked = [...duplicates].sort((a, b) => {
    const aHasRefInName = a.name.toLowerCase().includes(a.manufacturerRef.toLowerCase()) ? 1 : 0;
    const bHasRefInName = b.name.toLowerCase().includes(b.manufacturerRef.toLowerCase()) ? 1 : 0;
    return bHasRefInName - aHasRefInName || b.description.length - a.description.length || b.imageCount - a.imageCount;
  });
  const primary = ranked[0];
  const allImages = [...new Set(duplicates.flatMap((product) => product.imageUrls.split(" | ").filter(Boolean)))];
  return { ...primary, sourceImageUrl: allImages[0] ?? "", imageUrls: allImages.join(" | "), imageCount: allImages.length,
    alternateSourcePageUrls: duplicates.map((product) => product.sourcePageUrl).filter((url) => url !== primary.sourcePageUrl) };
});
const report = { brand: "OSUNG MND", manufacturer: "OSUNG MND Co., Ltd.", sourceType: "OFFICIAL_US_BRAND_DISTRIBUTOR_STOREFRONT_API",
  sourceUrl: `${baseUrl}/collections/all-products-a-z`, lastChecked: new Date().toISOString().slice(0, 10), totals: { storefrontProducts: pages.flat().length,
    discoveredProducts: products.length, duplicateListingsMerged: rawProducts.length - products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: 0 }, errors: [], products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
