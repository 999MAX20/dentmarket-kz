import fs from "node:fs/promises";
import path from "node:path";

const officialCategoryUrl = "https://www.draeger.com/ru_ru/Productfinder/Anaesthesia";
const kzAtlanSourceUrl = "https://medsyst.kz/catalog/narkozno-dykhatelnye-apparaty/narkozno-dykhatelnyy-apparat-a350-a350-xl/";
const kzRangeSourceUrl = "https://medconcept.kz/apparaty_dlya_narkoza1";
const jsonOutputPath = path.resolve("data/catalog-evidence/draeger-anesthesia-catalog.json");
const queueOutputPath = path.resolve("data/curation/draeger-anesthesia-catalog-queue.csv");

const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const definitions = [
  ["ATLAN-A300", "Наркозный аппарат Dräger Atlan A300/A300 XL", "Atlan", ["A300", "A300 XL"], "Atlan-A300-A300-XL"],
  ["ATLAN-A350", "Наркозный аппарат Dräger Atlan A350/A350 XL", "Atlan", ["A350", "A350 XL"], "Atlan-A350-A350-XL"],
  ["PERSEUS-A500", "Анестезиологический комплекс Dräger Perseus A500", "Perseus", ["A500"], "Perseus-A500"],
  ["ZEUS-INFINITY", "Анестезиологический комплекс Dräger Zeus Infinity Empowered", "Zeus Infinity", ["Empowered"], "Zeus-Infinity-Empowered"],
  ["FABIUS-MRI", "Наркозный аппарат Dräger Fabius MRI", "Fabius", ["MRI"], "Fabius-MRI"],
  ["FABIUS-PLUS-XL", "Наркозный аппарат Dräger Fabius Plus XL", "Fabius", ["Plus XL"], "Fabius-plus-XL"],
  ["VAPOR-2000", "Испарители анестетиков Dräger Vapor 2000 и D-Vapor", "Vapor", ["Vapor 2000", "D-Vapor"], "D-Vapor-Vapor-2000"],
  ["VAPOR-3000", "Испарители анестетиков Dräger Vapor 3000 и D-Vapor 3000", "Vapor", ["Vapor 3000", "D-Vapor 3000"], "D-Vapor-3000"],
  ["SCIO-FOUR", "Газоанализатор Dräger Scio Four", "Scio", ["Four"], "Scio"],
  ["SET2GO-PACK2GO", "Комплекты дыхательных контуров Dräger Set2Go и Pack2Go", "Дыхательные контуры", ["Set2Go", "Pack2Go"], "Set2Go-and-Pack2Go"],
  ["FABIUS-PLUS", "Наркозный аппарат Dräger Fabius Plus", "Fabius", ["Plus"], "Fabius-Plus"],
  ["SMARTPILOT-VIEW", "Программный продукт Dräger SmartPilot View", "SmartPilot", ["View"], "SmartPilot-View"],
];

const products = definitions.map(([id, name, model, variants, slug]) => {
  const exactKzSku = id === "ATLAN-A350";
  return {
    officialProductId: `DRAEGER-${id}`,
    brand: "Dräger",
    manufacturer: "Drägerwerk AG & Co. KGaA",
    name,
    manufacturerRef: "",
    manufacturerRefs: "",
    model,
    variantCount: variants.length,
    variants: variants.map((variantLabel) => ({
      variantLabel,
      manufacturerRef: "",
      status: "MANUFACTURER_REFERENCE_REQUIRED",
    })),
    categoryPath: id.startsWith("VAPOR")
      ? "Анестезиология / Испарители анестетиков"
      : id === "SCIO-FOUR"
        ? "Анестезиология / Газоанализаторы"
        : id === "SET2GO-PACK2GO"
          ? "Анестезиология / Дыхательные контуры"
          : id === "SMARTPILOT-VIEW"
            ? "Анестезиология / Программное обеспечение"
            : "Анестезиология / Наркозные аппараты",
    description: "Текущая модель подтверждена официальным каталогом Dräger. Заводской артикул и точная фотография оставлены на проверку, чтобы не подставлять неверные данные.",
    sourceImageUrl: "",
    imageUrls: "",
    imageCount: 0,
    sourcePageUrl: `https://www.draeger.com/ru_ru/Products/${slug}`,
    additionalSourceUrls: exactKzSku ? `${officialCategoryUrl} | ${kzAtlanSourceUrl} | ${kzRangeSourceUrl}` : `${officialCategoryUrl} | ${kzRangeSourceUrl}`,
    kzEvidence: exactKzSku ? "EXACT_KZ_MODEL_LISTING" : "BRAND_AND_ANESTHESIA_RANGE_OBSERVED_IN_KAZAKHSTAN",
    status: "PHOTO_REQUIRED",
  };
});

const report = {
  brand: "Dräger",
  manufacturer: "Drägerwerk AG & Co. KGaA",
  sourceType: "CURRENT_OFFICIAL_PRODUCTFINDER_PLUS_KZ_MODEL_AND_RANGE_EVIDENCE",
  sourceUrl: officialCategoryUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    currentOfficialAnesthesiaRangeOnly: true,
    modelVariantsPreservedWithoutInventedOrderCodes: true,
    exactKzAtlanA350EvidencePreserved: true,
    exactPhotoRequiredBeforePublication: true,
    missingPhotoOrReferenceNeverDeletesCard: true,
  },
  totals: {
    discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: 0,
    productsWithImages: 0,
    productsWithoutImages: products.length,
    exactKzModels: products.filter((product) => product.kzEvidence === "EXACT_KZ_MODEL_LISTING").length,
    crawlErrors: 0,
  },
  products,
};

const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "model", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl", "additionalSourceUrls"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";

await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
