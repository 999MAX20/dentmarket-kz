import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://dentkist.ru/sitemap-store.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/dentkist-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/dentkist-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.DENTKIST_CONCURRENCY || 6));
const userAgent = "Mozilla/5.0 (compatible; DentMarket Kazakhstan manufacturer catalog audit/1.0)";

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
const meta = (html, key, property = false) => decode(
  html.match(new RegExp(`<meta[^>]+${property ? "property" : "name"}=["']${key}["'][^>]+content=["']([^"']*)`, "iu"))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${property ? "property" : "name"}=["']${key}["']`, "iu"))?.[1],
);
const explicitNames = new Map([
  ["nakonechnik-charmflex-smesitelnii-zhyolt", "Наконечник-смеситель CharmFlex, жёлтый"],
  ["nakonechnik-smesitelnii-charmflex-zelyon", "Наконечник-смеситель CharmFlex, зелёный"],
  ["kanyulya-intraoralnaya", "Канюля интраоральная DentKist"],
]);

async function requestText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
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
const sourceUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))]
  .filter((url) => url.includes("/catalog/"));

const crawled = await pool(sourceUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const ogTitle = meta(html, "og:title", true);
  const pageTitle = decode(html.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]);
  const rawName = (ogTitle || pageTitle)
    .replace(/^✅\s*/u, "")
    .replace(/^Карточка товара:?\s*/iu, "")
    .replace(/\s*[|—]\s*Dentkist.*$/iu, "")
    .trim();
  const sourceImageUrl = meta(html, "og:image", true);
  const description = meta(html, "description");
  const relativePath = new URL(sourcePageUrl).pathname.replace(/^\/catalog\//u, "");
  const categoryPath = relativePath.split("/").slice(0, -1).join(" > ") || "catalog";
  const officialProductId = relativePath.split("/").at(-1);
  const explicitName = [...explicitNames.entries()].find(([slug]) => officialProductId.includes(slug))?.[1];
  const name = explicitName || rawName;
  if (!name || !officialProductId) throw new Error(`${sourcePageUrl}: product identity not found`);
  return {
    officialProductId,
    brand: "DentKist",
    manufacturer: "DentKist, Inc.",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: 1,
    categoryPath,
    description,
    imageUrls: sourceImageUrl,
    imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_STOMIR_KZ_CATALOG",
    status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_AND_REFERENCE_REQUIRED",
  };
});

const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "DentKist",
  manufacturer: "DentKist, Inc.",
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
const csv = [
  headers.join(","),
  ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(",")),
].join("\n") + "\n";

await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
