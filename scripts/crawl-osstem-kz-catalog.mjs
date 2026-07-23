import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://osstem.kz";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/osstem-kz-catalog.json");
const queueOutputPath = path.resolve("data/curation/osstem-kz-catalog-queue.csv");
const userAgent = "DentMarket Kazakhstan exact KZ catalog audit/1.0";

const productRoots = [
  "/sistema-implantatov-/implantaty-ts/",
  "/sistema-implantatov-/implantaty-et/",
  "/sistema-implantatov-/implantaty-ms/",
  "/sistema-implantatov-/protetika/",
  "/nkr-11/membrany/",
  "/nkr-11/kostnyj-material/",
  "/nkr-11/autobone-collector/",
  "/oborudovanie-/stomatologicheskaya-ustanovka-kz/",
  "/oborudovanie-/3d-rentgen-apparat-t1/",
  "/oborudovanie-/fiziodispenser-sm5/",
  "/oborudovanie-/vnutrirotovaya-kamera-snap/",
  "/hirurgicheskie-nabory-/hirurgiya-po-shablonam/",
  "/hirurgicheskie-nabory-/dlya-ustanovki-implantatov/",
  "/hirurgicheskie-nabory-/dlya-kostnoj-plastiki/",
  "/hirurgicheskie-nabory-/dlya-ortodonticheskoj-hirurgii/",
  "/hirurgicheskie-nabory-/dlya-protezirovaniya/",
  "/hirurgicheskie-nabory-/hirurgicheskie-instrumenty/",
  "/ortodontiya-/ort-vint-s-obychnoj-golovkoj/",
  "/ortodontiya-/ort-vint-s-otverstiem/",
  "/ortodontiya-/ort-vint-s-maloj-golovkoj/",
  "/ortodontiya-/ort-vint-s-golovkoj-dlya-breketov/",
  "/ortodontiya-/programma-v-ceph/",
  "/ottisknoj-material-/hysil/",
];
const catalogDocuments = [
  `${baseUrl}/image/catalog/Implant%20System.pdf`,
  `${baseUrl}/image/catalog/Directory%20of%20Surgical%20sets.pdf`,
  `${baseUrl}/image/catalog/catalog.pdf`,
];
const replacements = new Map([
  ["implantat", "Имплантат"], ["abatment", "Абатмент"], ["uglovoj", "Угловой"],
  ["vremennyj", "Временный"], ["plastikovyj", "пластиковый"], ["titanovyj", "титановый"],
  ["cirkonievyj", "Циркониевый"], ["membrana", "Мембрана"], ["kostnyj", "Костный"],
  ["material", "материал"], ["ortodonticheskij", "Ортодонтический"], ["vint", "винт"],
  ["golovkoj", "головкой"], ["maloj", "малой"], ["obychnoj", "обычной"],
  ["otverstiem", "отверстием"], ["dlya", "для"], ["breketov", "брекетов"],
  ["stomatologicheskaya", "Стоматологическая"], ["ustanovka", "установка"],
  ["rentgen", "рентген"], ["apparat", "аппарат"], ["fiziodispenser", "Физиодиспенсер"],
  ["vnutrirotovaya", "Внутриротовая"], ["kamera", "камера"], ["hirurgicheskie", "Хирургические"],
  ["instrumenty", "инструменты"], ["pryamoj", "прямой"], ["uglovoj", "угловой"],
]);
const titleFromSlug = (slug) => slug.split("-").map((part) => replacements.get(part.toLocaleLowerCase("ru")) ?? (/^[a-z]+$/iu.test(part) ? part.toUpperCase() : part)).join(" ").replace(/\s+/gu, " ").trim();
const categoryFromRoot = (root) => root.split("/").filter(Boolean).slice(0, -1).map(titleFromSlug).join(" > ");
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const response = await fetch(sitemapUrl, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${sitemapUrl}: HTTP ${response.status}`);
const sitemap = await response.text();
const sourceUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => match[1]))]
  .filter((url) => {
    const pathname = new URL(url).pathname;
    return productRoots.some((root) => pathname.startsWith(root) && pathname !== root && !pathname.endsWith(".pdf"));
  });

const products = sourceUrls.map((sourcePageUrl) => {
  const pathname = new URL(sourcePageUrl).pathname;
  const root = productRoots.find((candidate) => pathname.startsWith(candidate));
  const slug = pathname.split("/").filter(Boolean).at(-1) ?? "";
  return {
    officialProductId: slug,
    brand: "Osstem",
    manufacturer: "OSSTEM IMPLANT Co., Ltd.",
    name: titleFromSlug(slug),
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: 1,
    categoryPath: categoryFromRoot(root ?? ""),
    description: "",
    sourceImageUrl: "",
    imageUrls: "",
    imageCount: 0,
    sourcePageUrl,
    kzEvidence: "EXACT_PRODUCT_FAMILY_ON_OSSTEM_KAZAKHSTAN_SITE",
    status: "PHOTO_REFERENCE_AND_VARIANT_MATRIX_REQUIRED",
  };
});

const report = {
  brand: "Osstem",
  manufacturer: "OSSTEM IMPLANT Co., Ltd.",
  sourceType: "OFFICIAL_KZ_SUBSIDIARY_CATALOG",
  sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  catalogDocuments,
  totals: {
    discoveredProducts: sourceUrls.length,
    crawledProducts: products.length,
    productsWithReferences: 0,
    productsWithImages: 0,
    crawlErrors: 0,
  },
  policy: {
    sellerOffersCreated: false,
    brokenProductPagesRemainAsDiscoveredCards: true,
    photosAndVariantReferencesMustBeReconciledFromOfficialCatalogDocuments: true,
  },
  errors: [],
  products,
};
const headers = [
  "officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs",
  "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl",
];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
