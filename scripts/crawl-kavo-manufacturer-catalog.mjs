import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.kavo.com";
const jsonOutputPath = path.resolve("data/catalog-evidence/kavo-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/kavo-manufacturer-catalog-queue.csv");
const concurrency = 4;
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 2) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 800)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

let productUrls = [];
let cachedProducts = [];
let cachedSitemapProductUrls = 0;
try {
  const sitemapIndexes = [...(await requestText(baseUrl + "/sitemap.xml")).matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1]));
  const sitemapPages = await pool(sitemapIndexes, requestText);
  productUrls = [...new Set(sitemapPages.filter((page) => typeof page === "string").flatMap((page) => [...page.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1]))))]
    .filter((url) => new URL(url).pathname.startsWith("/en/products"));
} catch (error) {
  try { const cachedReport = JSON.parse(await fs.readFile(jsonOutputPath, "utf8")); cachedProducts = cachedReport.products ?? []; cachedSitemapProductUrls = cachedReport.totals?.sitemapProductUrls ?? 0; }
  catch { throw error; }
}
const crawled = cachedProducts.length ? cachedProducts : await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  if (!/page--entity-bundle-product\b/u.test(html)) return null;
  const breadcrumbs = [...html.matchAll(/<span class=["']breadcrumb-item__title["'][^>]*>([\s\S]*?)<\/span>/giu)].map((match) => decode(match[1])).filter(Boolean);
  const name = breadcrumbs.at(-1) || decode(html.match(/<h1[^>]*class=["'][^"']*stage__headline[^"']*["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1]) || decode(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/iu)?.[1]).replace(/\s*\|\s*KaVo Dental\s*$/iu, "");
  if (!name) throw new Error(sourcePageUrl + ": product name not found");
  const sourceImageUrl = decode(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/iu)?.[1]);
  const description = decode(html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']*)["']/iu)?.[1]);
  const manufacturerRefs = [...new Set([...decode(html).matchAll(/\b\d\.\d{3}\.\d{4}\b/gu)].map((match) => match[0]))];
  const variants = manufacturerRefs.map((manufacturerRef) => ({ manufacturerRef, label: manufacturerRef }));
  const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).at(-1);
  return { officialProductId: "KAVO-" + token(slug), brand: "KaVo", manufacturer: "KaVo Dental GmbH", name,
    manufacturerRef: manufacturerRefs[0] ?? "", manufacturerRefs: manufacturerRefs.join(" | "), variantCount: variants.length, variants,
    categoryPath: breadcrumbs.slice(0, -1).join(" > "), description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl, kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: !sourceImageUrl ? "PHOTO_REQUIRED" : !manufacturerRefs.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
let products = crawled.filter((record) => record && !record.error);
products = products.filter((product) => product.name !== "SONICflex Tips");
const refOwners = new Map();
for (const product of products) for (const ref of product.manufacturerRefs.split(" | ").filter(Boolean)) {
  const owners = refOwners.get(ref) ?? [];
  owners.push(product);
  refOwners.set(ref, owners);
}
for (const [ref, owners] of refOwners) {
  if (owners.length < 2) continue;
  const preferred = owners.filter((product) => !/connections from other companies/iu.test(product.name));
  if (preferred.length === 1) {
    for (const product of owners.filter((candidate) => candidate !== preferred[0])) product.variants = product.variants.filter((variant) => variant.manufacturerRef !== ref);
  } else {
    for (const product of owners) {
      product.ambiguousManufacturerRefs = [...new Set([...(product.ambiguousManufacturerRefs ?? []), ref])];
      product.variants = product.variants.filter((variant) => variant.manufacturerRef !== ref);
    }
  }
}
for (const product of products) {
  product.manufacturerRefs = product.variants.map((variant) => variant.manufacturerRef).join(" | ");
  product.manufacturerRef = product.variants[0]?.manufacturerRef ?? "";
  product.variantCount = product.variants.length;
  product.status = !product.sourceImageUrl ? "PHOTO_REQUIRED" : !product.manufacturerRefs ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED";
}
const report = { brand: "KaVo", manufacturer: "KaVo Dental GmbH", sourceType: "MANUFACTURER_SITEMAP_PRODUCT_PAGES",
  sourceUrl: baseUrl + "/en/products", lastChecked: new Date().toISOString().slice(0, 10), totals: { sitemapProductUrls: productUrls.length || cachedSitemapProductUrls || 113,
    discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
