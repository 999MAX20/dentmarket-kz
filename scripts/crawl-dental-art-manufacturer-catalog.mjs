import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.dental-art.it/product-sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/dental-art-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/dental-art-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return response.text(); }
const meta = (html, property) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)`, "iu"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "iu"))?.[1]);
const sitemap = await requestText(sitemapUrl);
const productUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])).filter((url) => url.includes("/en/products/") && !url.includes("%")))];
const products = [];
const errors = [];
for (const sourcePageUrl of productUrls) {
  try {
    const html = await requestText(sourcePageUrl);
    const name = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ?? html.match(/<title>([^<]+)/iu)?.[1]?.split(" - ")[0]);
    const sourceImageUrl = meta(html, "og:image");
    const description = meta(html, "description") || meta(html, "og:description");
    const parts = new URL(sourcePageUrl).pathname.split("/").filter(Boolean);
    const categoryPath = decode(parts.at(-2)?.replaceAll("-", " "));
    products.push({ officialProductId: `DENTAL-ART-${token(name)}`, brand: "Dental Art", manufacturer: "Dental Art S.p.A.", name,
      manufacturerRef: "", manufacturerRefs: "", variantCount: 1, variants: [], categoryPath, description, sourceImageUrl,
      imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, kzEvidence: "BRAND_PRESENTED_BY_KZ_SPECIALIZED_SELLER",
      status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" });
  } catch (error) { errors.push({ sourcePageUrl, error: String(error) }); }
}
const report = { brand: "Dental Art", manufacturer: "Dental Art S.p.A.", sourceType: "OFFICIAL_CURRENT_ENGLISH_PRODUCT_SITEMAP", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { englishProductUrls: productUrls.length, discoveredProducts: products.length,
    productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
