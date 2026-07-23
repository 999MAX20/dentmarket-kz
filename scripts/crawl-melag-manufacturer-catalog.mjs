import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.melag.com";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/melag-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/melag-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.MELAG_CONCURRENCY || 8));
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&")
  .replace(/&quot;|&#x27;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); }
    catch (error) { lastError = error; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 450)); }
  } throw lastError;
}
async function pool(items, worker) {
  const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) { const index = cursor++; if (index >= items.length) return;
      try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; }
    }
  })); return output;
}

const sitemap = await requestText(sitemapUrl);
const familyUrls = [...new Set([...sitemap.matchAll(/hreflang=["']en-GB["']\s+href=["']([^"']+)["']/giu)].map((match) => decode(match[1])))]
  .filter((url) => /\/en\/products\//u.test(new URL(url).pathname));
const familyPages = await pool(familyUrls, async (url) => ({ url, html: await requestText(url) }));
const familyErrors = familyPages.filter((record) => record.error);
const productSlugs = [...new Set(familyPages.filter((record) => record.html).flatMap((record) => {
  const normalized = record.html.replaceAll('\\"', '"');
  return [
    ...[...normalized.matchAll(/"linkProductPage":\{[\s\S]{0,500}?"slug":"([^"]+)"/gu)].map((match) => match[1]),
    ...[...normalized.matchAll(/href=["']\/en\/([^"'?]+\/me\d+)["']/giu)].map((match) => match[1]),
  ];
}))];
const productUrls = productSlugs.map((slug) => `${baseUrl}/en/${slug.replace(/^\/+|\/+$/gu, "")}`);
const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
  let schema;
  for (const script of scripts) {
    try { const candidate = JSON.parse(script); if (candidate?.["@type"] === "Product") { schema = candidate; break; } } catch { /* ignore non-JSON scripts */ }
  }
  const title = decode(html.match(/<title>([^<]+)<\/title>/iu)?.[1]?.replace(/\s*\|\s*MELAG\s*$/iu, ""));
  const description = decode(html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/iu)?.[1]);
  const fallbackSku = decode(
    html.match(/Order no\.<\/[^>]+>[\s\S]{0,120}?(ME[A-Z0-9]+)/iu)?.[1]
      ?? new URL(sourcePageUrl).pathname.match(/\/(me\d+)$/iu)?.[1],
  ).toUpperCase();
  const sku = decode(schema?.sku || fallbackSku).toUpperCase();
  const name = decode(schema?.name || title);
  if (!name || !sku) throw new Error(`${sourcePageUrl}: product identity not found`);
  const schemaImages = (Array.isArray(schema?.image) ? schema.image : [schema?.image]).filter(Boolean);
  const embeddedImages = [...html.matchAll(/https:\/\/shopware\.melag\.com\/media\/[^"\\]+/giu)]
    .map((match) => match[0].replace(/\\u0026/giu, "&").replace(/\\+$/u, ""))
    .filter((url) => new RegExp(`/${sku.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.(?:png|jpe?g|webp)(?:\\?|$)`, "iu").test(url));
  const imageUrls = [...new Set([...schemaImages, ...embeddedImages])];
  const categoryPath = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).slice(1, -1).join(" > ");
  return {
    officialProductId: sku, brand: "MELAG", manufacturer: "MELAG Medizintechnik GmbH & Co. KG", name,
    manufacturerRef: sku, manufacturerRefs: sku, variantCount: 1,
    variants: [{ manufacturerRef: sku, label: name }], categoryPath, description: decode(schema?.description || description),
    sourceImageUrl: imageUrls[0] ?? "", imageUrls: imageUrls.join(" | "), imageCount: imageUrls.length, sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET_AND_CADEX",
    status: imageUrls.length ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED",
  };
});
const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = { brand: "MELAG", manufacturer: "MELAG Medizintechnik GmbH & Co. KG", sourceType: "MANUFACTURER_PRODUCT_CONFIGURATOR",
  sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredFamilyPages: familyUrls.length,
    familyPageErrors: familyErrors.length, discoveredProducts: productUrls.length, crawledProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length }, familyErrors, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
