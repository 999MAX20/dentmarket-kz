import fs from "node:fs/promises";
import path from "node:path";

const jsonOutputPath = path.resolve("data/catalog-evidence/medit-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/medit-manufacturer-catalog-queue.csv");
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const records = [
  ["i900 Mobility", "Intraoral scanners", "https://www.medit.com/medit-i900-mobility/", "https://www.medit.com/wp-content/uploads/2025/07/medit-i900m-with-ipad-bg_%EC%88%98%EC%A0%95_250730.png"],
  ["i900 classic", "Intraoral scanners", "https://www.medit.com/medit-i900-classic/", "https://www.medit.com/wp-content/uploads/2025/03/i900c-side-2.png"],
  ["i900", "Intraoral scanners", "https://www.medit.com/medit-i900/", "https://www.medit.com/wp-content/uploads/2024/04/240312_MEDIT_i900_STUJDIO2526-1653x1080.png"],
  ["i700 wireless", "Intraoral scanners", "https://www.medit.com/medit-i700-wireless/", "https://www.medit.com/wp-content/uploads/2023/11/i700-wireless_front.png"],
  ["i700", "Intraoral scanners", "https://www.medit.com/medit-i700/", "https://www.medit.com/wp-content/uploads/2024/02/i700_remote-control-864x640.png"],
  ["i600", "Intraoral scanners", "https://www.medit.com/medit-i600/", ""],
  ["i500", "Intraoral scanners", "https://www.medit.com/medit-i500/", "https://www.medit.com/wp-content/uploads/2023/12/i500-banner-1.png"],
  ["T710", "Laboratory scanners", "https://www.medit.com/medit-t-series/", "https://www.medit.com/wp-content/uploads/2023/11/T710-I-Rebranding_2x.webp"],
  ["T510", "Laboratory scanners", "https://www.medit.com/medit-t-series/", ""],
  ["T310", "Laboratory scanners", "https://www.medit.com/medit-t-series/", ""],
];
const products = records.map(([model, categoryPath, sourcePageUrl, sourceImageUrl]) => ({
  officialProductId: `MEDIT-${model.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`,
  brand: "Medit",
  manufacturer: "Medit Corp.",
  name: `Medit ${model}`,
  manufacturerRef: model,
  manufacturerRefs: model,
  variantCount: 1,
  variants: [{ manufacturerRef: model, label: model }],
  categoryPath,
  description: "",
  sourceImageUrl,
  imageUrls: sourceImageUrl,
  imageCount: sourceImageUrl ? 1 : 0,
  sourcePageUrl,
  kzEvidence: ["i900", "i700"].includes(model) ? "EXACT_MODEL_LISTED_BY_DIO_IN_KAZAKHSTAN_MARKET_DIRECTORY" : "BRAND_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
  status: sourceImageUrl ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED",
}));
const report = {
  brand: "Medit",
  manufacturer: "Medit Corp.",
  sourceType: "MANUFACTURER_CURRENT_PRODUCT_LINE",
  sourceUrl: "https://www.medit.com/",
  modelEvidenceUrl: "https://support.medit.com/hc/en-us/sections/360003221251-T-Series-Scanners-T710-T510-T310",
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    discoveredProducts: products.length,
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    crawlErrors: 0,
  },
  errors: [],
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
