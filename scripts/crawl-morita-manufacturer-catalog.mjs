import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.jmoritaeurope.de/en/sitemap-xml/";
const jsonOutputPath = path.resolve("data/catalog-evidence/morita-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/morita-manufacturer-catalog-queue.csv");
const concurrency = 6;
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const sitemap = await requestText(sitemapUrl);
const productUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))]
  .filter((url) => new URL(url).pathname.startsWith("/en/products/"))
  .filter((url) => !/overview\/?$|partner-products|\/ent\/|\/radiology\//iu.test(new URL(url).pathname));
const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  if (!/<body class=["'][^"']*product-detail/iu.test(html)) return null;
  const header = html.match(/<header class=["'][^"']*header[^"']*inner-slider[^"']*["'][^>]*>([\s\S]*?)<\/header>/iu)?.[1] ?? "";
  const name = decode(header.match(/<h1[^>]*>([\s\S]*?)(?:<small|<\/h1>)/iu)?.[1]);
  if (!name) throw new Error(sourcePageUrl + ": product name not found");
  const rawImage = decode(header.match(/<img[^>]+src=["']([^"']+)["']/iu)?.[1]);
  const sourceImageUrl = rawImage ? new URL(rawImage, sourcePageUrl).href : "";
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/iu)?.[1]);
  const pathParts = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).slice(2, -1).map((part) => decodeURIComponent(part).replaceAll("-", " "));
  return { officialProductId: "MORITA-" + token(name), brand: "Morita", manufacturer: "J. MORITA MFG. CORP.", name,
    manufacturerRef: "", manufacturerRefs: "", variantCount: 0, variants: [], categoryPath: pathParts.join(" > "), description,
    sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const byName = new Map();
for (const product of crawled.filter((record) => record && !record.error)) if (!byName.has(token(product.name))) byName.set(token(product.name), product);
const products = [...byName.values()];
const report = { brand: "Morita", manufacturer: "J. MORITA MFG. CORP.", sourceType: "MORITA_EUROPE_PRODUCT_SITEMAP",
  sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), totals: { sitemapProductUrls: productUrls.length,
    discoveredProducts: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
