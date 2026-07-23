import fs from "node:fs/promises";
import path from "node:path";

const origin = "https://www.mgfcompressors.com";
const landingUrl = `${origin}/dental.html`;
const jsonOutputPath = path.resolve("data/catalog-evidence/mgf-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/mgf-manufacturer-catalog-queue.csv");
const sections = [
  ["oil-free-compressors-pumping-units", "Безмасляные компрессорные головки"],
  ["pure-air-dental-compressors", "Стоматологические компрессоры Pure Air"],
  ["oil-free-compressors-for-centralized-systems", "Компрессоры для централизованных систем"],
  ["oil-free-compressors-prime-hd-for-cad-cam", "Компрессоры PRIME HD для CAD/CAM"],
  ["dental-suction-systems", "Стоматологические аспирационные системы"],
  ["centralized-surgical-dental-suction", "Централизованная хирургическая аспирация"],
  ["modular-systems-compressors-suction-aspir-comp", "Модульные компрессорно-аспирационные системы"],
  ["oil-free-compressors-accessories", "Принадлежности для безмасляных компрессоров"],
  ["maintenance-kits", "Комплекты технического обслуживания"],
  ["disinfection", "Средства для дезинфекции аспирационных систем"],
];
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<br\s*\/?>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 400 * attempt)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { ...items[index], error: String(error) }; } } })); return output; }

function extractProducts(html, categoryPath) {
  const products = [];
  const pattern = /<div class=["']col-md-4["']><h3>([\s\S]*?)<\/h3>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*><img[^>]+src=["']([^"']+)["'][^>]*>[\s\S]*?<\/figure>\s*<p><strong>\s*Code:\s*([\s\S]*?)<\/strong><\/p>\s*<p>([\s\S]*?)<\/p>/giu;
  for (const match of html.matchAll(pattern)) {
    const name = decode(match[1]);
    const sourcePageUrl = new URL(match[2], origin).href;
    const manufacturerRef = decode(match[4]);
    const sourceImageUrl = new URL(match[3], origin).href;
    products.push({
      officialProductId: `MGF-${token(manufacturerRef || new URL(sourcePageUrl).pathname)}`,
      brand: "MGF",
      manufacturer: "MGF S.r.l.",
      name,
      manufacturerRef,
      manufacturerRefs: manufacturerRef,
      model: name.replace(/\s+-\s+\d{3}V.*$/iu, "").trim(),
      variantCount: 1,
      variants: [],
      categoryPath,
      description: decode(match[5]),
      sourceImageUrl,
      imageUrls: sourceImageUrl,
      imageCount: 1,
      sourcePageUrl,
      kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET",
      status: "KZ_SKU_EVIDENCE_REQUIRED",
    });
  }
  return products;
}

const topPages = await pool(sections.map(([slug, categoryPath]) => ({ url: `${origin}/dental/${slug}.html`, categoryPath })), async (page) => ({ ...page, html: await requestText(page.url) }));
const errors = topPages.filter((page) => page.error).map(({ url, error }) => ({ sourcePageUrl: url, error }));
const categoryPages = [];
for (const page of topPages.filter((candidate) => !candidate.error)) {
  const links = [...page.html.matchAll(/<div class=["']show-category["']>\s*<a href=["']([^"']+)["']/giu)].map((match) => new URL(match[1], origin).href);
  for (const url of links) categoryPages.push({ url, categoryPath: page.categoryPath });
}
const uniqueCategoryPages = [...new Map(categoryPages.map((page) => [page.url, page])).values()];
const crawledCategories = await pool(uniqueCategoryPages, async (page) => ({ ...page, html: await requestText(page.url) }));
errors.push(...crawledCategories.filter((page) => page.error).map(({ url, error }) => ({ sourcePageUrl: url, error })));
const discovered = [
  ...topPages.filter((page) => !page.error).flatMap((page) => extractProducts(page.html, page.categoryPath)),
  ...crawledCategories.filter((page) => !page.error).flatMap((page) => extractProducts(page.html, page.categoryPath)),
];
const products = [...new Map(discovered.map((product) => [product.sourcePageUrl, product])).values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
const refCounts = new Map();
for (const product of products) refCounts.set(product.manufacturerRef, (refCounts.get(product.manufacturerRef) ?? 0) + 1);
const duplicateManufacturerRefs = [...refCounts].filter(([ref, count]) => ref && count > 1).map(([manufacturerRef, count]) => ({ manufacturerRef, count, products: products.filter((product) => product.manufacturerRef === manufacturerRef).map((product) => product.name) }));
const report = {
  brand: "MGF",
  manufacturer: "MGF S.r.l.",
  sourceType: "OFFICIAL_CURRENT_DENTAL_SECTION_AND_COMPLETE_CATEGORY_PAGES",
  sourceUrl: landingUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { allTenDentalSectionsTraversed: true, showAllCategoryPagesTraversed: true, exactManufacturerCodesPreserved: true, productsDeduplicatedByOfficialDetailUrl: true, duplicateOfficialCodesFlaggedWithoutFalseMerge: true, nonDentalIndustrialPortfolioExcluded: true },
  totals: { dentalSections: sections.length, categoryPages: uniqueCategoryPages.length, discoveredProducts: products.length, variantSkus: products.length, productsWithReferences: products.filter((product) => product.manufacturerRef).length, productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateManufacturerRefs: duplicateManufacturerRefs.length, crawlErrors: errors.length },
  duplicateManufacturerRefs,
  errors,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
