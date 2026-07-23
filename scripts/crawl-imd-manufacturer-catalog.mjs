import fs from "node:fs/promises";
import path from "node:path";

const apiBaseUrl = "https://www.imdmedical.com:8443/website";
const catalogSourceUrl = "https://www.imdmedical.com/";
const jsonOutputPath = path.resolve("data/catalog-evidence/imd-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/imd-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.IMD_CONCURRENCY || 8));

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
const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

async function requestApi(pathname, data, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${apiBaseUrl}${pathname}`, {
        method: "POST",
        headers: { "content-type": "application/json", "accept-language": "en" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
      const payload = await response.json();
      if (payload.resultCode !== 200) throw new Error(`${pathname}: ${payload.message || payload.resultCode}`);
      return payload.data;
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
        output[index] = { officialProductId: items[index].productId, error: String(error) };
      }
    }
  }));
  return output;
}

const tree = await requestApi("/Product/queryCatalogue", { catalogueType: 1, catalogueId: 0 });
const discovered = [];
function walk(nodes, ancestors = []) {
  for (const node of nodes ?? []) {
    const categoryPath = [...ancestors, node.catalogueName].filter(Boolean);
    if (["Orthodontics", "Endodontics"].includes(categoryPath[0])) {
      for (const product of node.productData ?? []) discovered.push({ ...product, categoryPath: categoryPath.join(" > ") });
    }
    walk(node.children, categoryPath);
  }
}
walk(tree);
const uniqueProducts = [...new Map(discovered.map((product) => [product.productId, product])).values()];

const crawled = await pool(uniqueProducts, async (listedProduct) => {
  const detail = await requestApi("/Product/queryProduct", { productId: listedProduct.productId });
  const resources = parseJsonArray(detail.productResource);
  const detailImages = parseJsonArray(detail.productDetail);
  const imageUrls = [...new Set([
    detail.productCoverLink,
    ...resources.filter((item) => Number(item.fileType) === 2).map((item) => item.url),
    ...detailImages.filter((item) => Number(item.fileType) === 2).map((item) => item.url),
  ].filter(Boolean))];
  const name = decode(detail.productName || detail.productTitle || listedProduct.productName);
  if (!name) throw new Error(`product ${listedProduct.productId}: identity not found`);
  return {
    officialProductId: String(listedProduct.productId),
    brand: "IMD",
    manufacturer: "IMD Medical",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: 1,
    categoryPath: listedProduct.categoryPath,
    description: decode(detail.productIntro),
    imageUrls: imageUrls.join(" | "),
    imageCount: imageUrls.length,
    sourcePageUrl: `${catalogSourceUrl}#/particular?productId=${listedProduct.productId}`,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_STOMIR_KZ_CATALOG",
    status: imageUrls.length ? "MANUFACTURER_REFERENCE_AND_VARIANT_MATRIX_REQUIRED" : "PHOTO_REFERENCE_AND_VARIANT_MATRIX_REQUIRED",
  };
});

const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const report = {
  brand: "IMD",
  manufacturer: "IMD Medical",
  sourceType: "MANUFACTURER_CATALOG_API",
  sourceUrl: catalogSourceUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    discoveredProducts: uniqueProducts.length,
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
