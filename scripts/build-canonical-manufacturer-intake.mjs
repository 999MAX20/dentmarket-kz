import fs from "node:fs/promises";
import path from "node:path";

const evidenceDir = path.resolve("data/catalog-evidence");
const outputPath = path.resolve("data/reports/canonical-manufacturer-intake.json");
const markdownPath = path.resolve("data/reports/canonical-manufacturer-intake.md");
const queuePath = path.resolve("data/curation/canonical-manufacturer-intake-queue.csv");
const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const key = (value) => clean(value).toLocaleLowerCase("ru").replace(/[®™]/gu, "");
const firstProductImage = (product) => {
  const direct = clean(product?.sourceImageUrl);
  if (direct) return direct;
  const candidates = Array.isArray(product?.imageUrls)
    ? product.imageUrls
    : clean(product?.imageUrls).split(/\s*\|\s*/u);
  return clean(candidates.find((candidate) => clean(candidate)));
};
const normalizeVariant = (variant, fallbackName, fallbackStatus = "MANUFACTURER_REFERENCE_REQUIRED") => {
  if (typeof variant === "string" || typeof variant === "number") {
    return { variantLabel: clean(variant) || fallbackName, manufacturerRef: "", status: fallbackStatus };
  }
  const source = variant && typeof variant === "object" ? variant : {};
  const manufacturerRef = clean(source.manufacturerRef || source.reference || source.ref || source.sku);
  return {
    ...source,
    variantLabel: clean(source.variantLabel || source.label || source.name || source.value) || (manufacturerRef ? `REF ${manufacturerRef}` : fallbackName),
    manufacturerRef,
    status: clean(source.status) || (manufacturerRef ? "CANONICAL_REFERENCE_READY" : fallbackStatus),
  };
};
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const files = (await fs.readdir(evidenceDir)).filter((file) => file.endsWith(".json") && file !== "kz-market-label-classifications.json").sort();
const records = [];

for (const sourceFile of files) {
  let report;
  try { report = JSON.parse(await fs.readFile(path.join(evidenceDir, sourceFile), "utf8")); } catch { continue; }
  if (!Array.isArray(report.products)) continue;
  for (const [index, product] of report.products.entries()) {
    const brand = clean(product.brand || report.brand);
    const name = clean(product.name);
    if (!brand || !name) continue;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const variantOccurrences = variants.map((variant) => normalizeVariant(variant, name)).filter((variant) => variant.manufacturerRef);
    if (!variantOccurrences.length) {
      for (const manufacturerRef of clean(product.manufacturerRefs || product.manufacturerRef).split(/\s*\|\s*/u).filter(Boolean)) variantOccurrences.push({ manufacturerRef, variantLabel: `REF ${manufacturerRef}` });
    }
    const uniqueVariants = [...new Map(variantOccurrences.map((variant) => [variant.manufacturerRef, variant])).values()];
    records.push({
      recordKey: `${sourceFile}:${index}`,
      sourceFile,
      sourceType: clean(report.sourceType),
      brand,
      brandKey: key(brand),
      name,
      product,
      variants: uniqueVariants,
      sourceProductId: clean(product.officialProductId || product.localId),
    });
  }
}

const authorityScore = (record, variant) => {
  const officialFile = /manufacturer|official|catalog|solventum|durr|iqdent|woodpecker|kuraray|kulzer|vita|fomos|kerr|voco|vrn|wh-|nsk-/iu.test(record.sourceFile) ? 30 : 0;
  const marketListing = /denti-kz|nordstom|stomir|fallback/iu.test(record.sourceFile) ? -10 : 0;
  const photo = firstProductImage(record.product) ? 8 : 0;
  const identity = record.sourceProductId ? 4 : 0;
  const label = clean(variant?.variantLabel).length > 10 ? 3 : 0;
  return officialFile + marketListing + photo + identity + label + Math.min(5, record.name.length / 40);
};

const occurrencesByReference = new Map();
for (const record of records) for (const variant of record.variants) {
  const referenceKey = `${record.brandKey}\u0000${key(variant.manufacturerRef)}`;
  const occurrences = occurrencesByReference.get(referenceKey) ?? [];
  occurrences.push({ record, variant });
  occurrencesByReference.set(referenceKey, occurrences);
}

const assignedByRecord = new Map();
const mergedIntoRecord = new Map();
let duplicateReferenceOccurrencesMerged = 0;
for (const occurrences of occurrencesByReference.values()) {
  occurrences.sort((a, b) => authorityScore(b.record, b.variant) - authorityScore(a.record, a.variant) || a.record.recordKey.localeCompare(b.record.recordKey));
  const winner = occurrences[0];
  const assigned = assignedByRecord.get(winner.record.recordKey) ?? [];
  assigned.push(winner.variant);
  assignedByRecord.set(winner.record.recordKey, assigned);
  if (occurrences.length > 1) {
    duplicateReferenceOccurrencesMerged += occurrences.length - 1;
    const merged = mergedIntoRecord.get(winner.record.recordKey) ?? [];
    for (const occurrence of occurrences.slice(1)) merged.push({ sourceFile: occurrence.record.sourceFile, sourceProductId: occurrence.record.sourceProductId, name: occurrence.record.name, manufacturerRef: occurrence.variant.manufacturerRef });
    mergedIntoRecord.set(winner.record.recordKey, merged);
  }
}

const canonicalProducts = [];
const idCounts = new Map();
const makeId = (record, assignedVariants) => {
  const basis = assignedVariants[0]?.manufacturerRef || record.sourceProductId || record.name;
  const base = `CANON-${record.brand}-${basis}`.normalize("NFKD").replace(/[^A-Z0-9А-ЯЁ]+/giu, "-").replace(/^-+|-+$/gu, "").toUpperCase().slice(0, 120);
  const count = (idCounts.get(base) ?? 0) + 1; idCounts.set(base, count); return count === 1 ? base : `${base}-${count}`;
};
for (const record of records) {
  const assignedVariants = assignedByRecord.get(record.recordKey) ?? [];
  if (record.variants.length && !assignedVariants.length) continue;
  if (!record.variants.length) {
    const nameKey = `${record.brandKey}\u0000${key(record.name)}`;
    const betterDuplicate = records.find((candidate) => candidate.recordKey !== record.recordKey && !candidate.variants.length && `${candidate.brandKey}\u0000${key(candidate.name)}` === nameKey && authorityScore(candidate) > authorityScore(record));
    if (betterDuplicate) continue;
  }
  const sourceVariants = Array.isArray(record.product.variants) && record.product.variants.length ? record.product.variants : [{}];
  const variants = assignedVariants.length
    ? assignedVariants.map((variant) => normalizeVariant(variant, record.name, "CANONICAL_REFERENCE_READY"))
    : sourceVariants.map((variant) => normalizeVariant(variant, record.name));
  const refs = variants.map((variant) => clean(variant.manufacturerRef)).filter(Boolean);
  const mergedSources = mergedIntoRecord.get(record.recordKey) ?? [];
  const sourceImageUrl = firstProductImage(record.product);
  canonicalProducts.push({
    canonicalProductId: makeId(record, assignedVariants), brand: record.brand, manufacturer: clean(record.product.manufacturer), name: record.name,
    manufacturerRef: refs[0] ?? "", manufacturerRefs: refs.join(" | "), model: clean(record.product.model), variantCount: Math.max(1, variants.length), variants,
    categoryPath: clean(record.product.categoryPath), description: clean(record.product.description), sourceImageUrl, imageUrls: clean(record.product.imageUrls || sourceImageUrl), imageCount: Number(record.product.imageCount ?? (sourceImageUrl ? 1 : 0)),
    sourcePageUrl: clean(record.product.sourcePageUrl), sourceEvidenceFiles: [...new Set([record.sourceFile, ...mergedSources.map((source) => source.sourceFile)])], sourceProductIds: [...new Set([record.sourceProductId, ...mergedSources.map((source) => source.sourceProductId)].filter(Boolean))], mergedSourceProducts: mergedSources,
    kzEvidence: clean(record.product.kzEvidence), status: !sourceImageUrl ? "PHOTO_REQUIRED" : refs.length ? "KZ_SKU_EVIDENCE_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED",
  });
}
canonicalProducts.sort((a, b) => a.brand.localeCompare(b.brand, "ru") || a.name.localeCompare(b.name, "ru"));
const imageOccurrences = new Map();
for (const product of canonicalProducts) if (product.sourceImageUrl) { const linked = imageOccurrences.get(product.sourceImageUrl) ?? []; linked.push(product); imageOccurrences.set(product.sourceImageUrl, linked); }
const genericAssetPattern = /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image|awaiting|example|coming[-_]?soon|systemoverview|indications-and-product-groups)/iu;
for (const product of canonicalProducts) {
  const evidenceImageUrl = product.sourceImageUrl;
  const sharedCount = evidenceImageUrl ? (imageOccurrences.get(evidenceImageUrl)?.length ?? 0) : 0;
  const photoStatus = !evidenceImageUrl ? "PHOTO_REQUIRED" : genericAssetPattern.test(evidenceImageUrl) ? "GENERIC_ASSET_REJECTED" : sharedCount > 1 ? "SHARED_IMAGE_REVIEW_REQUIRED" : "EXACT_SOURCE_SINGLE_CARD";
  product.evidenceImageUrl = evidenceImageUrl;
  product.publishableImageUrl = photoStatus === "EXACT_SOURCE_SINGLE_CARD" ? evidenceImageUrl : "";
  product.photoStatus = photoStatus;
  product.imageCount = product.publishableImageUrl ? 1 : 0;
  product.status = !product.publishableImageUrl ? (photoStatus === "PHOTO_REQUIRED" ? "PHOTO_REQUIRED" : "PHOTO_REVIEW_REQUIRED") : product.manufacturerRefs ? "KZ_SKU_EVIDENCE_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED";
}

const canonicalRefKeys = new Set();
const duplicateReferences = [];
for (const product of canonicalProducts) for (const ref of clean(product.manufacturerRefs).split(/\s*\|\s*/u).filter(Boolean)) { const refKey = `${key(product.brand)}\u0000${key(ref)}`; if (canonicalRefKeys.has(refKey)) duplicateReferences.push({ brand: product.brand, manufacturerRef: ref, canonicalProductId: product.canonicalProductId }); canonicalRefKeys.add(refKey); }
const report = {
  generatedAt: new Date().toISOString(),
  policy: { oneCanonicalCardPerBrandAndManufacturerReference: true, duplicateSourceObservationsMergedNotDeleted: true, referenceFreeDiscoveredProductsPreservedByBrandAndName: true, missingPhotoNeverDeletesCard: true, exactKzSkuEvidenceRequiredBeforeAutomaticPublication: true },
  totals: { evidenceFiles: files.length, sourceProductRecords: records.length, canonicalProducts: canonicalProducts.length, canonicalVariantSkus: canonicalProducts.reduce((sum, product) => sum + Math.max(1, product.variantCount), 0), canonicalManufacturerReferences: canonicalRefKeys.size, duplicateReferencesAcrossCanonicalProducts: duplicateReferences.length, duplicateReferenceOccurrencesMerged, productsWithPublishablePhoto: canonicalProducts.filter((product) => product.publishableImageUrl).length, photoRequired: canonicalProducts.filter((product) => product.photoStatus === "PHOTO_REQUIRED").length, photoReviewRequired: canonicalProducts.filter((product) => ["GENERIC_ASSET_REJECTED", "SHARED_IMAGE_REVIEW_REQUIRED"].includes(product.photoStatus)).length, genericAssetsRejected: canonicalProducts.filter((product) => product.photoStatus === "GENERIC_ASSET_REJECTED").length, sharedImagesQuarantined: canonicalProducts.filter((product) => product.photoStatus === "SHARED_IMAGE_REVIEW_REQUIRED").length, manufacturerReferenceRequired: canonicalProducts.filter((product) => !product.manufacturerRefs).length },
  duplicateReferences,
  products: canonicalProducts,
};
const headers = ["canonicalProductId", "brand", "name", "manufacturerRefs", "variantCount", "photoStatus", "publishableImageUrl", "evidenceImageUrl", "status", "sourcePageUrl", "sourceEvidenceFiles"];
const csv = [headers.join(","), ...canonicalProducts.map((product) => headers.map((header) => escapeCsv(Array.isArray(product[header]) ? product[header].join(" | ") : product[header])).join(","))].join("\n") + "\n";
const markdown = `# Canonical manufacturer intake\n\nGenerated: ${report.generatedAt}\n\n- Source product records: ${report.totals.sourceProductRecords}\n- Canonical product cards: ${report.totals.canonicalProducts}\n- Canonical variants: ${report.totals.canonicalVariantSkus}\n- Manufacturer references: ${report.totals.canonicalManufacturerReferences}\n- Duplicate references across canonical cards: ${report.totals.duplicateReferencesAcrossCanonicalProducts}\n- Duplicate source observations merged: ${report.totals.duplicateReferenceOccurrencesMerged}\n- Publishable exact source photos: ${report.totals.productsWithPublishablePhoto}\n- Photo required: ${report.totals.photoRequired}\n- Shared or generic images quarantined: ${report.totals.photoReviewRequired}\n- Manufacturer reference required: ${report.totals.manufacturerReferenceRequired}\n\nCards are never deleted because of a missing photo or reference. Shared, generic and placeholder imagery remains as evidence but is excluded from automatic publication. Global manufacturer products still require exact Kazakhstan SKU evidence before automatic publication.\n`;
const atomicWrite = async (targetPath, contents) => {
  const temporaryPath = `${targetPath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, contents);
  await fs.rename(temporaryPath, targetPath);
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(queuePath), { recursive: true });
await Promise.all([
  atomicWrite(outputPath, JSON.stringify(report, null, 2) + "\n"),
  atomicWrite(markdownPath, markdown),
  atomicWrite(queuePath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
if (duplicateReferences.length) process.exitCode = 1;
