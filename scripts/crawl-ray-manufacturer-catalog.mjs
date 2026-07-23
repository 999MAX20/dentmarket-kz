import fs from "node:fs/promises";
import path from "node:path";

const connectBase = "https://connect.raymedical.com";
const storeBase = "https://rayonlinestore.com";
const jsonOutputPath = path.resolve("data/catalog-evidence/ray-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/ray-manufacturer-catalog-queue.csv");
const categories = ["2D Panorama", "3D Printer", "5D Solution", "CBCT", "Ceph", "Consumables", "Face Scanner", "Image Plate System", "Intraoral Scanner", "Intraoral Sensor", "Milling Machine", "Software"];
const genericFolders = new Set(["manual", "sales", "sample images", "images", "short form", "how-to", "training", "resources"]);
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).replace(/α/giu, " alpha ").replace(/\+/gu, " plus ").normalize("NFKD").replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(45_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }

const coreProducts = [];
for (const category of categories) {
  const encodedCategory = encodeURIComponent(category);
  const basePath = `/en/browse/${encodedCategory}`;
  const sourcePageUrl = `${connectBase}${basePath}`;
  const html = await requestText(sourcePageUrl);
  const children = [...new Set([...html.matchAll(/href=["']([^"']+)["']/giu)].map((match) => match[1])
    .filter((href) => href.startsWith(`${basePath}/`) && decodeURIComponent(href).split("/").length === 5))]
    .map((href) => ({ name: decodeURIComponent(href.split("/").at(-1)), sourcePageUrl: `${connectBase}${href}` }))
    .filter((child) => !genericFolders.has(child.name.toLowerCase()));
  const families = children.length ? children : category === "5D Solution" ? [{ name: category, sourcePageUrl }] : [];
  for (const family of families) coreProducts.push({
    officialProductId: `RAY-${token(family.name)}`,
    brand: "RAY",
    manufacturer: "RAY Co., Ltd.",
    name: family.name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: 0,
    variants: [],
    categoryPath: category,
    description: `${family.name} — официально подтверждённая продуктовая линия RAY.`,
    sourceImageUrl: "",
    imageUrls: "",
    imageCount: 0,
    sourcePageUrl: family.sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: "PHOTO_REQUIRED",
  });
}

const storePayload = JSON.parse(await requestText(`${storeBase}/products.json?limit=250&page=1`));
const storeProducts = (storePayload.products ?? []).map((product) => {
  const variants = (product.variants ?? []).map((variant) => ({ manufacturerRef: decode(variant.sku), label: decode(variant.title === "Default Title" ? product.title : variant.title), barcode: decode(variant.barcode) })).filter((variant) => variant.manufacturerRef);
  const refs = [...new Set(variants.map((variant) => variant.manufacturerRef))];
  const images = [...new Set((product.images ?? []).map((image) => image.src).filter(Boolean))];
  return {
    officialProductId: `RAY-${token(refs[0] || product.handle)}`,
    brand: "RAY",
    manufacturer: "RAY Co., Ltd.",
    name: decode(product.title),
    manufacturerRef: refs[0] ?? "",
    manufacturerRefs: refs.join(" | "),
    variantCount: variants.length,
    variants,
    categoryPath: decode(product.product_type) || "Accessories and spare parts",
    description: decode(product.body_html),
    sourceImageUrl: images[0] ?? "",
    imageUrls: images.join(" | "),
    imageCount: images.length,
    sourcePageUrl: `${storeBase}/products/${product.handle}`,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: images.length ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED",
  };
}).filter((product) => product.manufacturerRefs);

const byName = new Map(coreProducts.map((product) => [token(product.name), product]));
const mergedStoreProducts = [];
for (const product of storeProducts) {
  const core = byName.get(token(product.name));
  if (core) Object.assign(core, { manufacturerRef: product.manufacturerRef, manufacturerRefs: product.manufacturerRefs, variantCount: product.variantCount,
    variants: product.variants, description: product.description || core.description, sourceImageUrl: product.sourceImageUrl, imageUrls: product.imageUrls,
    imageCount: product.imageCount, officialStorePageUrl: product.sourcePageUrl, status: product.status });
  else mergedStoreProducts.push(product);
}
const seenIds = new Set();
const products = [...coreProducts, ...mergedStoreProducts].filter((product) => !seenIds.has(product.officialProductId) && seenIds.add(product.officialProductId));
const report = {
  brand: "RAY", manufacturer: "RAY Co., Ltd.", sourceType: "MANUFACTURER_RESOURCE_CENTER_AND_OFFICIAL_STORE_API",
  sourceUrl: `${connectBase}/en/browse`, lastChecked: new Date().toISOString().slice(0, 10),
  totals: { coreProductFamilies: coreProducts.length, officialStoreSkuProducts: storeProducts.length, uniqueProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: 0 }, errors: [], products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
