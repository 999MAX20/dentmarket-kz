import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const baseUrl = "https://www.saeshin.com";
const catalogUrl = `${baseUrl}/content/24`;
const jsonOutputPath = path.resolve("data/catalog-evidence/saeshin-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/saeshin-manufacturer-catalog-queue.csv");
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";
const concurrency = Math.max(1, Number(process.env.SAESHIN_CONCURRENCY || 6));

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

function requestText(url, attempts = 4) {
  return new Promise((resolve, reject) => {
    const run = (attempt) => {
      const parsed = new URL(url);
      const client = parsed.protocol === "http:" ? http : https;
      const request = client.get(parsed, {
        headers: { "user-agent": userAgent },
        rejectUnauthorized: false,
        timeout: 30_000,
      }, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          requestText(new URL(response.headers.location, parsed).href, attempts).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          const error = new Error(`${url}: HTTP ${response.statusCode}`);
          if (attempt < attempts) setTimeout(() => run(attempt + 1), attempt * 400);
          else reject(error);
          return;
        }
        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve(body));
      });
      request.on("timeout", () => request.destroy(new Error(`${url}: timeout`)));
      request.on("error", (error) => {
        if (attempt < attempts) setTimeout(() => run(attempt + 1), attempt * 400);
        else reject(error);
      });
    };
    run(1);
  });
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
        output[index] = { officialProductId: items[index], sourcePageUrl: `${baseUrl}/ajax/get_article/5/${items[index]}`, error: String(error) };
      }
    }
  }));
  return output;
}

const catalogHtml = await requestText(catalogUrl);
const productIds = [...new Set([...catalogHtml.matchAll(/\/ajax\/get_article\/5\/(\d+)/gu)].map((match) => match[1]))];
const genericFamilies = /^(?:Package|Implant Angle Handpieces|Endodontics Angle Handpieces|Piezo Handpiece|E-TYPE Motor)$/iu;
const crawled = await pool(productIds, async (officialProductId) => {
  const sourcePageUrl = `${baseUrl}/ajax/get_article/5/${officialProductId}`;
  const html = await requestText(sourcePageUrl);
  const name = decode(html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/iu)?.[1]);
  const imageUrls = [...new Set([...html.matchAll(/<img[^>]+src=["']([^"']+)["']/giu)].map((match) => new URL(match[1], baseUrl).href))];
  if (!name) throw new Error(`${sourcePageUrl}: product identity not found`);
  const manufacturerRef = genericFamilies.test(name) ? "" : name;
  return {
    officialProductId,
    brand: "Saeshin",
    manufacturer: "Saeshin Precision Co., Ltd.",
    name,
    manufacturerRef,
    manufacturerRefs: manufacturerRef,
    variantCount: 1,
    categoryPath: "Dental",
    description: "",
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl,
    kzEvidence: "BRAND_AND_STRONG_PRODUCT_PRESENT_IN_STOMIR_KZ_CATALOG",
    status: manufacturerRef && imageUrls.length
      ? "OFFICIAL_PRODUCT_IDENTITY_READY_KZ_SKU_REVIEW_REQUIRED"
      : !manufacturerRef
        ? "MANUFACTURER_REFERENCE_REQUIRED"
        : "PHOTO_REQUIRED",
  };
});

const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "Saeshin",
  manufacturer: "Saeshin Precision Co., Ltd.",
  sourceType: "MANUFACTURER_CATALOG",
  sourceUrl: catalogUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    discoveredProducts: productIds.length,
    crawledProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRef).length,
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
