import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://cormed.ru";
const catalogUrl = `${baseUrl}/products/`;
const jsonOutputPath = path.resolve("data/catalog-evidence/cormed-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/cormed-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.CORMED_CONCURRENCY || 8));
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";

const decodeHtml = (value) => String(value ?? "")
  .replace(/<br\s*\/?\s*>/giu, " ")
  .replace(/<[^>]+>/gu, " ")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&amp;/giu, "&")
  .replace(/&quot;/giu, '"')
  .replace(/&#39;|&apos;/giu, "'")
  .replace(/&ndash;/giu, "–")
  .replace(/&mdash;/giu, "—")
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
      return new TextDecoder("windows-1251").decode(await response.arrayBuffer());
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
        output[index] = { sourcePageUrl: items[index].sourcePageUrl ?? items[index], error: String(error) };
      }
    }
  }));
  return output;
}

const catalogHtml = await requestText(catalogUrl);
const categoryUrls = [...new Set(
  [...catalogHtml.matchAll(/href=["']([^"']*\/products\/[^"'?#]+\/)["']/giu)]
    .map((match) => new URL(match[1], baseUrl).href.replace(/^http:/u, "https:"))
    .filter((url) => new URL(url).pathname.split("/").filter(Boolean).length === 2),
)];

const categoryPages = await pool(categoryUrls, async (sourcePageUrl) => ({ sourcePageUrl, html: await requestText(sourcePageUrl) }));
const categoryErrors = categoryPages.filter((record) => record.error);
const discovered = new Map();
for (const categoryPage of categoryPages.filter((record) => !record.error)) {
  const categoryName = decodeHtml([...categoryPage.html.matchAll(/<h1>([\s\S]*?)<\/h1>/giu)].at(-1)?.[1]);
  const categoryPath = new URL(categoryPage.sourcePageUrl).pathname.split("/").filter(Boolean).at(-1);
  const detailUrls = [...new Set(
    [...categoryPage.html.matchAll(/href=["']([^"']*\/products\/[^"'?#]+\/[^"'?#]+\/)["']/giu)]
      .map((match) => new URL(match[1], baseUrl).href.replace(/^http:/u, "https:")),
  )];
  for (const sourcePageUrl of detailUrls) discovered.set(sourcePageUrl, { sourcePageUrl, categoryName, categoryPath });
  if (detailUrls.length === 0) {
    discovered.set(categoryPage.sourcePageUrl, {
      sourcePageUrl: categoryPage.sourcePageUrl,
      categoryName,
      categoryPath,
      isSeriesPage: true,
    });
  }
}

const crawled = await pool([...discovered.values()], async (product) => {
  const html = await requestText(product.sourcePageUrl);
  const headings = [...html.matchAll(/<h1>([\s\S]*?)<\/h1>/giu)].map((match) => decodeHtml(match[1]));
  const name = headings.at(-1);
  const contentStart = html.lastIndexOf("<h1>");
  const contentEnd = html.indexOf('<div class="clear">', contentStart);
  const contentHtml = html.slice(contentStart, contentEnd > contentStart ? contentEnd : undefined);
  const imageUrls = [...new Set(
    [...contentHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/giu)]
      .map((match) => new URL(match[1], baseUrl).href.replace(/^http:/u, "https:"))
      .filter((url) => url.includes("/upload/") && !url.includes("banner_")),
  )];
  const description = decodeHtml(contentHtml).replace(name, "").trim();
  const referenceMatches = [...description.matchAll(/\b([0-9]{2}(?:\.[0-9]{2}){1,2}[A-ZА-Я]?)\b/gu)];
  const referenceSet = new Set(referenceMatches.map((match) => match[1].toLocaleUpperCase("ru")));
  const nameReference = name?.match(/^([0-9]+(?:\.[0-9]+)+(?:[A-ZА-Я])?)\s*[-–—]/u)?.[1] ?? "";
  if (nameReference) referenceSet.add(nameReference.toLocaleUpperCase("ru"));
  const manufacturerReferences = [...referenceSet];
  const manufacturerRef = nameReference || manufacturerReferences[0] || "";
  const variants = manufacturerReferences.map((reference) => {
    const paragraph = [...contentHtml.matchAll(/<(?:p|li)[^>]*>([\s\S]*?)<\/(?:p|li)>/giu)]
      .map((match) => decodeHtml(match[1]))
      .find((text) => text.toLocaleUpperCase("ru").includes(reference));
    const label = paragraph && paragraph.length <= 220 ? paragraph : `REF ${reference}`;
    return `${label}=${reference}`;
  });
  const officialProductId = new URL(product.sourcePageUrl).pathname.split("/").filter(Boolean).slice(-2).join("/");
  if (!name || !officialProductId) throw new Error(`${product.sourcePageUrl}: product identity not found`);
  return {
    officialProductId,
    brand: "Кормед",
    manufacturer: "ООО «Кормед-Р»",
    name,
    manufacturerRef,
    manufacturerRefs: manufacturerReferences.join(" | "),
    variants: variants.join(" | "),
    variantCount: Math.max(1, manufacturerReferences.length),
    categoryPath: product.categoryName || product.categoryPath,
    description,
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl: product.sourcePageUrl,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_STOMIR_KZ_CATALOG",
    status: manufacturerReferences.length && imageUrls.length
      ? "OFFICIAL_PRODUCT_IDENTITY_READY_KZ_SKU_REVIEW_REQUIRED"
      : !manufacturerRef
        ? "MANUFACTURER_REFERENCE_REQUIRED"
        : "PHOTO_REQUIRED",
  };
});

const errors = [...categoryErrors, ...crawled.filter((record) => record.error)];
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "Кормед",
  manufacturer: "ООО «Кормед-Р»",
  sourceType: "MANUFACTURER_CATALOG",
  sourceUrl: catalogUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    categories: categoryUrls.length,
    discoveredProducts: discovered.size,
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
  "variants", "variantCount", "categoryPath", "description", "imageUrls", "imageCount", "kzEvidence", "status", "sourcePageUrl",
];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
