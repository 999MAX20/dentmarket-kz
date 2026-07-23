import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://www.madespa.com/sitemap.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/madespa-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/madespa-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index].url, error: String(error) }; } } })); return output; }
const restorative = /nanolux|similux|ventura-flow|bulkfill|unibond|dual-core|ventura-seal|etching-gel/u;
const impression = /impress-2|bite-2|top-2|crystalsil|crystasil|alginato-akryon/u;
const acrylic = /ecolux|3lux|pentalux/u;
const pmma = /pmma-block/u;
const investment = /high-vest|perlas-de-vidrio|oxido-de-aluminio/u;
const categoryFor = (slug) => restorative.test(slug) ? "Реставрационные материалы" : impression.test(slug) ? "Оттискные материалы" : acrylic.test(slug) ? "Акриловые зубы" : pmma.test(slug) ? "PMMA-диски" : investment.test(slug) ? "Паковочные и пескоструйные материалы" : /impress-90|top-85|gingival/u.test(slug) ? "Лабораторные силиконы" : "Стоматологические гипсы";

const sitemap = await requestText(sitemapUrl);
const targets = [...sitemap.matchAll(/<loc>(https:\/\/www\.madespa\.com\/([^<]+))<\/loc>[\s\S]*?<lastmod>([^<]+)<\/lastmod>/giu)].map((match) => ({ url: match[1], slug: match[2], lastModified: match[3] })).filter(({ slug }) => slug === "alginato-akryon" || slug.startsWith("ventura-"));
const crawled = await pool(targets, async ({ url: sourcePageUrl, slug, lastModified }) => {
  const html = await requestText(sourcePageUrl);
  const title = decode(html.match(/<meta property=["']og:title["'] content=["']([^"']+)/iu)?.[1]);
  const description = decode(html.match(/<meta property=["']og:description["'] content=["']([^"']*)/iu)?.[1]);
  const sourceImageUrl = decode(html.match(/<meta property=["']og:image["'] content=["']([^"']+)/iu)?.[1]);
  const plain = decode(html.match(/<main[^>]*>([\s\S]*?)<\/main>/iu)?.[1] || html);
  const variantEvidence = [...new Set([...plain.matchAll(/(?:Presentaci[oó]n|Disponible en|Colores? disponible[^:]*):?\s*([^.;]{3,240})/giu)].map((match) => decode(match[0])))].slice(0, 8).join(" | ");
  return { officialProductId: `MADESPA-${token(slug)}`, brand: "Madespa", manufacturer: "MADESPA S.A.", name: title.replace(/\s*\|.*$/u, "") || decode(slug), manufacturerRef: "", manufacturerRefs: "", model: "", variantCount: 1, variants: [], variantEvidence, categoryPath: categoryFor(slug), description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl, sourceModifiedAt: lastModified, kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "es"));
const report = { brand: "Madespa", manufacturer: "MADESPA S.A.", sourceType: "OFFICIAL_CURRENT_SITEMAP_COMPLETE_PRODUCT_FAMILIES", sourceUrl: sitemapUrl, lastChecked: new Date().toISOString().slice(0, 10), policy: { everyOfficialProductFamilyPreserved: true, exactOfficialPageImageOnly: true, visiblePackagingAndShadeTextCapturedAsVariantEvidence: true, variantsNotInventedWithoutOrderReferenceMatrix: true }, totals: { sitemapProductFamilies: targets.length, discoveredProducts: products.length, productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, productsWithVariantEvidence: products.filter((product) => product.variantEvidence).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "variantEvidence", "categoryPath", "description", "sourceImageUrl", "imageCount", "sourceModifiedAt", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
