import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://nordstom.kz";
const brandsUrl = `${baseUrl}/brand`;
const userAgent = "DentMarket Kazakhstan canonical catalog audit/1.0";
const concurrency = Math.max(1, Number(process.env.NORDSTOM_CONCURRENCY || 8));
const jsonOutputPath = path.resolve("data/catalog-evidence/nordstom-full-catalog.json");
const queueOutputPath = path.resolve("data/curation/nordstom-full-catalog-queue.csv");

const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&laquo;/giu, "«")
    .replace(/&raquo;/giu, "»")
    .replace(/&times;/giu, "×")
    .replace(/&Oslash;/giu, "Ø")
    .replace(/&micro;/giu, "µ")
    .replace(/&deg;/giu, "°")
    .replace(/&amp;/giu, "&")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/gu, " ")
    .trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const itemId = (url) => url.match(/item-(\d+)/u)?.[1] ?? "";

async function fetchHtml(url, attempts = 3) {
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
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError;
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        try {
          results[index] = await worker(items[index]);
        } catch (error) {
          results[index] = { error: String(error), input: items[index] };
        }
      }
    }),
  );
  return results;
}

function extractBrandName(html) {
  return decode(html.match(/Все товары бренда\s+"([^"]+)"/u)?.[1]);
}

function extractListedProducts(html) {
  const products = [];
  const pattern = /<a href="([^"]+item-\d+)" class="img"[^>]*><\/a><div class="brand">([\s\S]*?)<\/div>\s*<a href="[^"]+" class="title">([\s\S]*?)<\/a>/gu;
  for (const match of html.matchAll(pattern)) {
    products.push({
      sourcePageUrl: new URL(match[1], baseUrl).href,
      listedBrand: decode(match[2]),
      listedName: decode(match[3]),
    });
  }
  return [...new Map(products.map((product) => [product.sourcePageUrl, product])).values()];
}

function extractField(html, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decode(html.match(new RegExp(`${escaped}:\\s*<span class="v">([\\s\\S]*?)<\\/span>`, "u"))?.[1]);
}

function normalizeManufacturerReference(value) {
  const reference = decode(value);
  if (!reference || reference.length > 64) return "";
  if (!/\d/u.test(reference)) return "";
  if (reference.split(/\s+/u).length > 6) return "";
  if (!/^[\p{L}\d][\p{L}\d._/+\-]*(?:\s+[\p{L}\d._/+\-]+){0,5}$/u.test(reference)) return "";
  return reference;
}

async function readProduct(product) {
  const html = await fetchHtml(product.sourcePageUrl);
  const pageName = decode(html.match(/<h1 class="title">([\s\S]*?)<\/h1>/u)?.[1]);
  const pageBrand = extractField(html, "Бренд") || product.listedBrand;
  const manufacturerRef = normalizeManufacturerReference(extractField(html, "Артикул"));
  const sourceImagePath = html.match(
    /(?:href|src)=["']?(\/userfiles\/item\/\d+\/(?:fullimage|image)[^"')\s>]+)/iu,
  )?.[1];
  const summary = decode(html.match(/<div class="anons">([\s\S]*?)<\/div>/u)?.[1]);
  const category = new URL(product.sourcePageUrl).pathname.split("/").filter(Boolean)[1] ?? "";
  const name = pageName || product.listedName;
  const localId = itemId(product.sourcePageUrl);
  const hasIdentity = Boolean(manufacturerRef) || /(?=.*\d)[A-ZА-ЯЁ\d][A-ZА-ЯЁ\d._/+\-]{2,}/u.test(name);
  return {
    localId,
    brand: pageBrand,
    name,
    manufacturerRef,
    category,
    summary,
    sourcePageUrl: product.sourcePageUrl,
    sourceImageUrl: sourceImagePath ? new URL(sourceImagePath, baseUrl).href : "",
    status: manufacturerRef
      ? "SOURCE_REFERENCE_PRESENT"
      : hasIdentity
        ? "MODEL_PRESENT_REFERENCE_REVIEW_REQUIRED"
        : "REFERENCE_REQUIRED",
  };
}

const brandsIndexHtml = await fetchHtml(brandsUrl);
const brandIds = [...new Set([...brandsIndexHtml.matchAll(/href="\/brand\?id=(\d+)"/gu)].map((match) => match[1]))];
if (brandIds.length === 0) throw new Error("No NORD STOM brands found");

const brandPages = await pool(brandIds, async (brandId) => {
  const sourceUrl = `${brandsUrl}?id=${encodeURIComponent(brandId)}`;
  const html = await fetchHtml(sourceUrl);
  const brand = extractBrandName(html);
  if (!brand) throw new Error(`${sourceUrl}: brand name not found`);
  const products = extractListedProducts(html);
  if (products.length === 0) throw new Error(`${sourceUrl}: no products found`);
  return { brandId, brand, sourceUrl, products };
});
const brandErrors = brandPages.filter((page) => page?.error);
if (brandErrors.length) {
  throw new Error(`NORD STOM brand crawl failed: ${JSON.stringify(brandErrors)}`);
}

const listedProducts = brandPages.flatMap((page) => page.products);
const products = await pool(listedProducts, readProduct);
const productErrors = products.filter((product) => product?.error);
const acceptedProducts = products.filter((product) => !product?.error);
const duplicateKeys = acceptedProducts.reduce((groups, product) => {
  const key = `${product.brand}|${product.manufacturerRef || product.name}`.toLocaleLowerCase("ru");
  const group = groups.get(key) ?? [];
  group.push(product);
  groups.set(key, group);
  return groups;
}, new Map());
const duplicates = [...duplicateKeys.entries()].filter(([, group]) => group.length > 1);

const report = {
  source: "NORD STOM",
  market: "KZ",
  sourceUrl: brandsUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    brands: brandPages.length,
    listedProducts: listedProducts.length,
    crawledProducts: acceptedProducts.length,
    productErrors: productErrors.length,
    withManufacturerRef: acceptedProducts.filter((product) => product.manufacturerRef).length,
    withExactImage: acceptedProducts.filter((product) => product.sourceImageUrl).length,
    duplicates: duplicates.length,
  },
  brands: brandPages.map((page) => ({
    brandId: page.brandId,
    brand: page.brand,
    sourceUrl: page.sourceUrl,
    products: page.products.length,
  })),
  productErrors,
  duplicates: duplicates.map(([key, group]) => ({ key, urls: group.map((product) => product.sourcePageUrl) })),
  products: acceptedProducts,
};

const headers = [
  "localId",
  "brand",
  "name",
  "manufacturerRef",
  "category",
  "status",
  "sourcePageUrl",
  "sourceImageUrl",
  "summary",
];
const csv = [
  headers.join(","),
  ...acceptedProducts.map((product) => headers.map((header) => escapeCsv(product[header])).join(",")),
].join("\n") + "\n";

await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
