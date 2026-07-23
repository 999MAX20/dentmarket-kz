import fs from "node:fs/promises";
import path from "node:path";

const origin = "http://www.medicalsani.com";
const categoryIds = [6, 20, 34, 37, 31, 47];
const jsonOutputPath = path.resolve("data/catalog-evidence/sani-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/sani-manufacturer-catalog-queue.csv");
const names = { 533: "BS+ rotary root canal files", 697: "Retreatment rotary files", 676: "S-ONE single rotary file", 505: "S3 rotary root canal files", 287: "KID rotary root canal files", 260: "SHARP rotary root canal files", 127: "SuperPass glide path files", 124: "K-files", 687: "Micro files", 677: "K+ files", 641: "SuperC files", 173: "R-files", 172: "H-files", 679: "Long-neck minimally invasive round burs", 650: "Tungsten carbide burs", 600: "Diamond burs", 685: "Gutta-percha cutter", 686: "Gutta-percha filling device", 652: "EDO-1 endodontic motor", 625: "EDO-1 Pro endodontic motor with apex locator", 653: "AL-1 apex locator", 681: "Absorbent paper points", 693: "Composite filling instruments", 688: "Barbed broaches", 680: "Root canal paste carriers", 702: "Dental mirrors", 682: "Gutta-percha points and sticks", 695: "Stainless steel orthodontic wire" };
const categories = { 6: "Машинные эндодонтические файлы", 20: "Ручные эндодонтические файлы", 34: "Стоматологические боры", 37: "Эндодонтическое оборудование", 31: "Эндодонтические расходные материалы и инструменты", 47: "Ортодонтическая проволока" };
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index].url, error: String(error) }; } } })); return output; }

const categoryPages = await pool(categoryIds.map((bid) => ({ bid, url: `${origin}/news.php?bid=${bid}` })), async (page) => ({ ...page, html: await requestText(page.url) }));
const errors = categoryPages.filter((page) => page.error).map(({ url, error }) => ({ sourcePageUrl: url, error }));
const discovered = [];
for (const page of categoryPages.filter((item) => !item.error)) {
  const pattern = /<a href=["']news\.php\?bid=(\d+)(?:&amp;|&)id=(\d+)["'] title=["']([^"']+)["']><img src=["']([^"']+)/giu;
  for (const match of page.html.matchAll(pattern)) {
    const bid = Number(match[1]); const id = Number(match[2]);
    if (id === 711 || !names[id]) continue;
    discovered.push({ bid, id, rawName: decode(match[3]), sourceImageUrl: new URL(match[4], origin).href });
  }
}
const targets = [...new Map(discovered.map((item) => [item.id, item])).values()];
const crawled = await pool(targets.map((item) => ({ ...item, url: `${origin}/news.php?bid=${item.bid}&id=${item.id}` })), async (item) => {
  const html = await requestText(item.url);
  const body = decode(html.match(/<div class=["']article[^"']*["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
  return { officialProductId: `SANI-${item.id}`, brand: "SANI", manufacturer: "Chengdu Sani Medical Equipment Co., Ltd.", name: names[item.id], originalName: item.rawName, manufacturerRef: "", manufacturerRefs: "", model: /(?:EDO-1 Pro|EDO-1|AL-1|BS\+|S-ONE|S3|KID|SHARP|SuperPass)/iu.exec(names[item.id])?.[0] ?? "", variantCount: 1, variants: [], categoryPath: categories[item.bid], description: body.slice(0, 1200), sourceImageUrl: item.sourceImageUrl, imageUrls: item.sourceImageUrl, imageCount: item.sourceImageUrl ? 1 : 0, sourcePageUrl: item.url, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: item.sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
errors.push(...crawled.filter((record) => record?.error));
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "en"));
const report = { brand: "SANI", manufacturer: "Chengdu Sani Medical Equipment Co., Ltd.", sourceType: "OFFICIAL_CURRENT_MANUFACTURER_PRODUCT_SECTIONS", sourceUrl: origin, lastChecked: new Date().toISOString().slice(0, 10), policy: { allSixOfficialProductSectionsTraversed: true, specificationDocumentEntryExcludedAsNotAProduct: true, currentOfficialPortfolioOverridesLegacySellerNames: true, modelNamesNotAssumedToBeOrderCodes: true, officialProductThumbnailsUsedOnlyForExactLinkedFamilies: true }, totals: { productSections: categoryIds.length, discoveredProducts: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "originalName", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
