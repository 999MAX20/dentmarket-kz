import fs from "node:fs/promises";
import path from "node:path";

const sourceUrl = "https://www.doctor-smile.com/en/products/";
const jsonOutputPath = path.resolve("data/catalog-evidence/doctor-smile-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/doctor-smile-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`); return response.text(); }

const definitions = [
  { name: "WISER 2", page: "https://www.doctor-smile.com/en/wiser-diode-laser/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/WISER-1.jpeg", category: "Стоматологические лазеры", series: "LA8D", variants: ["LA8D0001.3", "LA8D0002.2"] },
  { name: "WISER 3", page: "https://www.doctor-smile.com/en/wiser-3/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/WISER3-1.jpeg", category: "Стоматологические лазеры", series: "LA12D", variants: ["LA12D001.4", "LA12D001.5"] },
  { name: "PLUSER", page: "https://www.doctor-smile.com/en/laser-erbium-pluser/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/PLUSER-1.jpeg", category: "Стоматологические лазеры", variants: ["LAERT001.1"] },
  { name: "PLUSER KOMBI", page: "https://www.doctor-smile.com/en/pluser-kombi/", image: "https://www.doctor-smile.com/wp-content/uploads/2022/09/PLUSER-KOMBI-_sito.png", category: "Стоматологические лазеры", ambiguousRef: "LAERT001.1", note: "Official page describes LAERT001.1 combined with a diode accessory; a distinct bundle order code is not published." },
  { name: "SIMPLER", page: "https://www.doctor-smile.com/en/simpler-2/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/05/SIMPLER2.png", category: "Стоматологические лазеры", series: "LA9D" },
  { name: "LWS Laser Whitening System", page: "https://www.doctor-smile.com/en/lws-laser-whitening-system/", image: "https://www.doctor-smile.com/wp-content/uploads/2024/12/LWS-NEW.png", category: "Материалы для отбеливания" },
  { name: "Sealver GEL", page: "https://www.doctor-smile.com/en/sealver-gel/", image: "https://www.doctor-smile.com/wp-content/uploads/2024/12/SEALVER-NEW.png", category: "Лазерные расходные материалы" },
  { name: "SIOXYL", page: "https://www.doctor-smile.com/en/sioxyl/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/SIOXYL-3.jpeg", category: "Лазерные расходные материалы" },
  { name: "Diode laser tips", page: "https://www.doctor-smile.com/en/fibre-and-tips/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/TIP-DIODO-2.jpeg", category: "Насадки для лазеров", labels: ["Implant", "Therapy", "Periodontology", "Surgery", "Endodontics"] },
  { name: "Erbium laser tips", page: "https://www.doctor-smile.com/en/tips-erbium/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/TIP-ERBIO-2.jpeg", category: "Насадки для лазеров", variants: ["LAEH4008.1", "LAEH4012.1", "LAEH6008.1", "LAEH6012.1", "LAEH8004.1", "LAEH8008.1", "LAEH8012.1", "LAEH8081.1"] },
  { name: "Diode laser handpieces", page: "https://www.doctor-smile.com/en/handpieces/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/MANIPOLI-DIODO-1.jpeg", category: "Манипулы для лазеров", labels: ["WISER handpiece", "Biostimulation tip", "Whitening tip wide area", "SIMPLER handpiece", "SIMPLER handpiece small area", "SIMPLER handpiece wide area"] },
  { name: "Erbium laser handpieces", page: "https://www.doctor-smile.com/en/erbium-handpieces/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/MANIPOLI-ERBIO-1.jpeg", category: "Манипулы для лазеров", labels: ["Erbium 0°", "Erbium BOOST 110°", "Erbium 90°", "Erbium ENDO", "Erbium FRACTIONAL", "Erbium FULL FIELD"] },
  { name: "FLAT TOP handpiece", page: "https://www.doctor-smile.com/en/flat-top-handpiece/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/MOP-3.jpeg", category: "Манипулы для лазеров" },
  { name: "REVIVE handpiece", page: "https://www.doctor-smile.com/en/revive/", image: "https://www.doctor-smile.com/wp-content/uploads/2021/03/REVIVE-3.jpeg", category: "Манипулы для лазеров" },
  { name: "VASCULATE handpiece", page: "https://www.doctor-smile.com/en/vasculate/", image: "https://www.doctor-smile.com/wp-content/uploads/2024/02/manipolo-Vasculate.png", category: "Манипулы для лазеров" },
  { name: "TMI handpiece", page: "https://www.doctor-smile.com/en/tmi/", image: "https://www.doctor-smile.com/wp-content/uploads/2025/11/TMI.png", category: "Манипулы для лазеров" },
  { name: "GLASERS", page: "https://www.doctor-smile.com/en/glasers/", image: "https://www.doctor-smile.com/wp-content/uploads/2025/02/GLASERS-PRODOTTO.png", category: "Защитные очки для лазеров" },
];

const products = [];
const errors = [];
for (const definition of definitions) {
  try {
    const html = await requestText(definition.page);
    const description = decode(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/iu)?.[1]);
    const refs = definition.variants ?? [];
    const labels = definition.labels ?? refs;
    const variants = labels.map((label, index) => ({ variantId: token(label), label, model: label, manufacturerRef: refs[index] ?? "" }));
    const manufacturerRef = refs.length === 1 && !definition.ambiguousRef ? refs[0] : "";
    products.push({
      officialProductId: `DOCTOR-SMILE-${token(definition.name)}`,
      brand: "Doctor Smile",
      manufacturer: "Lambda S.p.A.",
      name: definition.name,
      manufacturerRef,
      manufacturerRefs: refs.join(" | "),
      ambiguousManufacturerRef: definition.ambiguousRef ?? "",
      modelSeries: definition.series ?? "",
      variantCount: Math.max(1, variants.length),
      variants,
      categoryPath: definition.category,
      description,
      sourceImageUrl: definition.image,
      imageUrls: definition.image,
      imageCount: 1,
      sourcePageUrl: definition.page,
      sourcePortfolioUrl: sourceUrl,
      sourceNote: definition.note ?? "",
      kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_MARKET",
      status: manufacturerRef || refs.length > 1 ? "KZ_SKU_EVIDENCE_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED",
    });
  } catch (error) {
    errors.push({ sourcePageUrl: definition.page, error: String(error) });
  }
}
const report = {
  brand: "Doctor Smile",
  manufacturer: "Lambda S.p.A.",
  sourceType: "OFFICIAL_CURRENT_PRODUCT_PORTFOLIO",
  sourceUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { separateBundleWithoutDistinctOrderCodeKeepsReferenceAmbiguous: true, seriesCodeIsNotTreatedAsSku: true, overviewCategoryIsNotInventedAsProduct: true },
  totals: {
    discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: products.filter((product) => product.manufacturerRef || product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: errors.length,
  },
  errors,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "ambiguousManufacturerRef", "modelSeries", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
