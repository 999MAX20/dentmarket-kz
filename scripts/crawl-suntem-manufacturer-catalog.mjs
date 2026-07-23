import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import https from "node:https";

const origin = "https://suntem.cn";
const categoryUrls = [`${origin}/en/dental/index.jhtml`, `${origin}/en/other/index.jhtml`];
const jsonOutputPath = path.resolve("data/catalog-evidence/suntem-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/suntem-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
function rawRequest(url, redirects = 3) { return new Promise((resolve, reject) => { const client = url.startsWith("https:") ? https : http; const request = client.get(url, { rejectUnauthorized: false, headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" } }, (response) => { if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects > 0) { response.resume(); resolve(rawRequest(new URL(response.headers.location, url).href, redirects - 1)); return; } if (response.statusCode !== 200) { response.resume(); reject(new Error(`${url}: HTTP ${response.statusCode}`)); return; } const chunks = []; response.on("data", (chunk) => chunks.push(chunk)); response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); }); request.setTimeout(30_000, () => request.destroy(new Error(`${url}: timeout`))); request.on("error", reject); }); }
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { return await rawRequest(url); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }
const modelFrom = (name) => decode(name).match(/(?:ST-[A-Z0-9]+|SIP-\d+)/iu)?.[0]?.toUpperCase() ?? "";

const categoryPages = await pool(categoryUrls, requestText);
const categoryErrors = categoryPages.filter((record) => record?.error);
const detailUrls = [...new Set(categoryPages.filter((record) => typeof record === "string").flatMap((html) => [...html.matchAll(/href=["'](?:https?:\/\/suntem\.cn)?(\/en\/(?:dental|other)\/\d+\.jhtml)["']/giu)].map((match) => new URL(match[1], origin).href)))];
const crawled = await pool(detailUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const name = decode(html.match(/<h3 class=["']h3["']>([\s\S]*?)<\/h3>/iu)?.[1]);
  const model = modelFrom(name);
  const body = html.match(/<div class=["'][^"']*(?:qui-detail|editor|content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1] ?? html.slice(html.indexOf(`<h3 class="h3">${name}`));
  const imageUrls = [...new Set([...body.matchAll(/<img src=["']([^"']+)/giu)].map((match) => new URL(match[1], origin).href).filter((url) => !/(?:logo|weixin|qrcode)/iu.test(url)))];
  const description = decode(body).slice(0, 5000);
  if (!name || !model) return { sourcePageUrl, skipped: "MODEL_IDENTITY_MISSING" };
  return { officialProductId: `SUNTEM-${model}`, brand: "Suntem", manufacturer: "Foshan Suntem Medical Instrument Co., Ltd.", name, manufacturerRef: model, manufacturerRefs: model, model, variantCount: 1, variants: [{ manufacturerRef: model }], categoryPath: sourcePageUrl.includes("/dental/") ? "Стоматологические установки" : "Стоматологическая водоподготовка", description, sourceImageUrl: imageUrls[0] || "", imageUrls: imageUrls.join(" | "), imageCount: imageUrls.length, sourcePageUrl, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: imageUrls.length ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = [...categoryErrors, ...crawled.filter((record) => record?.error)];
const skipped = crawled.filter((record) => record?.skipped);
const products = [...new Map(crawled.filter((record) => record && !record.error && !record.skipped).map((product) => [product.manufacturerRef, product])).values()].sort((a, b) => a.manufacturerRef.localeCompare(b.manufacturerRef, "en", { numeric: true }));
const report = { brand: "Suntem", manufacturer: "Foshan Suntem Medical Instrument Co., Ltd.", sourceType: "OFFICIAL_CURRENT_MANUFACTURER_DENTAL_PRODUCT_CATEGORIES", sourceUrl: categoryUrls.join(" | "), lastChecked: new Date().toISOString().slice(0, 10), policy: { allCurrentDentalUnitAndDentalSpecificOtherEquipmentPagesTraversed: true, entProductsExcluded: true, exactOfficialModelsPreserved: true, exactOfficialProductImagesOnly: true, kzAvailabilityRequiresSupplierEvidence: true }, totals: { categoryPages: categoryUrls.length, candidateUrls: detailUrls.length, discoveredProducts: products.length, productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, skippedPages: skipped.length, crawlErrors: errors.length }, skipped, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
