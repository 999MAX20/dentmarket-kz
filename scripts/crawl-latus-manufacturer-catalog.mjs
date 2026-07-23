import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const baseUrl = "https://www.latus.com.ua";
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";
const concurrency = Math.max(1, Number(process.env.LATUS_CONCURRENCY || 12));
const jsonOutputPath = path.resolve("data/catalog-evidence/latus-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/latus-manufacturer-catalog-queue.csv");
const categories = [
  ["dental-restorative-materials", "Dental restorative materials"],
  ["dental-liners", "Dental liners"],
  ["endodontic-filling-materials", "Endodontic filling materials"],
  ["prophylactic-medications", "Prophylactic medications"],
  ["dental-bonding", "Dental bonding"],
  ["auxiliary-materials", "Auxiliary materials"],
  ["temporary-filling", "Temporary filling"],
  ["orthopedic-dental-materials", "Orthopedic dental materials"],
  ["dental-technicians-materials", "Dental technicians materials"],
  ["materials-for-processing-and-polishing", "Materials for processing and polishing"],
  ["tools-and-accessories", "Tools and accessories"],
  ["instruments", "Instruments"],
];

const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
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

function extractVariants(description, primaryReference) {
  const text = String(description ?? "");
  const matches = [...text.matchAll(/\bREF(?:\s|:|№|#)+([A-Z0-9][A-Z0-9._/-]*)/giu)];
  const variants = matches.map((match, index) => {
    const reference = match[1].trim();
    const nextIndex = matches[index + 1]?.index ?? text.length;
    const rawLabel = text
      .slice((match.index ?? 0) + match[0].length, nextIndex)
      .split(/\b(?:Instruction(?:s)?\s+for\s+use|Picture\s+instruction(?:s)?)\b/iu)[0]
      .replace(/^[\s,;:/-]+|[\s,;:/-]+$/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    const label = rawLabel && rawLabel.length <= 140 ? rawLabel : `REF ${reference}`;
    return { reference, label };
  });
  if (primaryReference && !variants.some((variant) => variant.reference === primaryReference)) {
    variants.unshift({ reference: primaryReference, label: `REF ${primaryReference}` });
  }
  const unique = new Map();
  for (const variant of variants) unique.set(variant.reference, variant);
  return [...unique.values()];
}

function requestText(url, attempts = 4) {
  return new Promise((resolve, reject) => {
    const run = (attempt) => {
      const parsed = new URL(url);
      const client = parsed.protocol === "http:" ? http : https;
      const request = client.get(parsed, {
        headers: { "user-agent": userAgent },
        // The manufacturer site currently serves a certificate whose SAN does
        // not match the public hostname. This exception is scoped to this
        // read-only catalog crawler and does not affect application traffic.
        rejectUnauthorized: false,
        timeout: 25_000,
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        try {
          output[index] = await worker(items[index]);
        } catch (error) {
          output[index] = { sourcePageUrl: items[index].sourcePageUrl, error: String(error) };
        }
      }
    }),
  );
  return output;
}

async function discoverCategoryProducts(slug, category) {
  const products = new Map();
  for (let start = 0; start <= 900; start += 9) {
    const sourceUrl = `${baseUrl}/en/products/${slug}.html${start ? `?start=${start}` : ""}`;
    const html = await requestText(sourceUrl);
    const links = [...new Set(
      [...html.matchAll(new RegExp(`href=["'](/en/products/${slug}/[^"'?#]+\\.html)`, "giu"))]
        .map((match) => new URL(match[1], baseUrl).href),
    )];
    const before = products.size;
    for (const productUrl of links) products.set(productUrl, { sourcePageUrl: productUrl, category });
    if (links.length === 0 || products.size === before) break;
  }
  return [...products.values()];
}

const categoryProducts = [];
for (const [slug, category] of categories) {
  const products = await discoverCategoryProducts(slug, category);
  categoryProducts.push(...products);
  console.log(`LaTus ${category}: ${products.length}`);
}
const discovered = new Map();
for (const product of categoryProducts) discovered.set(product.sourcePageUrl, product);

async function readProduct(product) {
  const html = await requestText(product.sourcePageUrl);
  const detailStart = html.indexOf('<div class="jshop productfull">');
  const detailHtml = detailStart >= 0 ? html.slice(detailStart) : html;
  const name = decode(detailHtml.match(/<h1 class="pro-title">([\s\S]*?)<\/h1>/iu)?.[1]);
  const referenceText = decode(detailHtml.match(/id="product_code">([\s\S]*?)<\/span>/iu)?.[1]);
  const manufacturerRef = referenceText.replace(/^\(?\s*REF\s*/iu, "").replace(/\)\s*$/u, "").split(/\s*-\s*REF\s+/iu)[0].trim();
  const sourceImages = [...new Set(
    [...detailHtml.matchAll(/<a class="lightbox img-popup"[^>]*href="([^"]+)"/giu)]
      .map((match) => new URL(match[1], baseUrl).href),
  )];
  const summary = decode(detailHtml.match(/<div class="jshop_prod_short_description">([\s\S]*?)<\/div>/iu)?.[1]);
  const description = decode(detailHtml.match(/<div class="jshop_prod_description">([\s\S]*?)<\/div>/iu)?.[1]);
  const officialProductId = detailHtml.match(/id="product_id" value="(\d+)"/iu)?.[1] ?? "";
  if (!name || !officialProductId) throw new Error(`${product.sourcePageUrl}: official product identity not found`);
  const variants = extractVariants(description, manufacturerRef);
  const manufacturerRefs = variants.map((variant) => variant.reference).join(" | ");
  return {
    officialProductId,
    brand: "LaTus",
    manufacturer: "Private Enterprise «Latus»",
    name,
    manufacturerRef,
    manufacturerRefs,
    variants: variants.map((variant) => `${variant.label}=${variant.reference}`).join(" | "),
    variantCount: Math.max(1, variants.length),
    categoryPath: product.category,
    summary,
    description,
    imageUrls: sourceImages.join(" | "),
    imageCount: sourceImages.length,
    sourcePageUrl: product.sourcePageUrl,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_PRESENT_IN_STOMIR_KZ_CATALOG",
    status: manufacturerRef && sourceImages.length
      ? "OFFICIAL_PRODUCT_IDENTITY_READY_KZ_SKU_REVIEW_REQUIRED"
      : !manufacturerRef
        ? "MANUFACTURER_REFERENCE_REQUIRED"
        : "PHOTO_REQUIRED",
  };
}

const crawled = await pool([...discovered.values()], readProduct);
const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
const identityGroups = products.reduce((groups, product) => {
  const key = `${product.manufacturerRef || product.officialProductId}`.toLocaleLowerCase("en");
  const group = groups.get(key) ?? [];
  group.push(product);
  groups.set(key, group);
  return groups;
}, new Map());
const duplicateGroups = [...identityGroups.entries()].filter(([, group]) => group.length > 1);
const report = {
  brand: "LaTus",
  manufacturer: "Private Enterprise «Latus»",
  sourceType: "MANUFACTURER_CATALOG",
  sourceUrl: `${baseUrl}/en/products.html`,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    categories: categories.length,
    discoveredProducts: discovered.size,
    crawledProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRef).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    duplicateIdentityGroups: duplicateGroups.length,
    crawlErrors: errors.length,
  },
  errors,
  duplicateIdentities: duplicateGroups.map(([identity, group]) => ({
    identity,
    products: group.map(({ name, sourcePageUrl }) => ({ name, sourcePageUrl })),
  })),
  products,
};
const headers = [
  "officialProductId",
  "brand",
  "manufacturer",
  "name",
  "manufacturerRef",
  "manufacturerRefs",
  "variants",
  "variantCount",
  "categoryPath",
  "summary",
  "description",
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
