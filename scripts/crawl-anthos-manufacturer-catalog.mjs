import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.anthos.it";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/anthos-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/anthos-manufacturer-catalog-queue.csv");
const listingPages = [
  ["/en/accessories/lamps/", "Освещение"],
  ["/en/accessories/imaging/", "Стоматологическая визуализация"],
  ["/en/accessories/stools/", "Стулья врача и ассистента"],
  ["/en/accessories/consumables/", "Расходные материалы для оборудования"],
  ["/en/accessories/handpieces-and-instruments/", "Наконечники и инструменты"],
  ["/en/accessories/hygiene/", "Гигиена стоматологической установки"],
  ["/en/sterilization/autoclaves", "Автоклавы"],
  ["/en/sterilization/dental-thermal-sealers", "Упаковочное оборудование"],
  ["/en/sterilization/rotary-device-maintenance", "Обслуживание наконечников"],
  ["/en/sterilization/thermal-disinfectors", "Термодезинфекторы"],
];
const softwarePages = [
  ["/en/anthos-connect/remote-assistance-and-easy-check", "Remote assistance / EasyCheck"],
  ["/en/anthos-connect/diva", "Di.V.A."],
  ["/en/anthos-connect/irys", "iRYS"],
  ["/en/anthos-connect/neowise", "Neowise"],
];
const dentalUnitNames = new Map([
  ["/en/dental-units/a3/", "A3"], ["/en/dental-units/a5/", "A5"], ["/en/dental-units/a6/", "A6 PLUS"],
  ["/en/dental-units/a7/", "A7 PLUS"], ["/en/dental-units/l9/", "L9"], ["/en/dental-units/l6/", "L6"],
  ["/en/dental-units/r7/", "R7"], ["/en/dental-units/cart-chirurgico", "Surgical carts"], ["/en/dental-units/c9", "C9"],
]);
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<script[\s\S]*?<\/script>/giu, " ").replace(/<style[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
const meta = (html, property) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)`, "iu"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "iu"))?.[1]);
const capacityVariants = (text) => {
  const match = text.match(/(?:volumes?|capacities)[^.!]{0,100}?\b(17)\s*,\s*(22)\s*,?\s*(?:and\s+)?(28)\s+litres?/iu);
  return match ? [17, 22, 28].map((litres) => ({ variantId: `${litres}L`, label: `${litres} л`, volume: `${litres} л`, manufacturerRef: "" })) : [];
};
const record = ({ name, categoryPath, description, sourceImageUrl, sourcePageUrl, variants = [] }) => ({
  officialProductId: `ANTHOS-${token(name)}`, brand: "Anthos", manufacturer: "Cefla S.C.", name,
  manufacturerRef: "", manufacturerRefs: "", variantCount: Math.max(1, variants.length), variants,
  categoryPath, description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0,
  sourcePageUrl, kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
  status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
});

const sitemap = await requestText(sitemapUrl);
const officialEnglishUrls = new Set([...sitemap.matchAll(/<loc>(https:\/\/www\.anthos\.it\/en\/[^<]+)<\/loc>/giu)].map((match) => decode(match[1])));
const sitemapImages = new Map([...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/giu)].map((match) => {
  const sourcePageUrl = decode(match[1].match(/<loc>([^<]+)<\/loc>/iu)?.[1]);
  const sourceImageUrl = decode(match[1].match(/<image:loc>([^<]+)<\/image:loc>/iu)?.[1]);
  return [sourcePageUrl, sourceImageUrl];
}).filter(([sourcePageUrl, sourceImageUrl]) => sourcePageUrl && sourceImageUrl));
const products = [];
const errors = [];
for (const [pathname, categoryPath] of listingPages) {
  const sourcePageUrl = new URL(pathname, baseUrl).href;
  try {
    const html = await requestText(sourcePageUrl);
    const grid = [...html.matchAll(/class=["']hero-detail-product["'][\s\S]*?<a href=["']#([^"']+)["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][\s\S]*?class=["']hero-detail-product-content["'][^>]*>([\s\S]*?)<\/div>/giu)];
    for (const match of grid) {
      const [, anchor, image, rawName] = match;
      const name = decode(rawName).replace(/^Accessorio HMD/iu, "HMD accessory");
      const anchorMarker = new RegExp(`<div id=["']${anchor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "iu");
      const sectionStart = html.search(anchorMarker);
      const nextStart = sectionStart >= 0 ? html.slice(sectionStart + 1).search(/<div id=["'][^"']+["'] class=["']module-anchor-id["']/iu) : -1;
      const section = sectionStart >= 0 ? html.slice(sectionStart, nextStart >= 0 ? sectionStart + 1 + nextStart : undefined) : "";
      const description = decode(section).slice(0, 4000) || meta(html, "description");
      const sourceImageUrl = new URL(decode(image), baseUrl).href;
      products.push(record({ name, categoryPath, description, sourceImageUrl, sourcePageUrl: `${sourcePageUrl}#${anchor}`, variants: capacityVariants(description) }));
    }
  } catch (error) { errors.push({ sourcePageUrl, error: String(error) }); }
}

for (const [pathname, name] of dentalUnitNames) {
  const sourcePageUrl = new URL(pathname, baseUrl).href;
  try {
    const html = await requestText(sourcePageUrl);
    const sourceImageUrl = meta(html, "og:image") || sitemapImages.get(sourcePageUrl) || sitemapImages.get(sourcePageUrl.replace(/\/$/u, "")) || "";
    const description = meta(html, "description") || decode(html.match(/class=["']hero-detail-abstract["'][^>]*>([\s\S]*?)<\/div>/iu)?.[1]);
    const variants = ["Continental", "International"].filter((label) => new RegExp(`>\s*${label}\s*<`, "iu").test(html)).map((label) => ({ variantId: token(label), label, configuration: label, manufacturerRef: "" }));
    products.push(record({ name, categoryPath: "Стоматологические установки", description, sourceImageUrl, sourcePageUrl, variants }));
  } catch (error) { errors.push({ sourcePageUrl, error: String(error) }); }
}

for (const [pathname, name] of softwarePages) {
  const sourcePageUrl = new URL(pathname, baseUrl).href;
  try {
    const html = await requestText(sourcePageUrl);
    products.push(record({ name, categoryPath: "Программное обеспечение", description: meta(html, "description"), sourceImageUrl: meta(html, "og:image"), sourcePageUrl }));
  } catch (error) { errors.push({ sourcePageUrl, error: String(error) }); }
}

products.sort((a, b) => a.categoryPath.localeCompare(b.categoryPath, "ru") || a.name.localeCompare(b.name, "en"));
const duplicateIds = [...new Set(products.map((product) => product.officialProductId).filter((id, index, all) => all.indexOf(id) !== index))];
const report = { brand: "Anthos", manufacturer: "Cefla S.C.", sourceType: "OFFICIAL_CURRENT_ENGLISH_SITEMAP_AND_PRODUCT_PAGES", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { officialEnglishUrls: officialEnglishUrls.size, discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: 0,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateOfficialProductIds: duplicateIds.length,
    crawlErrors: errors.length }, errors, duplicateIds, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
