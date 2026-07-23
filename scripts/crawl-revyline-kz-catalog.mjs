import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://revyline.kz/index.php?route=extension/feed/google_sitemap";
const jsonOutputPath = path.resolve("data/catalog-evidence/revyline-kz-catalog.json");
const queueOutputPath = path.resolve("data/curation/revyline-kz-catalog-queue.csv");
const concurrency = 8;
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
const absolute = (value, base) => value ? new URL(decode(value), base).href : "";

async function requestText(url, attempts = 3) {
  let error;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(url + ": HTTP " + response.status);
      return await response.text();
    } catch (caught) {
      error = caught;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw error;
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

const stripStoreSuffix = (value) => decode(value)
  .replace(/\s+и по всему Казахстану в интернет-магазине Revyline\.kz\s*$/iu, "")
  .replace(/,?\s*купить в магазине Revyline\..*$/iu, "")
  .trim();

const sitemap = await requestText(sitemapUrl);
const productUrls = [...new Set([...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/giu)]
  .filter((match) => /<priority>1\.0<\/priority>/u.test(match[1]))
  .map((match) => decode(match[1].match(/<loc>([^<]+)<\/loc>/iu)?.[1]))
  .filter(Boolean))];

const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  if (!/<body class=["']product-product-/iu.test(html)) return null;
  const canonicalUrl = absolute(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/iu)?.[1] ?? sourcePageUrl, sourcePageUrl);
  const name = stripStoreSuffix(html.match(/<h1[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/h1>/iu)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/iu)?.[1]);
  const manufacturerRef = decode(html.match(/<div class=["']product-scu["'][^>]*>\s*арт\.\s*([^<]+)/iu)?.[1]);
  if (!name || !manufacturerRef) throw new Error(sourcePageUrl + ": product identity not found");
  const sourceImageUrl = absolute(html.match(/<input[^>]+value=["']([^"']+)["'][^>]+class=["']thumb_big/iu)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/iu)?.[1], sourcePageUrl);
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/iu)?.[1]);
  const categoryPath = [...html.matchAll(/<li[^>]+itemprop=["']itemListElement["'][\s\S]*?<span[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/li>/giu)]
    .map((match) => decode(match[1])).filter((part) => part && part !== "Главная").join(" > ");
  const imageUrls = [...new Set([...html.matchAll(/<input[^>]+value=["']([^"']+)["'][^>]+class=["']thumb_big/giu)].map((match) => absolute(match[1], sourcePageUrl)))];
  const variationHtml = html.match(/<div class=["']product-content-top-right-variations["'][^>]*>([\s\S]*?)<div class=["']product-content-top-right-specifications/iu)?.[1] ?? "";
  const relatedUrls = [...new Set([...variationHtml.matchAll(/href=["']([^"']+)["']/giu)].map((match) => absolute(match[1], sourcePageUrl)).filter((url) => url.startsWith("https://revyline.kz/")))];
  const attributes = Object.fromEntries([...html.matchAll(/<div class=["']product-attribute-item["'][^>]*>[\s\S]*?<span[^>]*itemprop=["']name["'][^>]*>([\s\S]*?)<\/span>[\s\S]*?<div[^>]+itemprop=["']value["'][^>]*>([\s\S]*?)<\/div>/giu)]
    .map((match) => [decode(match[1]), decode(match[2])]).filter(([key, value]) => key && value));
  return { canonicalUrl, sourcePageUrl, name, manufacturerRef, sourceImageUrl, imageUrls, description, categoryPath, relatedUrls, attributes };
});

const errors = crawled.filter((record) => record?.error);
const skusByUrl = new Map();
const skusByRef = new Map();
for (const sku of crawled.filter((record) => record && !record.error)) {
  const previous = skusByRef.get(sku.manufacturerRef);
  if (!previous || sku.imageUrls.length > previous.imageUrls.length) skusByRef.set(sku.manufacturerRef, sku);
}
for (const sku of skusByRef.values()) {
  skusByUrl.set(sku.canonicalUrl, sku);
  skusByUrl.set(sku.sourcePageUrl, sku);
}

const parent = new Map([...skusByRef.keys()].map((ref) => [ref, ref]));
const find = (ref) => { const next = parent.get(ref); if (next === ref) return ref; const root = find(next); parent.set(ref, root); return root; };
const join = (left, right) => { const a = find(left); const b = find(right); if (a !== b) parent.set(b, a); };
for (const sku of skusByRef.values()) for (const relatedUrl of sku.relatedUrls) {
  const related = skusByUrl.get(relatedUrl);
  if (related) join(sku.manufacturerRef, related.manufacturerRef);
}
const seriesIdentity = (name) => {
  const normalized = decode(name);
  const match = normalized.match(/^(.*?)\bRevyline\b\s*(.*)$/iu);
  if (!match) return token(normalized);
  const type = token(match[1]);
  const tail = match[2].trim();
  if (!tail) return type + "-REVYLINE";
  const model = tail.match(/^((?:RL\s*\d+|RL\d+|SM\d+|S\d+)(?:\s+(?:Basic|Plus|Kids|Baby|Infant|Duo|PRO|Ortho|Single|interspace))?|Smart(?:\s+L-type)?|Organic\s+Detox|Perfect|ChocoWhite|Sheep\s*3\+|[A-Za-zА-Яа-я0-9-]+)/iu)?.[1] ?? tail;
  return type + "-REVYLINE-" + token(model);
};
const groups = new Map();
for (const sku of skusByRef.values()) {
  const groupKey = find(sku.manufacturerRef) + "::" + seriesIdentity(sku.name);
  if (!groups.has(groupKey)) groups.set(groupKey, []);
  groups.get(groupKey).push(sku);
}

const commonFamilyName = (variants) => {
  if (variants.length === 1) return variants[0].name;
  const tokenized = variants.map((variant) => variant.name.split(/\s+/u));
  const prefix = [];
  for (let index = 0; index < Math.min(...tokenized.map((parts) => parts.length)); index += 1) {
    const values = tokenized.map((parts) => parts[index].replace(/[,.]+$/u, "").toLocaleLowerCase("ru"));
    if (!values.every((value) => value === values[0])) break;
    prefix.push(tokenized[0][index]);
  }
  const candidate = prefix.join(" ").replace(/[,:;+-]+$/u, "").trim();
  return candidate.length >= 12 ? candidate : variants[0].name;
};

const products = [...groups.values()].map((members) => {
  const variants = members.sort((a, b) => a.name.localeCompare(b.name, "ru")).map((sku) => ({
    manufacturerRef: sku.manufacturerRef, name: sku.name, sourceImageUrl: sku.sourceImageUrl,
    imageUrls: sku.imageUrls, sourcePageUrl: sku.sourcePageUrl, attributes: sku.attributes,
  }));
  const familyName = commonFamilyName(variants);
  const images = [...new Set(variants.flatMap((variant) => variant.imageUrls))];
  return {
    officialProductId: "REVYLINE-" + token(familyName) + "-" + members[0].manufacturerRef,
    brand: "Revyline", manufacturer: "Revyline LLC", name: familyName,
    manufacturerRef: variants.length === 1 ? variants[0].manufacturerRef : "",
    manufacturerRefs: variants.map((variant) => variant.manufacturerRef).join(" | "),
    variantCount: variants.length, variants, categoryPath: members[0].categoryPath,
    description: members[0].description, sourceImageUrl: members[0].sourceImageUrl,
    imageUrls: images.join(" | "), imageCount: images.length, sourcePageUrl: members[0].sourcePageUrl,
    kzEvidence: "EXACT_KZ_LISTING", status: images.length ? "CANONICAL_CONTENT_READY" : "PHOTO_REQUIRED",
  };
}).sort((a, b) => a.name.localeCompare(b.name, "ru"));

const duplicateRefs = [...skusByRef.keys()].filter((ref, index, all) => all.indexOf(ref) !== index);
const report = {
  brand: "Revyline", manufacturer: "Revyline LLC", sourceType: "OFFICIAL_KAZAKHSTAN_PRODUCT_SITEMAP",
  sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10),
  totals: { sitemapProductUrls: productUrls.length, discoveredProducts: products.length, variantSkus: skusByRef.size,
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    productsWithoutImages: products.filter((product) => product.imageCount === 0).length,
    duplicateManufacturerRefs: duplicateRefs.length, crawlErrors: errors.length },
  errors, products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
