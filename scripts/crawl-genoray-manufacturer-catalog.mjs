import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.genorayamerica.com";
const sourceUrl = `${baseUrl}/dental/dental_list/`;
const jsonOutputPath = path.resolve("data/catalog-evidence/genoray-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/genoray-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&amp;/giu, "&").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const response = await fetch(sourceUrl, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(45_000) });
if (!response.ok) throw new Error(`${sourceUrl}: HTTP ${response.status}`);
const html = await response.text();
const listStart = html.indexOf('<ul id="portfolio-list"');
const listEnd = html.indexOf("</ul>", listStart);
if (listStart < 0 || listEnd < 0) throw new Error("GENORAY dental product list not found");
const listHtml = html.slice(listStart, listEnd);
const products = [...listHtml.matchAll(/<a\s+href=["']([^"']+)["'][^>]*>[\s\S]*?<img\s+src=["']([^"']+)["'][^>]*>[\s\S]*?<h5>([^<]+)<\/h5>/giu)].map((match) => {
  const sourcePageUrl = new URL(match[1], baseUrl).href;
  const sourceImageUrl = new URL(match[2], baseUrl).href;
  const model = decode(match[3]);
  const categoryClass = listHtml.slice(0, match.index).match(/<li\s+class=["']([^"']+)["'][^>]*>[^<]*$/iu)?.[1] ?? "";
  const categoryPath = /\b2d\b/iu.test(categoryClass) ? "Dental imaging > 2D" : /\b3d\b/iu.test(categoryClass) ? "Dental imaging > 3D" : "Dental imaging > IOS/IOX";
  return {
    officialProductId: `GENORAY-${model.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`, brand: "Genoray", manufacturer: "GENORAY Co., Ltd.",
    name: `Genoray ${model}`, manufacturerRef: model, manufacturerRefs: model, variantCount: 1,
    variants: [{ manufacturerRef: model, label: model }], categoryPath, description: "", sourceImageUrl, imageUrls: sourceImageUrl,
    imageCount: 1, sourcePageUrl, kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET", status: "KZ_SKU_EVIDENCE_REQUIRED",
  };
});
const report = { brand: "Genoray", manufacturer: "GENORAY Co., Ltd.", sourceType: "MANUFACTURER_CURRENT_DENTAL_PRODUCT_LIST", sourceUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: 0 }, errors: [], products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
