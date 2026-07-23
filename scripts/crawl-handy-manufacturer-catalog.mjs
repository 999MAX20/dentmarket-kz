import fs from "node:fs/promises";
import path from "node:path";

const productsUrl = "https://www.handyimaging.com/products/";
const jsonOutputPath = path.resolve("data/catalog-evidence/handy-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/handy-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }
const variantMap = {
  "digital-dental-x-ray-imaging-system-hdr-500600-product": ["HDR-500", "HDR-600"],
  "digital-dental-x-ray-imaging-system-hdr-360460-product": ["HDR-360", "HDR-460"],
  "intraoral-camera-hdi-200a-usb-2-0-100a-tv-product": ["HDI-200A (USB 2.0)", "HDI-100A (AV)"],
};
const categoryFor = (slug) => slug.includes("intraoral-camera") ? "Интраоральные камеры" : slug.includes("plate-scanner") ? "Сканеры фосфорных пластин" : slug.includes("x-ray-unit") ? "Портативные рентген-аппараты" : slug.includes("handy-ai") ? "Программное обеспечение для рентгенодиагностики" : "Интраоральные рентгеновские датчики";

const listing = await requestText(productsUrl);
const targets = [...new Set([...listing.matchAll(/href=["'](https:\/\/www\.handyimaging\.com\/([^"']+-product\/))["']/giu)].filter((match) => !match[2].startsWith("animal-")).map((match) => match[1]))];
const crawled = await pool(targets, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const slug = new URL(sourcePageUrl).pathname.split("/").filter(Boolean).pop();
  const name = decode(html.match(/<meta property=["']og:title["'] content=["']([^"']+)/iu)?.[1] || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]).replace(/\s*[-|–].*Handy.*$/iu, "");
  const description = decode(html.match(/<meta property=["']og:description["'] content=["']([^"']*)/iu)?.[1]);
  const sourceImageUrl = decode(html.match(/<meta property=["']og:image["'] content=["']([^"']+)/iu)?.[1] || html.match(/<img[^>]+src=["'](https:\/\/cdn\.globalso\.com\/handyimaging\/[^"']+)/iu)?.[1]);
  const variants = variantMap[slug] ?? [];
  return { officialProductId: `HANDY-${token(slug)}`, brand: "Handy", manufacturer: "Shanghai Handy Medical Equipment Co., Ltd.", name, manufacturerRef: "", manufacturerRefs: "", model: variants.length === 1 ? variants[0] : "", variantCount: Math.max(1, variants.length), variants: variants.map((variantName) => ({ name: variantName })), categoryPath: categoryFor(slug), description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "en"));
const report = { brand: "Handy", manufacturer: "Shanghai Handy Medical Equipment Co., Ltd.", sourceType: "OFFICIAL_CURRENT_HUMAN_DENTAL_PRODUCTS_PAGE", sourceUrl: productsUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { veterinaryProductsExcluded: true, everyHumanDentalProductPagePreserved: true, slashSeparatedModelsPreservedAsVariants: true, modelNamesNotAssumedToBeOrderCodes: true, exactOfficialImagesOnly: true, emsAirFlowHandyIsNotThisBrand: true }, totals: { discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
