import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://eshop.bego.com";
const jsonOutputPath = path.resolve("data/catalog-evidence/bego-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/bego-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const pages = [];
for (let page = 1; ; page += 1) {
  const url = `${baseUrl}/products.json?limit=250&page=${page}`;
  const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const payload = await response.json(); const records = Array.isArray(payload.products) ? payload.products : [];
  if (!records.length) break; pages.push(records);
}
const sourceProducts = pages.flat();
const products = sourceProducts.map((product) => {
  const variants = (product.variants ?? []).map((variant) => ({ manufacturerRef: decode(variant.sku),
    label: decode(variant.title === "Default Title" ? product.title : variant.title), barcode: decode(variant.barcode), sourceVariantId: String(variant.id ?? "") }));
  const manufacturerRefs = [...new Set(variants.map((variant) => variant.manufacturerRef).filter(Boolean))];
  const images = [...new Set((product.images ?? []).map((image) => image.src).filter(Boolean))];
  const stableId = manufacturerRefs[0] || product.handle || String(product.id);
  return { officialProductId: `BEGO-${stableId.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`, brand: "BEGO",
    manufacturer: "BEGO GmbH & Co. KG", name: decode(product.title), manufacturerRef: manufacturerRefs[0] ?? "",
    manufacturerRefs: manufacturerRefs.join(" | "), variantCount: variants.length, variants,
    categoryPath: product.product_type === "IMP" ? "Implantology" : "Dental technology", description: decode(product.body_html),
    sourceImageUrl: images[0] ?? "", imageUrls: images.join(" | "), imageCount: images.length,
    sourcePageUrl: `${baseUrl}/en/products/${product.handle}`, sourceProductId: String(product.id),
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: !images.length ? "PHOTO_REQUIRED" : !manufacturerRefs.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED" };
});
const report = { brand: "BEGO", manufacturer: "BEGO GmbH & Co. KG", sourceType: "MANUFACTURER_ESHOP_API", sourceUrl: `${baseUrl}/en-en/search`,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: 0 }, errors: [], products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
