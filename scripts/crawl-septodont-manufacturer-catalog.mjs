import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.septodont.es";
const sitemapUrl = `${baseUrl}/product-sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/septodont-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/septodont-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.SEPTODONT_CONCURRENCY || 10));
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";

const decode = (value) => String(value ?? "")
  .replace(/<br\s*\/?\s*>/giu, " ").replace(/<[^>]+>/gu, " ")
  .replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'").replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
async function requestText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 450));
    }
  }
  throw lastError;
}
async function pool(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await worker(items[index]); }
      catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; }
    }
  }));
  return output;
}

const sitemap = await requestText(sitemapUrl);
const sourceUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))]
  .filter((url) => /^\/product\/[^/]+\/$/u.test(new URL(url).pathname));
const crawled = await pool(sourceUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const name = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/iu)?.[1]);
  const sourceImageUrl = decode(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/iu)?.[1]);
  const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
  const categoryPath = decode(html.match(/<span[^>]+itemprop=["']name["'][^>]*class=["'][^"']*leading-tight[^"']*["'][^>]*>([^<]+)<\/span>[\s\S]*?<meta[^>]+position[^>]+content=["']2["']/iu)?.[1]) || slug.split("-").slice(0, 2).join(" ");
  if (!name || !slug) throw new Error(`${sourcePageUrl}: product identity not found`);
  return {
    officialProductId: slug,
    brand: "Septodont",
    manufacturer: "Septodont SAS",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: 1,
    categoryPath,
    description,
    sourceImageUrl,
    imageUrls: sourceImageUrl,
    imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_BY_KAZAKHSTAN_DISTRIBUTORS_AT_CADEX",
    status: sourceImageUrl ? "MANUFACTURER_REFERENCE_AND_KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REFERENCE_AND_KZ_SKU_EVIDENCE_REQUIRED",
  };
});
const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "Septodont", manufacturer: "Septodont SAS", sourceType: "MANUFACTURER_COUNTRY_CATALOG",
  sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    discoveredProducts: sourceUrls.length, crawledProducts: products.length, productsWithReferences: 0,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length,
  },
  errors, products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
