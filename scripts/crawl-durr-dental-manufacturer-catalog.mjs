import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.duerrdental.com/en/sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/durr-dental-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/durr-dental-manufacturer-catalog-queue.csv");
const concurrency = 8;

const decode = (value) => String(value ?? "")
  .replace(/&nbsp;|&#160;/giu, " ")
  .replace(/&amp;/giu, "&")
  .replace(/&quot;/giu, '"')
  .replace(/&#0?39;|&apos;/giu, "'")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/<br\s*\/?\s*>/giu, " ")
  .replace(/<[^>]+>/gu, " ")
  .replace(/\s+/gu, " ")
  .trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const stableToken = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();

async function requestText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" },
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw lastError;
}

async function pool(items, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { output[index] = await worker(items[index]); }
      catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; }
    }
  }));
  return output;
}

function largestImage(block) {
  const candidates = [];
  for (const match of block.matchAll(/[srcset=["']([^"']+)["']/giu)) {
    for (const entry of match[1].split(",")) {
      const parts = entry.trim().split(/\s+/u);
      const width = Number(parts[1]?.replace(/\D/gu, "") || 0);
      if (parts[0]) candidates.push({ url: decode(parts[0]), width });
    }
  }
  if (candidates.length) return candidates.sort((a, b) => b.width - a.width)[0].url;
  return decode(block.match(/<img[^>]+src=["']([^"']+)["']/iu)?.[1]);
}

function productBlocks(html) {
  const starts = [...html.matchAll(/<div\s+id=["']c\d+["']\s+class=["'][^"']*_block-product-details[^"']*["'][^>]*>/giu)];
  return starts.map((match, index) => {
    const start = match.index;
    const nextTopBlock = html.slice(start + match[0].length).search(/\n<div\s+id=["']c\d+["']\s+class=["'][^"']*_block/giu);
    const end = nextTopBlock < 0 ? html.length : start + match[0].length + nextTopBlock;
    return html.slice(start, end);
  });
}

function categoryPath(html) {
  const breadcrumb = html.match(/<ol class=["']breadcrumb-menu["'][\s\S]*?<\/ol>/iu)?.[0] ?? "";
  const names = [...breadcrumb.matchAll(/<span[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>/giu)].map((match) => decode(match[1]));
  return names.slice(0, -1).join(" > ");
}

function downloadCenterProducts(html) {
  const script = html.match(/<script class=["'][^"']*download-center-list-block-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/script>/iu)?.[1];
  if (!script) return [];
  try {
    const payload = JSON.parse(script);
    return Array.isArray(payload.products) ? payload.products.map((product) => decode(product.name || product.id)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function resolveImageUrl(value, sourcePageUrl) {
  if (!value) return "";
  try { return new URL(decode(value), sourcePageUrl).href; }
  catch { return ""; }
}

function mainProductPage(html, sourcePageUrl, category) {
  const models = downloadCenterProducts(html);
  if (!models.length) return [];
  const pageTitle = decode(html.match(/<h1 class=["']h1["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1])
    .replace(/^The NEW\s+/iu, "")
    .replace(/:\s+taking\s+.*$/iu, "")
    .replace(/\.\s+(?:Built|Next|Sterilisation)\b.*$/iu, "")
    .replace(/\s+[–—]\s+[^–—]+\s*$/u, "")
    .trim();
  const name = models.length === 1 ? models[0] : pageTitle || models[0];
  const heroBlock = html.match(/<div\s+id=["']c\d+["']\s+class=["'][^"']*_block-fullscreen-background[^"']*["'][^>]*>([\s\S]*?)(?=\n<div\s+id=["']c\d+["'])/iu)?.[0] ?? "";
  const backgroundImage = heroBlock.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/iu)?.[1];
  const sourceImageUrl = resolveImageUrl(backgroundImage, sourcePageUrl) || resolveImageUrl(largestImage(heroBlock), sourcePageUrl);
  const introduction = html.match(/_block-introduction[^>]*>[\s\S]*?<div class=["']content["'][^>]*>([\s\S]*?)(?=<\/div>)/iu)?.[1] ?? "";
  const description = decode(introduction);
  const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).at(-1);
  return [{
    officialProductId: `DURR-${stableToken(slug)}`,
    brand: "Dürr Dental",
    manufacturer: "DÜRR DENTAL SE",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: models.length,
    variants: models.map((label) => ({ manufacturerRef: "", label })),
    categoryPath: category,
    description,
    sourceImageUrl,
    imageUrls: sourceImageUrl,
    imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
  }];
}

const sitemap = await requestText(sitemapUrl);
const productUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))]
  .filter((url) => new URL(url).pathname.startsWith("/en/products/"));
const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const category = categoryPath(html);
  const detailBlocks = productBlocks(html);
  if (!detailBlocks.length) return mainProductPage(html, sourcePageUrl, category);
  return detailBlocks.map((block, index) => {
    const name = decode(block.match(/<h2 class=["']h3["'][^>]*>([\s\S]*?)<\/h2>/iu)?.[1]);
    if (!name) throw new Error(`${sourcePageUrl}: product detail block without name`);
    const textBlock = block.match(/<div class=["']product-details-text["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1] ?? "";
    const description = decode(textBlock);
    const sourceImageUrl = largestImage(block);
    const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).at(-1);
    return {
      officialProductId: `DURR-${stableToken(slug)}${index ? `-${index + 1}` : ""}`,
      brand: "Dürr Dental",
      manufacturer: "DÜRR DENTAL SE",
      name,
      manufacturerRef: "",
      manufacturerRefs: "",
      variantCount: 0,
      variants: [],
      categoryPath: category,
      description,
      sourceImageUrl,
      imageUrls: sourceImageUrl,
      imageCount: sourceImageUrl ? 1 : 0,
      sourcePageUrl,
      kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
      status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
    };
  });
});

const errors = crawled.filter((record) => record.error);
const rawDiscovered = crawled.filter((record) => !record.error).flat();
const standaloneNames = new Set(rawDiscovered.filter((product) => !product.variants.length).map((product) => stableToken(product.name)));
const discovered = rawDiscovered.filter((product) => !(
  product.variants.length > 1
  && product.variants.every((variant) => standaloneNames.has(stableToken(variant.label)))
));
const byIdentity = new Map();
for (const product of discovered) {
  const identity = stableToken(product.name);
  const previous = byIdentity.get(identity);
  if (!previous || product.sourcePageUrl.length > previous.sourcePageUrl.length || (!previous.sourceImageUrl && product.sourceImageUrl)) byIdentity.set(identity, product);
}
const products = [...byIdentity.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
const duplicateBlocksRemoved = discovered.length - products.length;
const report = {
  brand: "Dürr Dental",
  manufacturer: "DÜRR DENTAL SE",
  sourceType: "MANUFACTURER_PRODUCT_SITEMAP_AND_PRODUCT_DETAIL_BLOCKS",
  sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    sitemapProductUrls: productUrls.length,
    pagesWithProductDetails: crawled.filter((record) => Array.isArray(record) && record.length).length,
    discoveredProductBlocks: rawDiscovered.length,
    aggregatePagesExcluded: rawDiscovered.length - discovered.length,
    duplicateBlocksRemoved,
    uniqueProducts: products.length,
    productsWithReferences: 0,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length,
  },
  errors,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
