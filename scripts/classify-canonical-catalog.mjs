import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = path.resolve(process.cwd());
const inputPath = path.join(root, "data/reports/canonical-manufacturer-intake.json");
const kzEvidencePath = path.join(root, "data/catalog-kz-market-evidence.csv");
const classificationPath = path.join(root, "data/catalog-evidence/kz-market-label-classifications.json");
const reportJsonPath = path.join(root, "data/reports/canonical-publication-classification.json");
const reportMdPath = path.join(root, "data/reports/canonical-publication-classification.md");
const moderationPath = path.join(root, "data/curation/canonical-publication-moderation.csv");
const noPhotoPath = path.join(root, "data/curation/canonical-cards-without-approved-photo.csv");
const approvedPath = path.join(root, "data/reports/production-approved-catalog.json");
const buyerApprovedPath = path.join(root, "apps/buyer-web/app/data/production-approved-catalog.json");
const approvedMediaPath = path.join(root, "data/catalog-media/production-approved-catalog-media.csv");

const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const key = (value) => clean(value).toLocaleLowerCase("ru").replace(/ё/gu, "е").replace(/[®™]/gu, "").replace(/[^a-zа-я0-9]+/giu, " ").trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const stableId = (value) => `approved-${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;

const catalog = JSON.parse(await fs.readFile(inputPath, "utf8"));
const kzRows = parse(await fs.readFile(kzEvidencePath), { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true });
const labelClassifications = JSON.parse(await fs.readFile(classificationPath, "utf8"));
const exactKzKeys = new Set(kzRows.map((row) => `${key(row.brand)}\u0000${key(row.canonicalProductName)}`));
const classifiedLabels = new Set((labelClassifications.labels ?? labelClassifications.classifications ?? []).map((row) => key(row.label || row.marketLabel || row.brand)).filter(Boolean));

const navigationNoise = /^(?:products?|product center|catalog(?:ue)?|home|about|news|contact|services?|solutions?|categories?|all products?|стоматологические товары|каталог|главная|о компании|контакты)$/iu;
const textNoise = /(?:document\.createElement|jivosite|yaCounter|slick\s*\(|copyright\s*©|didn't find the information|legal declaration|site map)/iu;
const unsafeMedicalClaim = /(?:гарантирован(?:ный|о) результат|абсолютно безопас|лечит все|без побочных эффектов)/iu;
const validUrl = (value) => /^https?:\/\/[^\s]+$/iu.test(clean(value));

function classify(product) {
  const reasons = [];
  const warnings = [];
  const name = clean(product.name);
  const brand = clean(product.brand);
  const description = clean(product.description);
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const refs = variants.map((variant) => clean(variant.manufacturerRef)).filter(Boolean);
  const exactKzEvidence = exactKzKeys.has(`${key(brand)}\u0000${key(name)}`) || /(?:en-KZ|ru_KZ|3mkazakhstan|\.kz(?:\/|$))/iu.test(clean(product.sourcePageUrl));
  const brandKzEvidence = Boolean(clean(product.kzEvidence));
  const exactPhoto = clean(product.photoStatus) === "EXACT_SOURCE_SINGLE_CARD" && validUrl(product.publishableImageUrl);
  const identityValid = name.length >= 4 && !/^\d+$/u.test(name) && !navigationNoise.test(name);
  const sourceValid = validUrl(product.sourcePageUrl);
  const categoryValid = clean(product.categoryPath).length >= 3 && !navigationNoise.test(clean(product.categoryPath));
  const descriptionValid = description.length >= 35 && description.length <= 5000 && !textNoise.test(description) && !unsafeMedicalClaim.test(description);
  const codeOnlyVariant = /^(?:(?:REF|SKU)\s*)?[A-Z0-9._/-]+$/iu;
  const hasReadableVariantChoice = (variant) => {
    const label = clean(variant.variantLabel);
    const attributes =
      variant.attributes && typeof variant.attributes === "object"
        ? variant.attributes
        : {};
    const readableAttribute = Object.entries(attributes).some(
      ([attribute, value]) =>
        !/(?:артикул|sku|ref|код производителя)/iu.test(attribute) &&
        clean(value).length >= 1,
    );
    return label.length >= 2 && (!codeOnlyVariant.test(label) || readableAttribute);
  };
  const variantLabelsValid =
    variants.length > 0 &&
    (variants.length === 1
      ? clean(variants[0].variantLabel).length >= 2
      : variants.every(hasReadableVariantChoice));
  const referencesValid = refs.length > 0;

  if (!identityValid) reasons.push("INVALID_PRODUCT_IDENTITY");
  if (!brand || classifiedLabels.has(key(brand))) reasons.push("NOT_A_CANONICAL_PRODUCT_BRAND");
  if (!sourceValid) warnings.push("SOURCE_PAGE_REQUIRED");
  if (!categoryValid) warnings.push("CATEGORY_REQUIRED");
  if (!variantLabelsValid) warnings.push("VARIANT_LABEL_REQUIRED");
  if (!referencesValid) warnings.push("MANUFACTURER_REFERENCE_REQUIRED");
  if (!exactPhoto) warnings.push(product.photoStatus === "PHOTO_REQUIRED" ? "PHOTO_REQUIRED" : "PHOTO_REVIEW_REQUIRED");
  if (!descriptionValid) warnings.push(description ? "DESCRIPTION_REVIEW_REQUIRED" : "DESCRIPTION_REQUIRED");
  if (!exactKzEvidence) warnings.push(brandKzEvidence ? "EXACT_KZ_SKU_EVIDENCE_REQUIRED" : "KZ_MARKET_EVIDENCE_REQUIRED");

  if (reasons.length) return { decision: "REJECT", reasons, warnings, exactKzEvidence };
  // Product identity, brand and an exact product photo are the public-shelf
  // gate. Missing commercial enrichment remains visible to moderators without
  // hiding a recognizable manufacturer card from clinics or future suppliers.
  if (exactPhoto) return { decision: "PUBLISH", reasons, warnings, exactKzEvidence };
  return { decision: "MODERATION", reasons, warnings, exactKzEvidence };
}

const rows = catalog.products.map((product) => ({ product, ...classify(product) }));
const counts = rows.reduce((result, row) => ({ ...result, [row.decision]: (result[row.decision] ?? 0) + 1 }), {});
const reasonCounts = rows.flatMap((row) => [...row.reasons, ...row.warnings]).reduce((result, reason) => ({ ...result, [reason]: (result[reason] ?? 0) + 1 }), {});

const approvedProducts = rows.filter((row) => row.decision === "PUBLISH").map(({ product, warnings, exactKzEvidence }) => {
  const id = stableId(product.canonicalProductId);
  return {
    id,
    canonicalProductId: product.canonicalProductId,
    name: clean(product.name),
    description: clean(product.description),
    brand: clean(product.brand) || null,
    manufacturer: clean(product.manufacturer) || null,
    category: clean(product.categoryPath) || "Стоматологические товары",
    sourceUrl: clean(product.sourcePageUrl),
    sourceUpdatedAt: catalog.generatedAt,
    imageUrl: clean(product.publishableImageUrl),
    photoStatus: "exact",
    catalogSource: "manufacturer",
    complianceClassification: warnings.length
      ? "PUBLISH_WITH_REVIEW_FLAGS"
      : "PUBLISH",
    moderationWarnings: warnings,
    exactKzEvidence,
    attributes: [
      ["Категория", clean(product.categoryPath) || "Стоматологические товары"],
      ["Бренд", clean(product.brand)],
      ["Производитель", clean(product.manufacturer)],
      ["Артикулы производителя", clean(product.manufacturerRefs)],
    ].filter(([, value]) => value),
    variants: product.variants.map((variant, index) => ({
      id: `${id}-variant-${stableId(`${product.canonicalProductId}:${variant.manufacturerRef || index}`).slice(9)}`,
      sku: clean(variant.manufacturerRef) || null,
      gtin: clean(variant.gtin) || null,
      label: clean(variant.variantLabel) || `Вариант ${index + 1}`,
      attributes: {
        ...(variant.attributes && typeof variant.attributes === "object" ? variant.attributes : {}),
        ...(clean(variant.manufacturerRef) ? { "Артикул производителя": clean(variant.manufacturerRef) } : {}),
      },
    })),
    offers: [],
    minNormalizedPriceMinor: null,
    isAvailable: false,
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    allCanonicalCardsClassified: true,
    rejectedCardsExcludedFromCatalog: true,
    moderationCardsRetained: true,
    productionRequiresExactKzSkuEvidence: false,
    productionRequiresExactPhoto: true,
    productionRequiresBrand: true,
    productionRequiresManufacturerReference: false,
    productionRequiresCleanDescription: false,
    nonBlockingReviewFlagsRetained: true,
    complianceMode: "REPORT_ONLY_NO_AUTOMATIC_CORRECTION",
  },
  totals: { total: rows.length, PUBLISH: counts.PUBLISH ?? 0, MODERATION: counts.MODERATION ?? 0, REJECT: counts.REJECT ?? 0 },
  reasonCounts,
  products: rows.map(({ product, decision, reasons, warnings, exactKzEvidence }) => ({ canonicalProductId: product.canonicalProductId, brand: product.brand, name: product.name, decision, reasons, warnings, exactKzEvidence, photoStatus: product.photoStatus, manufacturerRefs: product.manufacturerRefs, sourcePageUrl: product.sourcePageUrl })),
};

const queueHeaders = ["canonicalProductId", "brand", "name", "decision", "reasons", "warnings", "photoStatus", "manufacturerRefs", "sourcePageUrl"];
const queueRows = report.products.filter((product) => product.decision !== "PUBLISH");
const queueCsv = [queueHeaders.join(","), ...queueRows.map((row) => queueHeaders.map((header) => escapeCsv(Array.isArray(row[header]) ? row[header].join(" | ") : row[header])).join(","))].join("\n") + "\n";
const noPhotoRows = rows.filter(({ product }) => !clean(product.publishableImageUrl)).map(({ product, decision, warnings }) => ({ canonicalProductId: product.canonicalProductId, brand: product.brand, name: product.name, decision, photoStatus: product.photoStatus, evidenceImageUrl: product.evidenceImageUrl, sourcePageUrl: product.sourcePageUrl, nextAction: warnings.includes("PHOTO_REVIEW_REQUIRED") ? "REVIEW_OR_REPLACE_IMAGE" : "FIND_OR_GENERATE_MODERATED_IMAGE" }));
const noPhotoHeaders = ["canonicalProductId", "brand", "name", "decision", "photoStatus", "evidenceImageUrl", "sourcePageUrl", "nextAction"];
const noPhotoCsv = [noPhotoHeaders.join(","), ...noPhotoRows.map((row) => noPhotoHeaders.map((header) => escapeCsv(row[header])).join(","))].join("\n") + "\n";
const md = `# Классификация канонического каталога\n\nСформировано: ${report.generatedAt}\n\n- Всего карточек: ${report.totals.total}\n- Можно публиковать автоматически: ${report.totals.PUBLISH}\n- Оставлено на модерации: ${report.totals.MODERATION}\n- Отсеяно как не соответствующее правилам: ${report.totals.REJECT}\n- Без одобренного фото: ${noPhotoRows.length}\n\n## Правило допуска\n\nПубликация разрешена при наличии корректного названия товара, бренда и точного фото. Недостающие описание, категория, артикул, понятное название варианта или подтверждение позиции для рынка Казахстана сохраняются как флаги последующей модерации, но не скрывают карточку с публичной витрины. Карточки без точного фото остаются на модерации, некорректные товарные сущности отсекаются.\n`;
const approvedMediaHeaders = ["sourcePageUrl", "sourceImageUrl", "productName", "rightsStatus"];
const approvedMediaCsv = [
  approvedMediaHeaders.join(","),
  ...approvedProducts.map((product) =>
    [product.sourceUrl, product.imageUrl, product.name, "public_exact_product_source"]
      .map(escapeCsv)
      .join(","),
  ),
].join("\n") + "\n";

await Promise.all([
  fs.writeFile(reportJsonPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(reportMdPath, md),
  fs.writeFile(moderationPath, queueCsv),
  fs.writeFile(noPhotoPath, noPhotoCsv),
  fs.writeFile(approvedPath, JSON.stringify({ generatedAt: report.generatedAt, policy: report.policy, products: approvedProducts }, null, 2) + "\n"),
  fs.writeFile(buyerApprovedPath, JSON.stringify({ generatedAt: report.generatedAt, policy: report.policy, products: approvedProducts }, null, 2) + "\n"),
  fs.writeFile(approvedMediaPath, approvedMediaCsv),
]);
console.log(JSON.stringify({ ...report.totals, noApprovedPhoto: noPhotoRows.length, approvedProducts: approvedProducts.length, reasons: reasonCounts }, null, 2));
if (report.totals.total !== catalog.products.length) process.exitCode = 1;
