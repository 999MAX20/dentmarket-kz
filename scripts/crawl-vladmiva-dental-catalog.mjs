import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.vladmiva.ru";
const sitemapUrl = `${baseUrl}/sitemap-iblock-15.xml`;
const concurrency = Math.max(1, Number(process.env.VLADMIVA_CONCURRENCY || 40));
const userAgent = "DentMarket Kazakhstan canonical manufacturer catalog audit/1.0";
const jsonOutputPath = path.resolve("data/catalog-evidence/vladmiva-dental-catalog.json");
const queueOutputPath = path.resolve("data/curation/vladmiva-dental-catalog-queue.csv");

const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&laquo;/giu, "«")
    .replace(/&raquo;/giu, "»")
    .replace(/&amp;/giu, "&")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/gu, " ")
    .trim();

const absoluteUrl = (value) => {
  if (!value) return "";
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return "";
  }
};

const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

async function fetchText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": userAgent },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
      }
    }
  }
  throw lastError;
}

async function pool(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        try {
          output[index] = await worker(items[index]);
        } catch (error) {
          output[index] = { sourceUrl: items[index], error: String(error) };
        } finally {
          completed += 1;
          if (completed % 500 === 0 || completed === items.length) {
            console.log(`VladMiVa pages: ${completed}/${items.length}`);
          }
        }
      }
    }),
  );
  return output;
}

function extractBreadcrumbs(html) {
  const section = html.match(/<section class="breadcrumbs[^>]*>([\s\S]*?)<\/section>/iu)?.[1] ?? "";
  return [...section.matchAll(/<(?:a|span)[^>]*class="breadcrumbs__item[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span)>/giu)]
    .map((match) => decode(match[1]))
    .filter(Boolean);
}

function extractBreadcrumbHrefs(html) {
  const section = html.match(/<section class="breadcrumbs[^>]*>([\s\S]*?)<\/section>/iu)?.[1] ?? "";
  return [...section.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="breadcrumbs__item/giu)]
    .map((match) => match[1]);
}

function extractImages(html) {
  const detail = html.match(/<div class="products-detail__image"[\s\S]*?<div class="products-detail__info">/iu)?.[0] ?? "";
  return [...new Set(
    [...detail.matchAll(/<a[^>]*href="([^"]+)"[^>]*class="products-slider__img/giu)]
      .map((match) => absoluteUrl(match[1]))
      .filter(Boolean),
  )];
}

function detectReviewReason(sourceUrl, title, description) {
  const text = `${sourceUrl} ${title} ${description}`.toLocaleLowerCase("ru");
  const reasons = [];
  if (/(?:не\s*использовать|ne-ispolzovat|остатк|ostatk|снят\w*\s+с\s+производств)/iu.test(text)) {
    reasons.push("POSSIBLE_DISCONTINUED_OR_INTERNAL");
  }
  if (/(?:книг|сувенир|подароч)/iu.test(text)) reasons.push("NON_PRODUCT_MERCHANDISE");
  return reasons;
}

function extractVariants(html) {
  const raw = html.match(/<div class="products-detail__artikul"[^>]*data-vendors='([^']+)'/iu)?.[1];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(
      raw
        .replace(/&quot;/giu, '"')
        .replace(/&amp;/giu, "&"),
    );
    return Object.entries(parsed)
      .map(([label, manufacturerRef]) => ({
        label: decode(label),
        manufacturerRef: decode(manufacturerRef),
      }))
      .filter((variant) => variant.label && variant.manufacturerRef);
  } catch {
    return [];
  }
}

async function readPage(sourceUrl) {
  const html = await fetchText(sourceUrl);
  const breadcrumbHrefs = extractBreadcrumbHrefs(html);
  const isDental = breadcrumbHrefs.some((href) => href === "/products/stomatologiya/");
  const hasProductDetail = /class="products-detail__artikul"/iu.test(html);
  if (!isDental || !hasProductDetail) {
    return { sourceUrl, skipped: true, skipReason: isDental ? "CATEGORY_PAGE" : "OUTSIDE_DENTISTRY" };
  }

  const title = decode(
    html.match(/<div class="products-detail__title hidden-sm">([\s\S]*?)<\/div>/iu)?.[1]
      ?? html.match(/<h1 class="products-detail__title visible-sm">([\s\S]*?)<\/h1>/iu)?.[1],
  );
  const manufacturerRef = decode(
    html.match(/<div class="products-detail__artikul"[^>]*>\s*Артикул:\s*([\s\S]*?)<\/div>/iu)?.[1],
  );
  if (!title || !manufacturerRef) throw new Error(`${sourceUrl}: product identity not found`);

  const infoBlock = html.match(/<div class="products-detail__info">([\s\S]*?)<section class="products-detail-tabs/iu)?.[1]
    ?? html.match(/<div class="products-detail__info">([\s\S]*?)<\/div>\s*<\/div>/iu)?.[1]
    ?? "";
  const description = decode(
    infoBlock.match(/<div class="products-detail__text">([\s\S]*?)<\/div>\s*(?:<a|<\/div>)/iu)?.[1],
  );
  const breadcrumbs = extractBreadcrumbs(html);
  const categoryPath = breadcrumbs.slice(2, -1).join(" > ");
  const images = extractImages(html);
  const variants = extractVariants(html);
  const registrationDocument = absoluteUrl(
    html.match(/<a[^>]*href="([^"]+)"[^>]*class="products-detail__documents"[\s\S]*?<span>\s*Регистрационное удостоверение/iu)?.[1],
  );
  const reviewReasons = detectReviewReason(sourceUrl, title, description);
  return {
    localId: sourceUrl.split("/").filter(Boolean).at(-1) ?? manufacturerRef,
    brand: "ВладМиВа",
    manufacturer: "АО «ОЭЗ «ВладМиВа»",
    name: title,
    manufacturerRef,
    manufacturerRefs: [...new Set([manufacturerRef, ...variants.map((variant) => variant.manufacturerRef)])].join(" | "),
    variants: variants.map((variant) => `${variant.label}=${variant.manufacturerRef}`).join(" | "),
    variantCount: variants.length || 1,
    categoryPath,
    description,
    imageUrls: images.join(" | "),
    imageCount: images.length,
    registrationDocument,
    sourcePageUrl: sourceUrl,
    kzEvidence: "BRAND_PRESENT_IN_KZ_CATALOG",
    status: reviewReasons.length
      ? "MANUAL_REVIEW_REQUIRED"
      : "OFFICIAL_DENTAL_PRODUCT_IDENTITY_READY",
    reviewReasons: reviewReasons.join(" | "),
  };
}

const sitemap = await fetchText(sitemapUrl);
const pageUrls = [...new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)]
    .map((match) => decode(match[1]))
    .filter((url) => {
      try {
        return new URL(url).pathname.startsWith("/products/");
      } catch {
        return false;
      }
    }),
)];
if (pageUrls.length === 0) throw new Error("VladMiVa sitemap contains no product pages");

const crawled = await pool(pageUrls, readPage);
const errors = crawled.filter((record) => record.error);
const skipped = crawled.filter((record) => record.skipped);
const products = crawled.filter((record) => !record.error && !record.skipped);
const identityGroups = products.reduce((groups, product) => {
  const key = product.manufacturerRef.toLocaleLowerCase("ru");
  const group = groups.get(key) ?? [];
  group.push(product);
  groups.set(key, group);
  return groups;
}, new Map());
const duplicateGroups = [...identityGroups.entries()].filter(([, group]) => group.length > 1);

const report = {
  brand: "ВладМиВа",
  manufacturer: "АО «ОЭЗ «ВладМиВа»",
  sourceType: "MANUFACTURER_DENTAL_CATALOG",
  sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    sitemapPages: pageUrls.length,
    dentalProducts: products.length,
    exactIdentityReady: products.filter((product) => product.status === "OFFICIAL_DENTAL_PRODUCT_IDENTITY_READY").length,
    manualReviewRequired: products.filter((product) => product.status === "MANUAL_REVIEW_REQUIRED").length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    duplicateReferenceGroups: duplicateGroups.length,
    skippedPages: skipped.length,
    crawlErrors: errors.length,
  },
  errors,
  duplicateReferences: duplicateGroups.map(([manufacturerRef, group]) => ({
    manufacturerRef,
    products: group.map(({ name, sourcePageUrl }) => ({ name, sourcePageUrl })),
  })),
  products,
};

const headers = [
  "localId",
  "brand",
  "manufacturer",
  "name",
  "manufacturerRef",
  "manufacturerRefs",
  "variants",
  "variantCount",
  "categoryPath",
  "description",
  "imageUrls",
  "imageCount",
  "registrationDocument",
  "kzEvidence",
  "status",
  "reviewReasons",
  "sourcePageUrl",
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
