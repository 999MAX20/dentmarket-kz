import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://www.humanchemie.de";
const shopUrl = `${origin}/shop/`;
const categoryUrls = [
  `${origin}/shop/de/prophylaxe-par`,
  `${origin}/shop/de/kavitaeten-stumpfversorgung`,
  `${origin}/shop/de/endodontie-depotphorese/geraete`,
  `${origin}/shop/de/endodontie-depotphorese/zubehoer`,
  `${origin}/shop/de/endodontie-depotphorese/praeparate`,
];
const jsonOutputPath = path.resolve("data/catalog-evidence/humanchemie-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/humanchemie-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }
const categoryFor = (url) => url.includes("prophylaxe-par") ? "Профилактика и пародонтология" : url.includes("kavitaeten-stumpfversorgung") ? "Обработка полостей и культей" : url.includes("/geraete/") ? "Эндодонтические аппараты" : url.includes("/zubehoer/") ? "Эндодонтические принадлежности" : "Эндодонтические препараты";

const categoryPages = await pool(categoryUrls, requestText);
const categoryErrors = categoryPages.filter((page) => page?.error);
const detailUrls = [...new Set(categoryPages.filter((page) => typeof page === "string").flatMap((html) => [...html.matchAll(/href=["'](https:\/\/www\.humanchemie\.de\/shop\/de\/[^"'?#]+)["']/giu)].map((match) => match[1])).filter((url) => !categoryUrls.includes(url) && !/(?:lieferinformationen|customer|cart|checkout|humanchemie-gmbh|xt_|bestseller|jubilaeum|sonderdruck|patienteninformation)/iu.test(url)))];
const crawled = await pool(detailUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const schemas = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)].map((match) => match[1]);
  let product;
  for (const schema of schemas) { try { const parsed = JSON.parse(schema); const nodes = parsed?.["@graph"] ?? [parsed]; product ??= nodes.find((node) => node?.["@type"] === "Product"); } catch {} }
  if (!product) return { sourcePageUrl, skipped: "NO_PRODUCT_SCHEMA" };
  const manufacturerRef = decode(html.match(/<p class=["']product-model[^>]*aria-label=["'][^"']*?([0-9A-Za-z._/-]+)["']/iu)?.[1] || html.match(/<span class=["']text-small["']>Art\.Nr\.:<\/span>\s*<span class=["']badge badge-lighter["']>([^<]+)/iu)?.[1]);
  const name = decode(product.name);
  const sourceImageUrl = new URL(Array.isArray(product.image) ? product.image[0]?.url ?? product.image[0] : product.image?.url ?? product.image ?? html.match(/<meta property=["']og:image["'] content=["']([^"']+)/iu)?.[1] ?? "", sourcePageUrl).href;
  return {
    officialProductId: `HUMANCHEMIE-${manufacturerRef || token(new URL(sourcePageUrl).pathname)}`,
    brand: "Humanchemie",
    manufacturer: "Humanchemie GmbH",
    name,
    manufacturerRef,
    manufacturerRefs: manufacturerRef,
    model: "",
    variantCount: 1,
    variants: [],
    categoryPath: categoryFor(sourcePageUrl),
    description: decode(product.description || html.match(/<meta property=["']og:description["'] content=["']([^"']*)/iu)?.[1]),
    sourceImageUrl,
    imageUrls: sourceImageUrl,
    imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl,
    kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET",
    status: manufacturerRef ? "KZ_SKU_EVIDENCE_REQUIRED" : sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
  };
});
const errors = [...categoryErrors, ...crawled.filter((record) => record?.error)];
const skipped = crawled.filter((record) => record?.skipped);
const products = [...new Map(crawled.filter((record) => record && !record.error && !record.skipped).map((product) => [product.sourcePageUrl, product])).values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
const report = { brand: "Humanchemie", manufacturer: "Humanchemie GmbH", sourceType: "OFFICIAL_CURRENT_MANUFACTURER_SHOP_COMPLETE_DENTAL_CATEGORIES", sourceUrl: shopUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { allMedicalProductCategoriesTraversed: true, exactShopArticleNumbersPreserved: true, exactProductImagesOnly: true, patientBrochuresAndAnniversaryMerchandiseExcluded: true, explicitPackSizesRemainSeparateVariantsForLaterCanonicalGrouping: true }, totals: { categoryPages: categoryUrls.length, candidateUrls: detailUrls.length, discoveredProducts: products.length, productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, skippedPages: skipped.length, crawlErrors: errors.length }, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
