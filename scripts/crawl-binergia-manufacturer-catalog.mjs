import fs from "node:fs/promises";
import path from "node:path";

const catalogUrl = "https://binergia.ru/catalog/";
const jsonOutputPath = path.resolve("data/catalog-evidence/binergia-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/binergia-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const catalogHtml = await requestText(catalogUrl);
const allUrls = [...new Set([...catalogHtml.matchAll(/<a class=["']medicine-card["'] href=["']([^"']+)/giu)].map((match) => new URL(decode(match[1]), catalogUrl).href))];
const productUrls = allUrls.filter((url) => {
  const pathname = new URL(url).pathname;
  return pathname.includes("/ukhod-za-polostyu-rta/") || pathname.includes("/stomatologiya/") || /artikain|mepivakain/iu.test(pathname);
});
const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const productId = html.match(/id=["']bx_\d+_(\d+)["'][^>]+itemscope/iu)?.[1];
  const baseName = decode(html.match(/<h2 class=["'][^"']*primary-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/iu)?.[1]);
  const specification = decode(html.match(/<span class=["']drug-title-info["'][^>]*>([\s\S]*?)<\/span>/iu)?.[1]);
  if (!productId || !baseName) throw new Error(sourcePageUrl + ": product identity not found");
  const name = specification && !baseName.includes(specification) ? baseName + " — " + specification : baseName;
  const rawImage = decode(html.match(/<div class=["']drug-photo["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)/iu)?.[1]);
  const sourceImageUrl = rawImage ? new URL(rawImage, sourcePageUrl).href : "";
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/iu)?.[1]);
  const registrationNumber = decode(html.match(/Регистрационный?\s+номер:<\/i><\/b>\s*([^<\r\n]+)/iu)?.[1] ?? html.match(/Регистрационн(?:ый|ый)\s+номер[^<]*<[^>]*>\s*([^<\r\n]+)/iu)?.[1]);
  const categoryPath = decode(html.match(/<div id=["']bx_breadcrumb_1["'][\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/iu)?.[1]);
  return { officialProductId: "BINERGIA-" + productId, brand: "Бинергия", manufacturer: "АО «Бинергия»", name,
    manufacturerRef: "", manufacturerRefs: "", registrationNumber, variantCount: 1, variants: [], categoryPath, description,
    sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const products = crawled.filter((record) => record && !record.error);
const report = { brand: "Бинергия", manufacturer: "АО «Бинергия»", sourceType: "OFFICIAL_RELEVANT_DENTAL_AND_ORAL_CARE_CATALOG", sourceUrl: catalogUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { catalogProducts: allUrls.length, relevantProductUrls: productUrls.length,
    discoveredProducts: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "registrationNumber", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
