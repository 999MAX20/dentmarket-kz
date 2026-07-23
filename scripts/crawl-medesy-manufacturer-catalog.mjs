import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.medesy.it";
const sitemapUrls = [`${baseUrl}/prodotto-sitemap.xml`, `${baseUrl}/prodotto-sitemap2.xml`];
const jsonOutputPath = path.resolve("data/catalog-evidence/medesy-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/medesy-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.MEDESY_CONCURRENCY || 12));
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";

const decode = (value) => String(value ?? "")
  .replace(/<br\s*\/?\s*>/giu, " ")
  .replace(/<[^>]+>/gu, " ")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&amp;/giu, "&")
  .replace(/&quot;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
  .replace(/&lt;/giu, "<")
  .replace(/&gt;/giu, ">")
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
      const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(45_000) });
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

const sitemaps = await Promise.all(sitemapUrls.map((url) => requestText(url)));
const sourceUrls = [...new Set(sitemaps.flatMap((sitemap) => [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1]))))]
  .filter((url) => /\/it\/prodotti\/[^/]+\/$/u.test(new URL(url).pathname));

const crawled = await pool(sourceUrls, async (italianSourceUrl) => {
  const italianHtml = await requestText(italianSourceUrl);
  const englishSourceUrl = decode(
    italianHtml.match(/<a[^>]+href=["']([^"']+)["'][^>]+class=["'][^"']*wpml-ls[^"']*[^>]*>\s*<span[^>]+lang=["']en["']/iu)?.[1]
    ?? italianHtml.match(/href=["']([^"']+\/en\/products\/[^"']+)["']/iu)?.[1],
  );
  let html = italianHtml;
  let sourcePageUrl = italianSourceUrl;
  if (englishSourceUrl) {
    try {
      html = await requestText(englishSourceUrl);
      sourcePageUrl = englishSourceUrl;
    } catch {
      // The Italian product page is still authoritative if a translation is temporarily unavailable.
    }
  }
  const articleStart = html.search(/<article[^>]+prodotto-template|<article[^>]+type-prodotto/iu);
  const articleHtml = html.slice(articleStart >= 0 ? articleStart : 0);
  const relatedStart = articleHtml.search(/<section[^>]+(?:block-related|related)/iu);
  const productHtml = articleHtml.slice(0, relatedStart > 0 ? relatedStart : undefined);
  const name = decode(productHtml.match(/<h1[^>]+testata-title[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  const description = decode(productHtml.match(/<div[^>]+testata-testo[^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
  const officialProductId = productHtml.match(/<article[^>]+post-(\d+)/iu)?.[1]
    ?? new URL(italianSourceUrl).pathname.split("/").filter(Boolean).at(-1);
  const ogImage = decode(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/iu)?.[1]);
  const sizesHtml = productHtml.match(/<section[^>]+block-sizes[\s\S]*?<\/section>/iu)?.[0] ?? "";
  const imageUrls = [...new Set([
    ogImage,
    ...[...sizesHtml.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]+itemprop=["']image["']/giu)].map((match) => new URL(match[1], baseUrl).href),
  ].filter(Boolean))];
  const variants = [...productHtml.matchAll(/<figure[^>]+sizes-item[\s\S]*?<figcaption>([\s\S]*?)<\/figcaption>[\s\S]*?<\/figure>/giu)]
    .map((match) => {
      const caption = match[1];
      const manufacturerRef = decode(caption.match(/<div[^>]+font-sm[^>]+text-grey3[^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
      const label = decode(caption.match(/<h5[^>]*>([\s\S]*?)<\/h5>/iu)?.[1]);
      return { manufacturerRef, label: label || manufacturerRef };
    })
    .filter((variant) => variant.manufacturerRef);
  const fallbackRef = decode(productHtml.match(/gform_field_values[^>]+value=["'][^"']*%28([^%"']+)%29/iu)?.[1]);
  const manufacturerRefs = [...new Set([...variants.map((variant) => variant.manufacturerRef), fallbackRef].filter(Boolean))];
  const articleClass = productHtml.match(/<article[^>]+class=["']([^"']+)["']/iu)?.[1] ?? "";
  const categoryPath = [...articleClass.matchAll(/categoria-([^\s"']+)/gu)].map((match) => match[1].replaceAll("-", " ")).join(" > ");
  if (!name || !officialProductId) throw new Error(`${italianSourceUrl}: product identity not found`);
  return {
    officialProductId,
    brand: "MEDESY",
    manufacturer: "MEDESY s.r.l.",
    name,
    manufacturerRef: manufacturerRefs[0] ?? "",
    manufacturerRefs: manufacturerRefs.join(" | "),
    variantCount: Math.max(1, variants.length || manufacturerRefs.length),
    variants,
    categoryPath,
    description,
    sourceImageUrl: ogImage,
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl,
    italianSourceUrl,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_KAZAKHSTAN_MARKET",
    status: !imageUrls.length
      ? "PHOTO_REQUIRED"
      : !manufacturerRefs.length
        ? "MANUFACTURER_REFERENCE_REQUIRED"
        : "KZ_SKU_EVIDENCE_REQUIRED",
  };
});

const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "MEDESY",
  manufacturer: "MEDESY s.r.l.",
  sourceType: "MANUFACTURER_CATALOG",
  sourceUrl: sitemapUrls.join(" | "),
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    discoveredProducts: sourceUrls.length,
    crawledProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length,
  },
  errors,
  products,
};
const headers = [
  "officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount",
  "categoryPath", "description", "sourceImageUrl", "imageUrls", "imageCount", "kzEvidence", "status", "sourcePageUrl", "italianSourceUrl",
];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
