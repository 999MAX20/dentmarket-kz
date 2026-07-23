import fs from "node:fs/promises";
import path from "node:path";

const listingUrl = "https://www.ajaxdent.com/en/ba10f23a64294204.html";
const jsonOutputPath = path.resolve("data/catalog-evidence/ajax-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/ajax-manufacturer-catalog-queue.csv");
const categoryPages = [
  ["https://www.ajaxdent.com/en/site-page/cdceedcd3a8e4ec1.html", "Стулья врача и ассистента", /^(?:D|N)\d+\s+Dental Stool$/iu],
  ["https://www.ajaxdent.com/en/site-page/19b851c2563d45bd.html", "Безмасляные компрессоры", /^(?:BA|AT|UA)\d+\s+Air Compressor$/iu],
  ["https://www.ajaxdent.com/en/site-page/f20099522d454846.html", "Аспирационные системы", /^(?:PV|SV|SP)\d+(?:\s|$)/iu],
  ["https://www.ajaxdent.com/en/site-page/cf61d9996bae4774.html", "Комплектующие стоматологических установок", /(?:Foot Control|Cuspidor|Backrest)$/iu],
  ["https://www.ajaxdent.com/en/site-page/73d1453037f243f1.html", "Стоматологическая визуализация", /^(?:AJX\d+|Digital X-ray Imaging System|Dental lmage Plate Scanner)$/iu],
];
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const model = (name) => {
  const text = decode(name);
  const floorMounted = text.match(/^AJ(\d+)\s+Floor Mounted/iu);
  if (floorMounted) return `AJ${floorMounted[1]}FM`;
  return text.match(/^(AJ\d+(?:FM)?|[DN]\d+|(?:BA|AT|UA|PV|SV|SP|AJX)\d+|FT-?\d+)/iu)?.[1]?.toUpperCase().replaceAll("-", "") ?? "";
};
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
const headings = (html) => [...html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/giu)].map((match) => decode(match[1])).filter(Boolean);
const images = (html) => [...html.matchAll(/<img\b[^>]*>/giu)].map((match) => ({ alt: decode(match[0].match(/alt=["']([^"']*)/iu)?.[1]), sourceImageUrl: decode(match[0].match(/src=["']([^"']*)/iu)?.[1]) })).filter((image) => image.sourceImageUrl && !/logo|icon/iu.test(image.alt));
const exactImage = (name, pageImages) => {
  const productModel = model(name); if (!productModel) return "";
  const normalizedImages = pageImages.map((image) => ({ ...image, normalizedAlt: image.alt.toUpperCase().replaceAll("-", "") }));
  const exact = normalizedImages.find((image) => image.normalizedAlt.includes(productModel));
  if (exact) return exact.sourceImageUrl;
  if (productModel.endsWith("FM")) return normalizedImages.find((image) => image.normalizedAlt.includes(productModel.slice(0, -2)) && /落地|FLOOR/iu.test(image.alt))?.sourceImageUrl ?? "";
  if (productModel.startsWith("SV")) return normalizedImages.find((image) => /^SV\.[A-Z]+$/iu.test(image.alt))?.sourceImageUrl ?? "";
  return "";
};
const makeRecord = ({ name, categoryPath, sourcePageUrl, sourceImageUrl, statusNote = "" }) => { const manufacturerRef = model(name); return {
  officialProductId: `AJAX-${manufacturerRef || token(name)}`, brand: "Ajax", manufacturer: "Guangzhou Ajax Medical Equipment Co., Ltd.", name,
  manufacturerRef, manufacturerRefs: manufacturerRef, variantCount: 1, variants: [], categoryPath, description: "", sourceImageUrl,
  imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, statusNote,
  kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: sourceImageUrl && manufacturerRef ? "KZ_SKU_EVIDENCE_REQUIRED" : sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
}; };

const listingHtml = await requestText(listingUrl);
const listingImages = images(listingHtml);
const unitNames = [...new Set(headings(listingHtml).filter((name) => /^AJ\d+.*Dental Unit$/iu.test(name)))];
const products = unitNames.map((name) => makeRecord({ name, categoryPath: "Стоматологические установки", sourcePageUrl: listingUrl,
  sourceImageUrl: exactImage(name, listingImages), statusNote: /^AJ17/iu.test(name) ? "OFFICIAL_LISTING_LINKS_TO_AJ21_DETAIL_PAGE_REVIEW_REQUIRED" : "" }));

const detailLinks = [...new Set([...listingHtml.matchAll(/href=["'](\/en\/site-page\/[^"']+\.html)["']/giu)].map((match) => new URL(match[1], listingUrl).href))];
for (const sourcePageUrl of detailLinks) {
  const html = await requestText(sourcePageUrl);
  const title = decode(html.match(/<title[^>]*>([^<]+)/iu)?.[1]).replace(/\s*-\s*Ajax dental\s*$/iu, "");
  if (!/^AJ\d+(?:FM|\s|$)/iu.test(title)) continue;
  const name = `${title} Dental Unit`.replace(/\s+Dental Unit\s+Dental Unit$/iu, " Dental Unit");
  if (products.some((product) => model(product.name) === model(name))) continue;
  const pageImages = images(html);
  products.push(makeRecord({ name, categoryPath: "Стоматологические установки", sourcePageUrl, sourceImageUrl: exactImage(name, pageImages) || exactImage(name, listingImages) }));
}

for (const [sourcePageUrl, categoryPath, namePattern] of categoryPages) {
  const html = await requestText(sourcePageUrl);
  const pageImages = images(html);
  for (const name of [...new Set(headings(html).filter((heading) => namePattern.test(heading)))]) {
    products.push(makeRecord({ name, categoryPath, sourcePageUrl, sourceImageUrl: exactImage(name, pageImages) }));
  }
}
const dedupedProducts = [...new Map(products.map((product) => [product.officialProductId, product])).values()].sort((a, b) => a.categoryPath.localeCompare(b.categoryPath, "ru") || a.name.localeCompare(b.name, "en"));
const duplicateRefs = [...new Set(products.map((product) => product.manufacturerRef).filter((ref, index, all) => ref && all.indexOf(ref) !== index))];
const report = { brand: "Ajax", manufacturer: "Guangzhou Ajax Medical Equipment Co., Ltd.", sourceType: "OFFICIAL_CURRENT_PRODUCT_LISTING_AND_CATEGORY_PAGES", sourceUrl: listingUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: dedupedProducts.length, productsWithReferences: dedupedProducts.filter((product) => product.manufacturerRef).length,
    productsWithImages: dedupedProducts.filter((product) => product.imageCount > 0).length, productsQueuedForPhoto: dedupedProducts.filter((product) => product.imageCount === 0).length,
    duplicateManufacturerRefs: duplicateRefs.length, officialIdentityConflicts: dedupedProducts.filter((product) => product.statusNote).length, crawlErrors: 0 }, duplicateRefs, products: dedupedProducts };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "statusNote", "sourcePageUrl"];
const csv = [headers.join(","), ...dedupedProducts.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
