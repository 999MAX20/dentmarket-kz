import fs from "node:fs/promises";
import path from "node:path";

const sourceUrl = "https://www.pierrot.es/productos/";
const apiUrl = "https://www.pierrot.es/wp-json/wp/v2/pages/335";
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";
const jsonOutputPath = path.resolve("data/catalog-evidence/pierrot-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/pierrot-manufacturer-catalog-queue.csv");

const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const response = await fetch(apiUrl, {
  headers: { "user-agent": userAgent },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`${apiUrl}: HTTP ${response.status}`);
const page = await response.json();
const html = String(page.content?.rendered ?? "");
if (!html) throw new Error("Pierrot product page has no rendered content");

const sectionMatches = [...html.matchAll(/<h2 class="elementor-heading-title[^"]*">([\s\S]*?)<\/h2>/giu)];
const products = [];
for (let sectionIndex = 0; sectionIndex < sectionMatches.length; sectionIndex += 1) {
  const section = sectionMatches[sectionIndex];
  const category = decode(section[1]);
  const sectionHtml = html.slice(
    section.index + section[0].length,
    sectionMatches[sectionIndex + 1]?.index ?? html.length,
  );
  const productMatches = [...sectionHtml.matchAll(
    /<img[^>]+src="([^"]+)"[^>]*>[\s\S]{0,2500}?<p class="elementor-heading-title[^"]*">([\s\S]*?)<\/p>/giu,
  )];
  for (let productIndex = 0; productIndex < productMatches.length; productIndex += 1) {
    const product = productMatches[productIndex];
    const name = decode(product[2]);
    const imageUrl = product[1];
    const followingHtml = sectionHtml.slice(
      product.index + product[0].length,
      productMatches[productIndex + 1]?.index ?? sectionHtml.length,
    );
    const description = decode(
      followingHtml.match(/elementor-widget-text-editor[\s\S]*?<div class="elementor-widget-container">([\s\S]*?)<\/div>/iu)?.[1],
    );
    if (!name || !imageUrl) continue;
    products.push({
      localId: `${category}-${name}`.toLocaleLowerCase("es").replace(/[^\p{L}\d]+/gu, "-").replace(/^-|-$/gu, ""),
      brand: "Pierrot",
      manufacturer: "Fushima, S.L.",
      name,
      categoryPath: category,
      description,
      manufacturerRef: "",
      imageUrls: imageUrl,
      imageCount: 1,
      sourcePageUrl: sourceUrl,
      kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_STOMIR_KZ_CATALOG",
      status: "OFFICIAL_PRODUCT_FAMILY_REFERENCE_AND_VARIANTS_REVIEW_REQUIRED",
    });
  }
}

const identities = new Set();
for (const product of products) {
  const key = `${product.categoryPath}|${product.name}`.toLocaleLowerCase("es");
  if (identities.has(key)) throw new Error(`Duplicate Pierrot product family: ${key}`);
  identities.add(key);
}
const report = {
  brand: "Pierrot",
  manufacturer: "Fushima, S.L.",
  sourceType: "MANUFACTURER_PRODUCT_FAMILIES",
  sourceUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    categories: sectionMatches.length,
    productFamilies: products.length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    productsWithDescriptions: products.filter((product) => product.description).length,
    referenceAndVariantReviewRequired: products.length,
  },
  products,
};
const headers = [
  "localId",
  "brand",
  "manufacturer",
  "name",
  "categoryPath",
  "description",
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
