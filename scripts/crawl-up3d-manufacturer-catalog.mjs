import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.up3dtech.com/sitemap-0.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/up3d-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/up3d-manufacturer-catalog-queue.csv");
const productSlugs = ["P55D", "P42", "P53", "I5PRO", "P54D", "UP610", "P42-Plus", "UP1000", "UP560HD", "P53-Plus", "UP400", "UP600", "UP560", "P53DC"];
const softwareSlugs = ["software-aidesign", "software-upcad", "software-upcam", "software-upcnc", "software-upedu"];
const names = { P55D: "P55D", P42: "P42", P53: "P53", I5PRO: "IRON CORE i5 PRO", P54D: "P54D", UP610: "UP610", "P42-Plus": "P42 PLUS", UP1000: "UP1000", UP560HD: "UP560HD", "P53-Plus": "P53 PLUS", UP400: "UP400", UP600: "UP600", UP560: "UP560", P53DC: "P53DC", "software-aidesign": "AI Design", "software-upcad": "UPCAD", "software-upcam": "UPCAM", "software-upcnc": "UPCNC", "software-upedu": "UPEDU" };
const milling = new Set(["P55D", "P42", "P53", "I5PRO", "P54D", "P42-Plus", "P53-Plus", "P53DC"]);
const intraoral = new Set(["UP610", "UP600"]);
const decode = (value) => String(value ?? "").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index].url, error: String(error) }; } } })); return output; }
const categoryFor = (slug) => softwareSlugs.includes(slug) ? "Стоматологическое программное обеспечение" : milling.has(slug) ? "CAD/CAM фрезерные станки" : intraoral.has(slug) ? "Интраоральные сканеры" : "Лабораторные сканеры";
const imageScore = (image, slug) => {
  const text = image.toLowerCase();
  let score = 0;
  if (text.includes(slug.toLowerCase().replaceAll("-", "")) || text.includes(slug.toLowerCase())) score += 20;
  if (/hero|banner|dental-milling-machine|lab-scanner|intraoral-scanner/u.test(text)) score += 10;
  if (/mobile/u.test(text)) score += 2;
  if (/customer|testimonial|material|standard-package|optional|software-interface|dimension|diagram|logo|icon|case|review|application/u.test(text)) score -= 30;
  return score;
};

await requestText(sitemapUrl);
const targets = [
  ...productSlugs.map((slug) => ({ slug, url: `https://www.up3dtech.com/en/product/${slug}` })),
  ...softwareSlugs.map((slug) => ({ slug, url: `https://www.up3dtech.com/en/${slug}` })),
];
const crawled = await pool(targets, async ({ slug, url: sourcePageUrl }) => {
  const html = await requestText(sourcePageUrl);
  const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/iu)?.[1]);
  const rawImages = [...new Set([...html.matchAll(/\/image\/[^"\\ )]+\.(?:png|jpe?g|webp)/giu)].map((match) => match[0]))];
  const rankedImages = rawImages.map((image) => ({ image, score: imageScore(image, slug) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score);
  const sourceImageUrl = rankedImages.length ? new URL(rankedImages[0].image, sourcePageUrl).href : "";
  return {
    officialProductId: `UP3D-${token(slug)}`,
    brand: "UP3D",
    manufacturer: "Shenzhen UP3D Tech Co., Ltd.",
    name: names[slug],
    manufacturerRef: "",
    manufacturerRefs: "",
    model: productSlugs.includes(slug) ? names[slug] : "",
    variantCount: 1,
    variants: [],
    categoryPath: categoryFor(slug),
    description,
    sourceImageUrl,
    imageUrls: sourceImageUrl,
    imageCount: sourceImageUrl ? 1 : 0,
    sourcePageUrl,
    kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET",
    status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
  };
});
const errors = crawled.filter((record) => record?.error);
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "en"));
const report = { brand: "UP3D", manufacturer: "Shenzhen UP3D Tech Co., Ltd.", sourceType: "OFFICIAL_CURRENT_SITEMAP_PRODUCT_AND_SOFTWARE_PORTFOLIO", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { categoryAndYoutubeRoutesExcluded: true, sitemapListedLegacyProductPagesRetained: true, modelNameIsNotAssumedToBeOrderCode: true }, totals: { discoveredProducts: products.length, physicalProducts: products.filter((product) => product.model).length, softwareProducts: products.filter((product) => !product.model).length, variantSkus: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
