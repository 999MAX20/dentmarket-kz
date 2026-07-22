import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.ztdental.com";
const apiUrl = `${baseUrl}/Designer/Common/GetData`;
const concurrency = Math.max(1, Number(process.env.ZTDENTAL_CONCURRENCY || 10));
const userAgent = "Mozilla/5.0 (compatible; DentMarket Kazakhstan manufacturer catalog audit/1.0)";
const jsonOutputPath = path.resolve("data/catalog-evidence/ztdental-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/ztdental-manufacturer-catalog-queue.csv");
const categories = new Map([
  ["1057976", "Matrix materials"],
  ["1058814", "Rubber dam"],
  ["1058965", "Finishing and polishing"],
  ["1059349", "Other dental materials"],
  ["1060194", "X-ray systems"],
  ["1060570", "Impression materials"],
  ["1060576", "Infection control"],
  ["1060653", "Other dental products"],
]);

const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
const absoluteUrl = (value) => {
  if (!value) return "";
  const normalized = value.startsWith("//") ? `https:${value}` : value;
  try {
    return new URL(normalized, baseUrl).href;
  } catch {
    return "";
  }
};
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

async function fetchText(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "user-agent": userAgent, ...(options.headers ?? {}) },
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        try {
          output[index] = await worker(items[index]);
        } catch (error) {
          output[index] = { officialProductId: items[index].officialProductId, sourcePageUrl: items[index].sourcePageUrl, error: String(error) };
        }
      }
    }),
  );
  return output;
}

function decodeDocumentWrite(source) {
  const payload = source.match(/^\s*document\.write\('([\s\S]*)'\);?\s*$/u)?.[1];
  if (!payload) return "";
  return payload
    .replace(/\\u([0-9a-f]{4})/giu, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\r/gu, "\r")
    .replace(/\\n/gu, "\n")
    .replace(/\\t/gu, "\t")
    .replace(/\\'/gu, "'")
    .replace(/\\"/gu, '"')
    .replace(/\\\//gu, "/")
    .replace(/\\\\/gu, "\\");
}

async function fetchCategoryPage(categoryId, pageIndex) {
  const body = new URLSearchParams({
    dataType: "product",
    key: "",
    pageIndex: String(pageIndex),
    pageSize: "10",
    selectCategory: categoryId,
    selectId: "",
    dateFormater: "yyyy-MM-dd",
    orderByField: "createtime",
    orderByType: "asc",
    templateId: "0",
    postData: "",
    es: "false",
    setTop: "true",
  });
  const text = await fetchText(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = JSON.parse(text);
  if (!result.IsSuccess || !Array.isArray(result.Data)) {
    throw new Error(`ZT Dental category ${categoryId}, page ${pageIndex}: invalid API response`);
  }
  return result;
}

const listedProducts = new Map();
for (const [categoryId, category] of categories) {
  const firstPage = await fetchCategoryPage(categoryId, 0);
  const totalPages = Math.max(1, Number(firstPage.TotalPages || 1));
  const pages = [firstPage];
  for (let pageIndex = 1; pageIndex < totalPages; pageIndex += 1) {
    pages.push(await fetchCategoryPage(categoryId, pageIndex));
  }
  for (const item of pages.flatMap((page) => page.Data)) {
    const officialProductId = String(item.Id ?? "");
    if (!officialProductId) continue;
    const existing = listedProducts.get(officialProductId);
    const categoriesForProduct = new Set(existing?.categories ?? []);
    categoriesForProduct.add(category);
    listedProducts.set(officialProductId, {
      officialProductId,
      name: decode(item.Name),
      categories: [...categoriesForProduct],
      primaryImageUrl: absoluteUrl(item.PicUrl),
      sourcePageUrl: absoluteUrl(item.LinkUrl),
    });
  }
}

async function readProduct(product) {
  const pageHtml = await fetchText(product.sourcePageUrl);
  const bodyAssetUrl = absoluteUrl(
    pageHtml.match(/<script src=['"]([^'"]+\.Body\.js[^'"]*)['"]/iu)?.[1],
  );
  if (!bodyAssetUrl) throw new Error(`${product.sourcePageUrl}: body asset not found`);
  const detailHtml = decodeDocumentWrite(await fetchText(bodyAssetUrl));
  if (!detailHtml) throw new Error(`${product.sourcePageUrl}: product body could not be decoded`);
  const officialName = decode(detailHtml.match(/<h1 class="w-title">([\s\S]*?)<\/h1>/iu)?.[1]) || product.name;
  const detailBlock = detailHtml.match(/<!--product detail-->([\s\S]*?)<!--\/product detail-->/iu)?.[1] ?? "";
  const detailImages = [...new Set(
    [...detailBlock.matchAll(/<img[^>]*src="([^"]+)"/giu)]
      .map((match) => absoluteUrl(match[1]))
      .filter(Boolean),
  )];
  const imageUrls = [...new Set([product.primaryImageUrl, ...detailImages].filter(Boolean))];
  return {
    officialProductId: product.officialProductId,
    brand: "ZT Dental",
    manufacturer: "ZT Dental",
    name: officialName,
    categoryPath: product.categories.join(" | "),
    manufacturerRef: "",
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl: product.sourcePageUrl,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_STOMIR_KZ_CATALOG",
    status: "OFFICIAL_PRODUCT_REFERENCE_REVIEW_REQUIRED",
  };
}

const crawled = await pool([...listedProducts.values()], readProduct);
const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "ZT Dental",
  manufacturer: "ZT Dental",
  sourceType: "MANUFACTURER_CATALOG",
  sourceUrl: `${baseUrl}/products1`,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    categoryCount: categories.size,
    listedProducts: listedProducts.size,
    crawledProducts: products.length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    referenceReviewRequired: products.length,
    crawlErrors: errors.length,
  },
  errors,
  products,
};
const headers = [
  "officialProductId",
  "brand",
  "manufacturer",
  "name",
  "categoryPath",
  "manufacturerRef",
  "imageUrls",
  "imageCount",
  "kzEvidence",
  "status",
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
