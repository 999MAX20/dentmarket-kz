import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.dioimplant.com";
const sourceUrl = `${baseUrl}/product/list`;
const jsonOutputPath = path.resolve("data/catalog-evidence/dio-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/dio-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&amp;/giu, "&").replace(/&nbsp;/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };

const response = await fetch(sourceUrl, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`${sourceUrl}: HTTP ${response.status}`);
const html = await response.text();
const catalogStart = html.indexOf('<section class="w1280 productList">');
if (catalogStart < 0) throw new Error("DIO product list section not found");
const catalog = html.slice(catalogStart);
const excludedDistributedProducts = new Set(["N.S.K", "IOS(Trios)", "Medit i900", "Medit i700"]);
const products = [];

for (const match of catalog.matchAll(/<li\s+onclick=["']([^"']+)["'][^>]*>[\s\S]*?<img\s+src=["']([^"']+)["'][^>]*>[\s\S]*?<h5>([\s\S]*?)<\/h5>[\s\S]*?<\/li>/giu)) {
  const [block, action, imagePath, rawName] = match;
  const name = decode(rawName).replace(/^재료$/u, "GBR materials");
  if (!name || excludedDistributedProducts.has(name) || name === "Surface") continue;
  const before = catalog.slice(0, match.index);
  const categoryMatches = [...before.matchAll(/<h2>([^<]+)<\/h2>/giu)];
  const categoryPath = decode(categoryMatches.at(-1)?.[1] || "DIO products");
  const functionIds = action.match(/_beforeMenuMove\(this,\s*(\d+),\s*(\d+)\)/u);
  const href = action.match(/location\.href=['"]([^'"]+)['"]/u)?.[1];
  const route = functionIds ? `/product/${functionIds[1]}?mseq=${functionIds[2]}` : href;
  if (!route) continue;
  const officialProductId = functionIds ? `DIO-FAMILY-${functionIds[1]}` : `DIO-${route.split("/").filter(Boolean).at(-1).toUpperCase()}`;
  const imageUrl = new URL(imagePath, baseUrl).href;
  products.push({
    officialProductId,
    brand: "DIO",
    manufacturer: "DIO Corporation",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: 0,
    variants: [],
    categoryPath,
    description: "",
    sourceImageUrl: imageUrl,
    imageUrls: imageUrl,
    imageCount: 1,
    sourcePageUrl: new URL(route, baseUrl).href,
    kzEvidence: "OFFICIAL_DIO_GLOBAL_ORDER_DIRECTORY_INCLUDES_KAZAKHSTAN",
    status: "MANUFACTURER_REFERENCE_REQUIRED",
    sourceBlockBytes: block.length,
  });
}

const uniqueProducts = [...new Map(products.map((product) => [product.officialProductId, product])).values()];
const report = {
  brand: "DIO",
  manufacturer: "DIO Corporation",
  sourceType: "MANUFACTURER_PUBLIC_PRODUCT_FAMILY_CATALOG",
  sourceUrl,
  marketEvidenceUrl: "https://dioimplant.com/eng/adMain/orderSiteList.do",
  lastChecked: new Date().toISOString().slice(0, 10),
  note: "Public product families and exact family images are preserved. Article-level matrices are restricted by the manufacturer site and remain in the reference audit queue.",
  totals: {
    discoveredProducts: uniqueProducts.length,
    productsWithReferences: uniqueProducts.filter((product) => product.manufacturerRefs).length,
    productsWithImages: uniqueProducts.filter((product) => product.imageCount > 0).length,
    crawlErrors: 0,
  },
  errors: [],
  products: uniqueProducts,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...uniqueProducts.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
