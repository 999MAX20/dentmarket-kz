import fs from "node:fs/promises";
import path from "node:path";

const brochureUrl = "https://th.kaeser.com/en/download.ashx?id=tcm%3A58-85538";
const jsonOutputPath = path.resolve("data/catalog-evidence/kaeser-dental-catalog.json");
const queueOutputPath = path.resolve("data/curation/kaeser-dental-catalog-queue.csv");
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const variant = (name, attributes = {}) => ({ name, attributes });
const families = [
  {
    id: "KCT-BLUE",
    name: "KCT blue",
    categoryPath: "Безмасляные компрессорные станции для стоматологических лабораторий",
    description: "Безмасляная компрессорная станция со встроенной системой подготовки воздуха SECCOMAT для стоматологических лабораторий.",
    sourcePageUrl: brochureUrl,
    sourceImageUrl: "",
    variants: [
      variant("110-24 T", { pressureBar: "5,5–7", receiverLitres: 24, voltage: "230 В, 1 фаза, 50 Гц" }),
      variant("230-24 T", { pressureBar: "5,5–7", receiverLitres: 24, voltage: "230 В / 400 В" }),
      variant("230-65 T", { pressureBar: "7,5–9", receiverLitres: 65, voltage: "230 В / 400 В" }),
      variant("420-65 T", { pressureBar: "5,5–7", receiverLitres: 65, voltage: "230 В / 400 В" }),
      variant("401-65 T", { pressureBar: "7,5–9", receiverLitres: 65, voltage: "230 В / 400 В" }),
      variant("420-90 T", { pressureBar: "5,5–7", receiverLitres: 90, voltage: "400 В, 3 фазы, 50 Гц" }),
    ],
  },
  {
    id: "KCT-BLUE-EXTERNAL-DRYER",
    name: "KCT blue с внешним осушителем",
    categoryPath: "Безмасляные компрессорные станции для стоматологических лабораторий",
    description: "Исполнение KCT blue для совместной работы с отдельным холодильным осушителем.",
    sourcePageUrl: brochureUrl,
    sourceImageUrl: "",
    variants: ["110-24", "230-24", "420-65", "420-90"].map((name) => variant(name)),
  },
  {
    id: "KRYOSEC-TAH",
    name: "KRYOSEC TAH",
    categoryPath: "Холодильные осушители для стоматологических компрессорных систем",
    description: "Компактный холодильный осушитель для стабильной защиты сжатого воздуха от влаги.",
    sourcePageUrl: "https://ca.kaeser.com/en/products-and-solutions/compressed-air-treatment/dryers/refrigerated-dryers/kryosec-compressed-air-refrigeration-dryers/",
    sourceImageUrl: "https://ca.kaeser.com/EN/Media/KRYOSEC_enclosure_45-7338-200x112.png",
    variants: [variant("TAH 5", { flowLitresPerMinute: 350 }), variant("TAH 7", { flowLitresPerMinute: 600 }), variant("TAH 10", { flowLitresPerMinute: 800 })],
  },
  {
    id: "ICOMP-TOWER-T",
    name: "i.Comp TOWER T",
    categoryPath: "Безмасляные компрессорные станции для стоматологических лабораторий",
    description: "Готовая к подключению безмасляная компрессорная станция с ресиверами, холодильным осушителем и управлением SIGMA CONTROL 2.",
    sourcePageUrl: "https://au.kaeser.com/products/reciprocating-compressors/complete-packages/i-comp-tower/",
    sourceImageUrl: "https://au.kaeser.com/Media/i_Comp_9_Tower_T_Service_166-104794.png",
    variants: [variant("i.Comp 8 TOWER T", { maxPressureBar: 11, flowAt6BarLitresPerMinute: 404 }), variant("i.Comp 9 TOWER T", { maxPressureBar: 11, flowAt6BarLitresPerMinute: 570 })],
  },
  {
    id: "AIRBOX-CENTER",
    name: "AIRBOX CENTER",
    categoryPath: "Безмасляные компрессорные станции для крупных стоматологических лабораторий",
    description: "Комплексная безмасляная компрессорная станция для крупных лабораторий и клиник с высокой потребностью в сжатом воздухе.",
    sourcePageUrl: "https://nz.kaeser.com/products/reciprocating-compressors/complete-packages/airbox-center/",
    sourceImageUrl: "https://nz.kaeser.com/Media/Airbox_FR_45_O_152-6524-200x116.png",
    variants: [
      variant("AIRBOX CENTER 1000-2", { maxPressureBar: 10, flowAt6BarLitresPerMinute: 780 }),
      variant("AIRBOX CENTER 1200-2", { maxPressureBar: 7, flowAt6BarLitresPerMinute: 875 }),
      variant("AIRBOX CENTER 1500", { maxPressureBar: 10, flowAt6BarLitresPerMinute: 920 }),
      variant("AIRBOX CENTER 1800", { maxPressureBar: 7, flowAt6BarLitresPerMinute: 875 }),
    ],
  },
  {
    id: "AIRCENTER-DENTAL",
    name: "AIRCENTER для стоматологических CAD/CAM-лабораторий",
    categoryPath: "Винтовые компрессорные станции для стоматологических CAD/CAM-лабораторий",
    description: "Компрессорная станция для непрерывной работы CAD/CAM-оборудования: винтовой компрессор, холодильный осушитель и ресивер в одном корпусе.",
    sourcePageUrl: "https://ca.kaeser.com/en/products-and-solutions/rotary-screw-compressors/compressed-air-packages/aircenters/",
    sourceImageUrl: "https://ca.kaeser.com/EN/Media/SX_Aircenter_22_Service_001_45-7047-200x112.png",
    variants: ["SX 3", "SX 4", "SX 6", "SX 8", "SM 10", "SM 13", "SM 13 SFC", "SK 16", "SK 22", "SK 22 SFC", "SK 25", "SK 25 SFC"].map((name) => variant(name)),
  },
];

const products = families.map((family) => ({
  officialProductId: `KAESER-${family.id}`,
  brand: "Kaeser",
  manufacturer: "KAESER KOMPRESSOREN SE",
  name: family.name,
  manufacturerRef: "",
  manufacturerRefs: "",
  model: family.name,
  variantCount: family.variants.length,
  variants: family.variants,
  categoryPath: family.categoryPath,
  description: family.description,
  sourceImageUrl: family.sourceImageUrl,
  imageUrls: family.sourceImageUrl,
  imageCount: family.sourceImageUrl ? 1 : 0,
  sourcePageUrl: family.sourcePageUrl,
  kzEvidence: "BRAND_OBSERVED_IN_KAZAKHSTAN_MARKET",
  status: family.sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED",
}));
const report = {
  brand: "Kaeser",
  manufacturer: "KAESER KOMPRESSOREN SE",
  sourceType: "OFFICIAL_DENTAL_TECHNOLOGY_BROCHURE_AND_CURRENT_PRODUCT_PAGES",
  sourceUrl: brochureUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { dentalRelevantPortfolioOnly: true, everyTechnicalTableModelPreservedAsVariant: true, modelNamesNotAssumedToBeOrderCodes: true, brochurePageCropsNotUsedAsCatalogPhotos: true, missingExactPhotosRemainQueued: true },
  totals: { productFamilies: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: 0, productsWithImages: products.filter((product) => product.imageCount > 0).length, productsWithoutImages: products.filter((product) => product.imageCount === 0).length },
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
