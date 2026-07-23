import fs from "node:fs/promises";
import path from "node:path";

const sources = [
  { brand: "Aes", manufacturer: "Aes", url: "https://stomir.kz/catalog/breket-sistema/170223023330", file: "aes-kz-catalog.json", queue: "aes-kz-catalog-queue.csv" },
  { brand: "BIOLA", manufacturer: "BIOLA", url: "https://stomir.kz/catalog/odnorazovaya_produkciya/161213040549", file: "biola-kz-catalog.json", queue: "biola-kz-catalog-queue.csv" },
];
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return response.text(); }

for (const source of sources) {
  const html = await requestText(source.url);
  const nameBlock = html.match(/<div class=["']product-card-name["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1] ?? "";
  const names = [...nameBlock.matchAll(/(?:^|<span>)([^<]+)/giu)].map((match) => decode(match[1])).filter(Boolean);
  const name = names.at(-1) || names[0];
  const manufacturerRef = decode(html.match(/<div class=["']product-card-art["'][^>]*>\s*Артикул:\s*([^<]+)/iu)?.[1]);
  const country = decode(html.match(/<div class=["']product-card-country["'][^>]*>\s*Страна:\s*([^<]+)/iu)?.[1]);
  const imageUrls = [...new Set([...html.matchAll(/<ul id=["']product_imgs["'][\s\S]*?<\/ul>/giu)].flatMap((block) => [...block[0].matchAll(/<img[^>]+src=["']([^"']+)/giu)].map((match) => new URL(match[1], source.url).href)))];
  const optionBlock = html.match(/<select[^>]+id=["']product_addfield["'][^>]*>([\s\S]*?)<\/select>/iu)?.[1] ?? "";
  const variants = [...optionBlock.matchAll(/<option value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/giu)].map((match) => ({ sellerVariantId: decode(match[1]), name: decode(match[2]), manufacturerRef }));
  const description = decode(html.match(/<div class=["']content-block-header["']>Описание[\s\S]*?<div class=["']content-block-text["']>([\s\S]*?)<\/div>/iu)?.[1]);
  const product = { officialProductId: source.brand.toUpperCase() + "-" + token(manufacturerRef), brand: source.brand, manufacturer: source.manufacturer,
    name, manufacturerRef, manufacturerRefs: manufacturerRef, variantCount: variants.length, variants, country, categoryPath: "Стоматологические товары",
    description, sourceImageUrl: imageUrls[0] ?? "", imageUrls: imageUrls.join(" | "), imageCount: imageUrls.length, sourcePageUrl: source.url,
    kzEvidence: "EXACT_KZ_LISTING", status: imageUrls.length && manufacturerRef ? "CANONICAL_CONTENT_READY" : imageUrls.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
  const report = { brand: source.brand, manufacturer: source.manufacturer, sourceType: "KAZAKHSTAN_SPECIALIZED_RETAILER_EXACT_LISTING", sourceUrl: source.url,
    lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: 1, variantSkus: variants.length, productsWithReferences: manufacturerRef ? 1 : 0,
      productsWithImages: imageUrls.length ? 1 : 0 }, products: [product] };
  const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "country", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
  const csv = [headers.join(","), headers.map((header) => escapeCsv(product[header])).join(",")].join("\n") + "\n";
  const jsonPath = path.resolve("data/catalog-evidence", source.file); const queuePath = path.resolve("data/curation", source.queue);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true }); await fs.mkdir(path.dirname(queuePath), { recursive: true });
  await Promise.all([fs.writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queuePath, csv)]);
  console.log(source.brand, JSON.stringify(report.totals));
}
