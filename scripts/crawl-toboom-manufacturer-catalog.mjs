import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://en.toboom.com.cn";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const concurrency = Math.max(1, Number(process.env.TOBOOM_CONCURRENCY || 16));
const userAgent = "DentMarket Kazakhstan canonical manufacturer catalog audit/1.0";
const jsonOutputPath = path.resolve("data/catalog-evidence/toboom-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/toboom-manufacturer-catalog-queue.csv");

const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/&times;/giu, "×")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/gu, " ")
    .trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

async function fetchText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        redirect: "follow",
      });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

async function pool(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        try {
          output[index] = await worker(items[index]);
        } catch (error) {
          output[index] = { error: String(error), sourceUrl: items[index] };
        }
      }
    }),
  );
  return output;
}

function normalizeReference(value) {
  return decode(value)
    .replace(/[，；;]/gu, ",")
    .replace(/\s+/gu, " ")
    .replace(/[.,:]+$/gu, "")
    .trim();
}

function extractReferences(html, title) {
  const references = new Set();
  const plain = decode(html);
  for (const pattern of [
    /(?:Order|Item|article)\s*(?:number|no\.?|#)?\s*:\s*([A-Z0-9][A-Z0-9 ._/+\-]{1,32}?)(?=\s+(?:Package|Packing|Pack|Model|Granularity|Recommended|Specifications|ISO|$))/giu,
    /(?:ISO\s*No\.?|ISO)\s*:\s*([0-9][0-9 ]{5,30})/giu,
  ]) {
    for (const match of plain.matchAll(pattern)) {
      const reference = normalizeReference(match[1]);
      if (reference) references.add(reference);
    }
  }
  const trailingCode = decode(title).match(/\b([A-Z]{1,5}[ -]?\d{2,6}[A-Z0-9 -]{0,8})$/u)?.[1];
  if (trailingCode) references.add(normalizeReference(trailingCode));
  return [...references];
}

async function readProduct(sourceUrl) {
  const html = await fetchText(sourceUrl);
  const detailStart = html.indexOf("c_portalResProduct_detail");
  const relatedStart = html.indexOf("c_portalResProduct_list", Math.max(detailStart, 0));
  const detailHtml = detailStart >= 0
    ? html.slice(detailStart, relatedStart > detailStart ? relatedStart : undefined)
    : html;
  const title = decode(
    detailHtml.match(/<h1 class="[^"]*p_Title[^"]*"[^>]*>[\s\S]*?<div class="font">[\s\S]*?<\/i>\s*([\s\S]*?)<\/div>/iu)?.[1] ??
      detailHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1],
  );
  if (!title) throw new Error(`${sourceUrl}: product title not found`);
  const summary = decode(
    detailHtml.match(/<article class="[^"]*p_summary[^"]*"[^>]*>([\s\S]*?)<\/article>/iu)?.[1],
  );
  const localId = sourceUrl.match(/\/product\/(\d+)\.html$/u)?.[1] ?? "";
  const references = extractReferences(detailHtml, title);
  const sourceImages = [...new Set([
    ...[...detailHtml.matchAll(/"srcBigPic":"([^"]+)"/giu)].map((match) => match[1]),
    ...[...detailHtml.matchAll(/domain-src="(\/repository\/image\/[^"]+)"/giu)].map((match) => match[1]),
  ].map((imagePath) => imagePath.replace(/^\/+/, "")).filter(Boolean))];
  const imageUrls = sourceImages.map((imagePath) => `https://img202.yun300.cn/${imagePath}`);
  return {
    localId,
    brand: "TOBOOM",
    manufacturer: "Shanghai TOBOOM Dental Technology Co., Ltd.",
    name: title,
    manufacturerRefs: references.join(" | "),
    referenceCount: references.length,
    summary,
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    photoStatus: imageUrls.length ? "EXACT_MANUFACTURER_IMAGE_URL" : "PHOTO_REQUIRED",
    sourcePageUrl: sourceUrl,
    status: references.length ? "OFFICIAL_REFERENCE_PRESENT" : "OFFICIAL_MODEL_REFERENCE_REVIEW_REQUIRED",
  };
}

const sitemap = await fetchText(sitemapUrl);
const productUrls = [...new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)]
    .map((match) => decode(match[1]))
    .filter((url) => /\/product\/\d+\.html$/u.test(url)),
)];
if (productUrls.length === 0) throw new Error("TOBOOM sitemap contains no product pages");

const crawled = await pool(productUrls, readProduct);
const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const identities = products.reduce((groups, product) => {
  const key = `${product.name}|${product.manufacturerRefs}`.toLocaleLowerCase("en");
  const group = groups.get(key) ?? [];
  group.push(product);
  groups.set(key, group);
  return groups;
}, new Map());
const duplicateGroups = [...identities.entries()].filter(([, group]) => group.length > 1);
const uniqueProducts = [...identities.values()].map((group) => group[0]);

const report = {
  brand: "TOBOOM",
  manufacturer: "Shanghai TOBOOM Dental Technology Co., Ltd.",
  sourceType: "MANUFACTURER_CATALOG",
  sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    sitemapProducts: productUrls.length,
    crawledProducts: products.length,
    crawlErrors: errors.length,
    uniqueProducts: uniqueProducts.length,
    productsWithReferences: products.filter((product) => product.referenceCount > 0).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    duplicateGroups: duplicateGroups.length,
  },
  errors,
  duplicates: duplicateGroups.map(([key, group]) => ({
    key,
    urls: group.map((product) => product.sourcePageUrl),
  })),
  products,
};
const headers = [
  "localId",
  "brand",
  "manufacturer",
  "name",
  "manufacturerRefs",
  "referenceCount",
  "status",
  "sourcePageUrl",
  "summary",
  "imageUrls",
  "imageCount",
  "photoStatus",
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
