import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://diplomat-dental.com/product-sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/diplomat-dental-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/diplomat-dental-manufacturer-catalog-queue.csv");
const definitions = [
  ["https://diplomat-dental.com/product/model-pro-500-700/", "Model Pro 500 / 700", "Стоматологические установки", ["Model Pro 500", "Model Pro 700"]],
  ["https://diplomat-dental.com/product/model-pro-600-800/", "Model Pro 600 / 800", "Стоматологические установки", ["Model Pro 600", "Model Pro 800"]],
  ["https://diplomat-dental.com/product/model-one/", "Model One 100", "Стоматологические установки", []],
  ["https://diplomat-dental.com/product/model-one-200/", "Model One 200", "Стоматологические установки", []],
  ["https://diplomat-dental.com/product/model-one-100-ortho/", "Model One Ortho", "Стоматологические установки", []],
  ["https://diplomat-dental.com/product/classic-line/", "Classic Line", "Стоматологические установки", []],
  ["https://diplomat-dental.com/product/chair-pro/", "Chair Pro", "Стоматологические кресла", []],
  ["https://diplomat-dental.com/product/cart/", "Cart DL210", "Мобильные врачебные модули", []],
  ["https://diplomat-dental.com/product/stools/", "Diplomat Dental Stools", "Стулья врача и ассистента", []],
  ["https://diplomat-dental.com/product/light/", "Diplomat Dental Lamps", "Стоматологическое освещение", []],
  ["https://diplomat-dental.com/product/densim-optics/", "Densim Optics", "Стоматологические микроскопы", []],
  ["https://diplomat-dental.com/product/compressors/", "Diplomat Dental Compressors", "Компрессоры", []],
];
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return response.text(); }
const meta = (html, property) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)`, "iu"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "iu"))?.[1]);
const products = [];
const errors = [];
for (const [sourcePageUrl, name, categoryPath, variantLabels] of definitions) {
  try { const html = await requestText(sourcePageUrl); const sourceImageUrl = meta(html, "og:image") || decode(html.match(/<img[^>]+src=["']([^"']*wp-content\/uploads[^"']+)/iu)?.[1]); const variants = variantLabels.map((label) => ({ variantId: token(label), label, model: label, manufacturerRef: "" }));
    products.push({ officialProductId: `DIPLOMAT-${token(name)}`, brand: "Diplomat Dental", manufacturer: "DIPLOMAT DENTAL s.r.o.", name,
      manufacturerRef: "", manufacturerRefs: "", variantCount: Math.max(1, variants.length), variants, categoryPath, description: meta(html, "description"),
      sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET",
      status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" });
  } catch (error) { errors.push({ sourcePageUrl, error: String(error) }); }
}
const report = { brand: "Diplomat Dental", manufacturer: "DIPLOMAT DENTAL s.r.o.", sourceType: "OFFICIAL_CURRENT_PRODUCT_PORTFOLIO", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
