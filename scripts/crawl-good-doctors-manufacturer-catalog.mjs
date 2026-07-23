import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.gooddrs.de";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/good-doctors-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/good-doctors-manufacturer-catalog-queue.csv");
const concurrency = 6;
const decode = (value) => String(value ?? "").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); }
    catch (error) { lastError = error; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); }
  } throw lastError;
}
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return;
    try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const sitemap = await requestText(sitemapUrl);
const productUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))]
  .filter((url) => /\/produkte\/[^/]+\/?$/u.test(new URL(url).pathname));
const crawled = await pool(productUrls, async (germanUrl) => {
  const germanHtml = await requestText(germanUrl);
  const englishUrl = decode(germanHtml.match(/<link\s+rel=["']alternative["']\s+hrefLang=["']en["']\s+href=["']([^"']+)["']/iu)?.[1]);
  let html = germanHtml; let sourcePageUrl = germanUrl;
  if (englishUrl) { try { html = await requestText(englishUrl); sourcePageUrl = englishUrl; } catch { /* retain canonical German evidence */ } }
  const meta = (property) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "iu"))?.[1]);
  const name = meta("og:title") || decode(html.match(/<title>([^<]+)<\/title>/iu)?.[1]?.replace(/\s*\|\s*Good Doctors Germany\s*$/iu, ""));
  const manufacturerRef = decode(html.match(/"produktExtras":\{"model":"([^"]*)"/u)?.[1] || germanHtml.match(/"produktExtras":\{"model":"([^"]*)"/u)?.[1]);
  const categoryPath = decode((html.match(/"produktgruppen":\{"edges":\[\{"node":\{"slug":"[^"]+","name":"([^"]+)"/u)?.[1]
    || germanHtml.match(/"produktgruppen":\{"edges":\[\{"node":\{"slug":"[^"]+","name":"([^"]+)"/u)?.[1]).replaceAll("\\u0026", "&"));
  const imageUrl = meta("og:image") || decode(germanHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/iu)?.[1]);
  if (!name) throw new Error(`${germanUrl}: product name not found`);
  const stableId = manufacturerRef || new URL(germanUrl).pathname.split("/").filter(Boolean).at(-1);
  return { officialProductId: `GOOD-DOCTORS-${stableId.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`, brand: "Good Doctors",
    manufacturer: "Good Doctors Co., Ltd.", name, manufacturerRef, manufacturerRefs: manufacturerRef, variantCount: manufacturerRef ? 1 : 0,
    variants: manufacturerRef ? [{ manufacturerRef, label: name }] : [], categoryPath, description: meta("description") || meta("og:description"),
    sourceImageUrl: imageUrl, imageUrls: imageUrl, imageCount: imageUrl ? 1 : 0, sourcePageUrl, canonicalSourcePageUrl: germanUrl,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET", status: !imageUrl ? "PHOTO_REQUIRED" : !manufacturerRef ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED" };
});
const errors = crawled.filter((record) => record.error); const products = crawled.filter((record) => !record.error);
const report = { brand: "Good Doctors", manufacturer: "Good Doctors Co., Ltd.", sourceType: "MANUFACTURER_PRODUCT_SITEMAP", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: productUrls.length, crawledProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
