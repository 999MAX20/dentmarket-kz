import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://dental-market.kz";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/alpha-bio-kz-catalog.json");
const queueOutputPath = path.resolve("data/curation/alpha-bio-kz-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.ALPHA_BIO_CONCURRENCY || 10));
const userAgent = "DentMarket Kazakhstan exact KZ catalog audit/1.0";

const decode = (value) => String(value ?? "")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&amp;/giu, "&")
  .replace(/&quot;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/&lt;/giu, "<")
  .replace(/&gt;/giu, ">")
  .replace(/\s+/gu, " ")
  .trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const parseMeta = (html, attribute, value) => decode(
  html.match(new RegExp(`<meta[^>]+${attribute}=["']${value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}["'][^>]+content=["']([^"']*)["']`, "iu"))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attribute}=["']${value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}["']`, "iu"))?.[1],
);

async function requestText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        signal: AbortSignal.timeout(30_000),
      });
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
    .map((match) => decode(match[1]))
    .filter((url) => /^\/catalog\/[^/]+$/u.test(new URL(url).pathname)),
)];

const crawled = await pool(sourceUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const normalized = html.replaceAll('\\"', '"');
  const ogTitle = parseMeta(html, "property", "og:title");
  const name = decode(ogTitle.replace(/\s+—\s+[^—]+,\s*Alpha-Bio Tec\.?$/iu, ""));
  const description = parseMeta(html, "name", "description") || parseMeta(html, "property", "og:description");
  const sourceImageUrl = parseMeta(html, "property", "og:image");
  const categoryPath = decode(normalized.match(/"category":"([^"]*)"/u)?.[1]);
  const manufacturerRefs = [...new Set(
    [...(normalized.match(/"articles":\[(.*?)\]/su)?.[1] ?? "").matchAll(/"([^"]+)"/gu)]
      .map((match) => decode(match[1]))
      .filter(Boolean),
  )];
  const specsBody = normalized.match(/"specs":\{(.*?)\}/su)?.[1] ?? "";
  const specs = Object.fromEntries(
    [...specsBody.matchAll(/"([^"]+)":"([^"]*)"/gu)].map((match) => [decode(match[1]), decode(match[2])]),
  );
  const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (!name || !slug) throw new Error(`${sourcePageUrl}: product identity not found`);
  return {
    officialProductId: slug,
    brand: "Alpha-Bio Tec.",
    manufacturer: "Alpha-Bio Tec Ltd.",
    name,
    manufacturerRef: manufacturerRefs[0] ?? "",
    manufacturerRefs: manufacturerRefs.join(" | "),
    variantCount: Math.max(1, manufacturerRefs.length),
    variants: manufacturerRefs.map((ref) => ({ manufacturerRef: ref, label: ref })),
    categoryPath,
    description,
    specifications: specs,
    sourceImageUrl,
    imageUrls: sourceImageUrl,
    imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl,
    kzEvidence: "EXACT_PRODUCT_LISTING_BY_OFFICIAL_KAZAKHSTAN_REPRESENTATIVE",
    status: !sourceImageUrl
      ? "PHOTO_REQUIRED"
      : !manufacturerRefs.length
        ? "MANUFACTURER_REFERENCE_REQUIRED"
        : "CANONICAL_CONTENT_READY",
  };
});

const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "Alpha-Bio Tec.",
  manufacturer: "Alpha-Bio Tec Ltd.",
  sourceType: "OFFICIAL_KZ_REPRESENTATIVE_CATALOG",
  sourceUrl: sitemapUrl,
  representativeUrl: baseUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    discoveredProducts: sourceUrls.length,
    crawledProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    canonicalContentReady: products.filter((product) => product.status === "CANONICAL_CONTENT_READY").length,
    crawlErrors: errors.length,
  },
  policy: {
    sellerOffersCreated: false,
    exactKzListingsCanSeedCanonicalCards: true,
    missingPhotoOrReferenceNeverDeletesProduct: true,
  },
  errors,
  products,
};
const headers = [
  "officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs",
  "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl",
];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
