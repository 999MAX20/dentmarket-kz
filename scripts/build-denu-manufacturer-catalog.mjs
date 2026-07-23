import fs from "node:fs/promises";
import path from "node:path";

const sourceUrl = "https://www.keverocsor.hu/custom/keverocsordiszkont/image/data/srattached/c6e9c5a8b7068235526dccd0b84180ce_2026-denu-HDI-katalogus.pdf";
const officialManufacturerUrl = "https://www.hdident.com/";
const jsonOutputPath = path.resolve("data/catalog-evidence/denu-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/denu-manufacturer-catalog-queue.csv");
const token = (value) => String(value ?? "").normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const shadeVariants = ["A0", "A1", "A2", "A3", "A3.5", "B1", "B2", "B3", "U0"];
const defs = [
  ["Denu Light Body", "Слепочные материалы", 5, ["Cartridge · Normal set · 4 × 50 ml", "Cartridge · Fast set · 4 × 50 ml", "Tube · Normal set · 5 × 300 ml", "Tube · Fast set · 5 × 300 ml"]],
  ["Denu Heavy Body", "Слепочные материалы", 6, ["Cartridge · Normal set · 4 × 50 ml", "Cartridge · Fast set · 4 × 50 ml", "Tube · Normal set · 5 × 300 ml", "Tube · Fast set · 5 × 300 ml"]],
  ["Denu Medium Body", "Слепочные материалы", 7, ["Cartridge · Normal set · 4 × 50 ml", "Cartridge · Fast set · 4 × 50 ml"]],
  ["Denu Putty Set", "Слепочные материалы", 7, ["Normal set · 560 ml", "Fast set · 560 ml"]],
  ["Denu Alginate", "Слепочные материалы", 8, ["Normal set · 500 g", "Fast set · 500 g"]],
  ["Denu Tray Cleaner", "Очистка слепочных ложек", 8, ["1 kg"]],
  ["Denu Bite Sil", "Регистрация прикуса", 9, ["4 × 50 ml cartridges"]],
  ["Denu Trans Sil", "Слепочные материалы", 9, ["2 × 50 ml cartridges"]],
  ["Denu GingiCord", "Ретракционные материалы", 10, ["#000 · black · 300 cm", "#00 · brown · 300 cm", "#0 · purple · 300 cm", "#1 · blue · 300 cm", "#2 · green · 300 cm"]],
  ["Denu SpeedyStat", "Гемостатические материалы", 10, ["20 ml"]],
  ["Denu Composite Resin", "Реставрационные материалы", 12, shadeVariants.map((shade) => `${shade} · 4 g syringe`)],
  ["Denu Composite Resin Kit", "Реставрационные материалы", 12, ["Kit 1 · 2 composite syringes + Etch-37 + Bond", "Kit 2 · 8 composite syringes + Etch-37 + 2 Bond"]],
  ["Denu Flow Resin", "Жидкотекучие композиты", 13, shadeVariants.map((shade) => `${shade} · 2 × 2 g syringes`)],
  ["Denu Temp Flow", "Временные пломбировочные материалы", 13, ["Blue · 5 × 2 g", "Light Blue · 5 × 2 g", "Yellow · 5 × 2 g"]],
  ["Denu TemTooth", "Временные коронки и зубы", 14, ["A2 · 5 × 12 ml", "A3 · 5 × 12 ml"]],
  ["Denu Temp Crown Cartridge", "Временные коронки и мосты", 14, ["A1 · 50 ml", "A2 · 50 ml", "A3 · 50 ml"]],
  ["Denu Fil Flow for Implant", "Материалы для имплантатов", 15, ["5 × 1.2 ml syringes"]],
  ["Denu Block-out Resin", "Материалы для изготовления кап", 15, ["Blue · 5 × 1.2 ml"]],
  ["Denu Etch-37", "Протравочные материалы", 16, ["5 × 3 ml syringes"]],
  ["Denu Bond", "Адгезивные системы", 16, ["2 × 5 ml bottles"]],
  ["Denu Temp Cement NE", "Временные цементы", 17, ["2 × 5 ml syringes"]],
  ["Denu Temp Cement EZ", "Временные цементы", 17, ["2 × 5 ml syringes"]],
  ["Denu Temp Cement Implant", "Временные цементы для имплантатов", 17, ["1 × 5 ml syringe"]],
  ["Denu TemCement Cleaner", "Очистка временного цемента", 17, ["200 ml", "500 ml"]],
  ["Denu Dual Core", "Материалы для восстановления культи", 18, ["A3 yellow · 2 × 5 ml", "Blue · 2 × 5 ml"]],
  ["Denu Base Liner", "Прокладочные материалы", 18, ["2 × 1.2 ml syringes"]],
  ["Denu Vaseline", "Разделительные материалы", 19, ["5 ml syringe"]],
  ["Denu EDTA Cream", "Эндодонтические материалы", 19, ["2 × 6 g syringes"]],
  ["Denu Sparkle", "Профессиональное отбеливание", 20, ["Whitening Kit 1 · 10 × 1.5 ml", "Whitening Kit 2 · 1 × 1.5 ml + 2 Dam syringes"]],
  ["Denu Dam", "Защита десны при отбеливании", 20, ["Blue · 5 × 1.2 ml"]],
  ["Denu Clear Varnish", "Фторлаки", 22, ["Fresh sweet apple · 10 unit doses", "Fresh sweet apple · 100 unit doses"]],
  ["Denu Varnish", "Фторлаки", 22, ["Orange · 10 unit doses", "Orange · 100 unit doses"]],
  ["Denu Fluoride Gel", "Фторирование", 23, ["Strawberry · 500 ml", "Orange · 500 ml", "Peach · 500 ml"]],
  ["Denu Fluoride Gel Tray", "Ложки для фторирования", 23, ["Large", "Medium", "Small"]],
  ["Denu Seal", "Герметики фиссур", 24, ["White · 2 × 1.2 ml"]],
  ["Denu Pumice Paste", "Полировочные пасты", 24, ["With fluoride · strawberry · 340 g", "With fluoride · natural mint · 340 g", "Without fluoride · strawberry · 340 g", "Without fluoride · natural mint · 340 g"]],
  ["Denu Root Seal", "Материалы для пломбирования каналов", 25, ["12 g dual syringe"]],
  ["Denu Paste", "Кальцийсодержащие эндодонтические материалы", 25, ["2 g syringe"]],
  ["Denu Pex", "Йодоформные эндодонтические материалы", 25, ["2 g syringe"]],
  ["Denu OssNOVA", "Костнопластические материалы", 26, ["BPA · 0.5–1 mm · 0.5 g", "BPA · 0.5–1 mm · 1 g", "BPA · 0.5–1 mm · 2 g", "BPB · 1–2 mm · 0.5 g", "BPB · 1–2 mm · 1 g", "BPB · 1–2 mm · 2 g", "BPC · 0.5–1.4 mm · 0.5 g", "BPC · 0.5–1.4 mm · 1 g", "BPC · 0.5–1.4 mm · 2 g"]],
  ["Denu Cure CEM MTA", "МТА-материалы", 26, ["5 × 0.15 g vials", "1 × 1 g vial"]],
  ["Denu Cure Seal MTA", "МТА-силеры", 26, ["1.5 g syringe"]],
  ["Denu Stick Free", "Держатели для реставраций", 27, ["64 sticks"]],
  ["Denu Bite Block Cover", "Барьерная защита", 27, ["35 × 65 mm · 300 pcs"]],
  ["Denu Digital Sensor Cover", "Барьерная защита", 27, ["40 × 110 mm · 300 pcs"]],
  ["Denu Intraoral Camera Cover", "Барьерная защита", 27, ["40 × 110 mm · 300 pcs"]],
];

const products = defs.map(([name, categoryPath, sourceDocumentPage, labels]) => {
  const variants = labels.map((label) => ({ variantId: token(label), label, manufacturerRef: "" }));
  return {
    officialProductId: `DENU-HDI-${token(name)}`,
    brand: "DENU",
    manufacturer: "HDI Inc.",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    variantCount: Math.max(1, variants.length),
    variants,
    categoryPath,
    description: "",
    sourceImageUrl: "",
    imageUrls: "",
    imageCount: 0,
    sourceDocumentPage,
    sourcePageUrl: sourceUrl,
    officialManufacturerUrl,
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_MARKET",
    status: "PHOTO_REQUIRED",
  };
});
const report = {
  brand: "DENU",
  manufacturer: "HDI Inc.",
  sourceType: "OFFICIAL_MANUFACTURER_2026_CATALOG_MIRROR_VISUALLY_VERIFIED",
  sourceUrl,
  officialManufacturerUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { actualPublishedVariantsOnly: true, noCartesianVariantExpansion: true, resellerCodesAreNotManufacturerReferences: true, catalogPageImagesAreNotUsedAsCardImages: true, announcedGingiCordPlusExcludedUntilCommercialAvailabilityIsConfirmed: true },
  totals: { discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: 0, productsWithImages: 0, photoQueue: products.length, crawlErrors: 0 },
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceDocumentPage", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
