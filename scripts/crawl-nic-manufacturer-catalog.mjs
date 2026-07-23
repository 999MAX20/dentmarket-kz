import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.nicdental.com";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/nic-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/nic-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.NIC_CONCURRENCY || 8));
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";

const decode = (value) => String(value ?? "")
  .replace(/<br\s*\/?\s*>/giu, " ")
  .replace(/<[^>]+>/gu, " ")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&amp;/giu, "&")
  .replace(/&quot;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/\s+/gu, " ")
  .trim();
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
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw lastError;
}

async function pool(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        output[index] = await worker(items[index]);
      } catch (error) {
        output[index] = { sourcePageUrl: items[index], error: String(error) };
      }
    }
  }));
  return output;
}

const sitemap = await requestText(sitemapUrl);
const sourceUrls = [...new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)]
    .map((match) => decode(match[1]).replace(/^http:/u, "https:"))
    .filter((url) => /\/product\/.+\/\d+\.html$/u.test(new URL(url).pathname)),
)];

const crawled = await pool(sourceUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const sectionStart = html.indexOf('<div class="cpxq_section1');
  const relatedStart = html.indexOf("Related product", sectionStart);
  const productHtml = html.slice(sectionStart >= 0 ? sectionStart : 0, relatedStart > sectionStart ? relatedStart : undefined);
  const rawName = decode(productHtml.match(/<h1>([\s\S]*?)<\/h1>/iu)?.[1]);
  const name = rawName.replace(/\s*\|\s*NIC Dental.*$/iu, "").trim();
  const description = decode(productHtml.match(/<div class="info">([\s\S]*?)<\/div>/iu)?.[1]);
  const imageUrls = [...new Set(
    [...productHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/giu)]
      .map((match) => new URL(match[1], baseUrl).href)
      .filter((url) => url.includes("/public/") && !url.includes("/tpl/")),
  )];
  const officialProductId = new URL(sourcePageUrl).pathname.match(/\/(\d+)\.html$/u)?.[1] ?? "";
  const categoryPath = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).slice(1, -1).join(" > ");
  if (!name || !officialProductId) throw new Error(`${sourcePageUrl}: product identity not found`);
  return {
    officialProductId,
    brand: "NIC",
    manufacturer: "Shenzhen Superline Technology Co., Ltd.",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: 1,
    categoryPath,
    description,
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_STOMIR_KZ_CATALOG",
    status: imageUrls.length ? "MANUFACTURER_REFERENCE_AND_VARIANT_MATRIX_REQUIRED" : "PHOTO_REFERENCE_AND_VARIANT_MATRIX_REQUIRED",
  };
});

const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "NIC",
  manufacturer: "Shenzhen Superline Technology Co., Ltd.",
  sourceType: "MANUFACTURER_CATALOG",
  sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    discoveredProducts: sourceUrls.length,
    crawledProducts: products.length,
    productsWithReferences: 0,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length,
  },
  errors,
  products,
};
const headers = [
  "officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs",
  "variantCount", "categoryPath", "description", "imageUrls", "imageCount", "kzEvidence", "status", "sourcePageUrl",
];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
