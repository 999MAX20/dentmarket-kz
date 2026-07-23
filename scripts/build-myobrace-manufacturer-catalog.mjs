import fs from "node:fs/promises";
import path from "node:path";

const sourceUrl = "https://www.myoresearch.com/storage/app/media/resources/Brochures-Catalogues/Myobrace_AC_0325_ENG_v6.0.0_Web.pdf";
const jsonOutputPath = path.resolve("data/catalog-evidence/myobrace-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/myobrace-manufacturer-catalog-queue.csv");
const sizes = { two: ["Medium", "Large"], three: ["Small", "Medium", "Large"], seven: Array.from({ length: 7 }, (_, index) => `Size ${index + 1}`), one: [] };
const definitions = [
  ["J1", "Myobrace for Juniors", 4, "Habit correction", "two"], ["J2", "Myobrace for Juniors", 4, "Arch development", "two"], ["J3", "Myobrace for Juniors", 4, "Jaw alignment and retention", "two"],
  ["K0", "Myobrace for Kids", 5, "Functional airway and initial habit correction", "one"], ["K1", "Myobrace for Kids", 5, "Habit correction", "three"], ["K2", "Myobrace for Kids", 5, "Arch development", "three"], ["K3", "Myobrace for Kids", 5, "Final alignment and retention", "three"],
  ["T1", "Myobrace for Teens", 6, "Habit correction", "two"], ["T1BWS", "Myobrace for Teens", 6, "Habit correction with Farrell Bent Wire System", "one"], ["T2", "Myobrace for Teens", 6, "Arch development", "two"],
  ["T3", "Myobrace for Teens", 7, "Dental alignment", "seven"], ["T3N", "Myobrace Tooth Alignment System", 7, "Initial tooth alignment", "seven"], ["T4", "Myobrace for Teens", 7, "Retention", "two"],
  ["i-3N", "Myobrace Interceptive Class III", 8, "Habit correction", "three"], ["i-3", "Myobrace Interceptive Class III", 8, "Arch development", "three"], ["i-3H", "Myobrace Interceptive Class III", 8, "Final alignment and retention", "one"],
  ["P-3N", "Myobrace Permanent Dentition Class III", 9, "Habit correction", "one"], ["P-3", "Myobrace Permanent Dentition Class III", 9, "Arch development", "one"], ["P-3H", "Myobrace Permanent Dentition Class III", 9, "Final alignment and retention", "three"],
  ["AA1", "Myobrace Adult Aligner", 10, "Habit correction", "two"], ["AA2", "Myobrace Adult Aligner", 10, "Arch development", "two"], ["AA3", "Myobrace Adult Aligner", 10, "Final alignment and retention", "two"],
  ["R", "Myoretainr", 11, "Flexible orthodontic retainer", "two"], ["RH", "Myoretainr", 11, "Hard orthodontic retainer", "two"],
];
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const products = definitions.map(([model, family, page, purpose, sizeKey]) => {
  const variants = sizes[sizeKey].map((size) => ({ manufacturerRef: "", label: size }));
  return { officialProductId: `MYOBRACE-${model.toUpperCase()}`, brand: family === "Myoretainr" ? "Myoretainr" : "Myobrace",
    manufacturer: "Myofunctional Research Co.", name: `${family} ${model}`, manufacturerRef: model, manufacturerRefs: model,
    variantCount: variants.length, variants, categoryPath: family, description: purpose, sourceImageUrl: "", imageUrls: "", imageCount: 0,
    sourcePageUrl: `${sourceUrl}#page=${page}`, cataloguePage: page, kzEvidence: "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET", status: "PHOTO_REQUIRED" };
});
const report = { brand: "Myobrace", manufacturer: "Myofunctional Research Co.", sourceType: "MANUFACTURER_APPLIANCE_CATALOGUE_2025",
  sourceUrl, lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + Math.max(1, product.variantCount), 0), productsWithReferences: products.length,
    productsWithImages: 0, crawlErrors: 0 }, errors: [], products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
