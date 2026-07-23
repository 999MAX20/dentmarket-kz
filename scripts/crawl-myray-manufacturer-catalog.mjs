import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.myray.it/sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/myray-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/myray-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index].sourcePageUrl, error: String(error) }; } } })); return output; }
const scoreImage = (image, slug) => {
  const text = decodeURIComponent(image).toLowerCase().replace(/[^a-z0-9]+/gu, "");
  const slugKey = slug.toLowerCase().replace(/[^a-z0-9]+/gu, "");
  let score = text.includes(slugKey) ? 40 : 0;
  for (const part of slug.toLowerCase().split(/[^a-z0-9]+/u).filter((part) => part.length > 1)) if (text.includes(part)) score += 5;
  if (/header|prodotto|product|generated/u.test(text)) score += 4;
  if (/logo|icon|bannerdownload|approvazione|sternweber|facebook|linkedin|youtube/u.test(text)) score -= 50;
  return score;
};

const sitemap = await requestText(sitemapUrl);
const entries = [];
for (const match of sitemap.matchAll(/<url>([\s\S]*?)<\/url>/giu)) {
  const block = match[1];
  const sourcePageUrl = decode(block.match(/<loc>([^<]+)<\/loc>/iu)?.[1]);
  if (!/^https:\/\/www\.myray\.it\/en\/(?:intraoral-imaging|extraoral-imaging|radiology-software)\/[^/]+$/u.test(sourcePageUrl)) continue;
  if (/\/imaging-extraorale\//u.test(sourcePageUrl)) continue;
  const images = [...new Set([...block.matchAll(/<image:loc>([^<]+)<\/image:loc>/giu)].map((imageMatch) => decode(imageMatch[1])))];
  const lastModified = decode(block.match(/<lastmod>([^<]+)<\/lastmod>/iu)?.[1]);
  entries.push({ sourcePageUrl, images, lastModified });
}
const crawled = await pool(entries, async ({ sourcePageUrl, images, lastModified }) => {
  const html = await requestText(sourcePageUrl);
  const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).at(-1);
  const title = decode(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]);
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/iu)?.[1]);
  const h1 = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  const fallbackName = slug.split("-").map((part) => part.toUpperCase()).join(" ");
  const name = h1 || title.split("|")[0].trim() || fallbackName;
  const rankedImages = images.map((image) => ({ image, score: scoreImage(image, slug) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  const sourceImageUrl = rankedImages[0]?.image ?? "";
  const categoryPath = sourcePageUrl.includes("/extraoral-imaging/") ? "Экстраоральная рентгенодиагностика" : sourcePageUrl.includes("/intraoral-imaging/") ? "Интраоральная рентгенодиагностика" : "Программное обеспечение для рентгенодиагностики";
  return { officialProductId: `MYRAY-${token(slug)}`, brand: "MyRay", manufacturer: "Cefla S.C.", name, manufacturerRef: "", manufacturerRefs: "", model: categoryPath.startsWith("Программное") ? "" : fallbackName, variantCount: 1, variants: [], categoryPath, description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, sourceModifiedAt: lastModified, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "en"));
const report = { brand: "MyRay", manufacturer: "Cefla S.C.", sourceType: "OFFICIAL_CURRENT_ENGLISH_PRODUCT_SITEMAP", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { categoryPagesExcluded: true, duplicateLegacyLanguageRouteExcluded: true, modelNameIsNotAssumedToBeOrderCode: true }, totals: { discoveredProducts: products.length, hardwareProducts: products.filter((product) => product.model).length, softwareProducts: products.filter((product) => !product.model).length, variantSkus: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "sourceModifiedAt", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
