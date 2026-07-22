import fs from "node:fs/promises";
import path from "node:path";

const sources = [
  { file: "nordstom-full-catalog.json", label: "NORD STOM KZ", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "toboom-manufacturer-catalog.json", label: "TOBOOM official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "vladmiva-dental-catalog.json", label: "ВладМиВа official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "ztdental-manufacturer-catalog.json", label: "ZT Dental official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
];
const inputDir = path.resolve("data/catalog-evidence");
const jsonOutputPath = path.resolve("data/reports/manufacturer-catalog-evidence-audit.json");
const mdOutputPath = path.resolve("data/reports/manufacturer-catalog-evidence-audit.md");
const queueOutputPath = path.resolve("data/curation/manufacturer-catalog-readiness-queue.csv");

const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const imageCount = (product) => Number(product.imageCount ?? (clean(product.sourceImageUrl) ? 1 : 0));
const references = (product) => clean(product.manufacturerRefs || product.manufacturerRef);
const productId = (product) => clean(product.localId || product.officialProductId);

const rows = [];
const sourceSummaries = [];
for (const source of sources) {
  const report = JSON.parse(await fs.readFile(path.join(inputDir, source.file), "utf8"));
  const products = report.products ?? [];
  const sourceRows = products.map((product) => {
    const hasPhoto = imageCount(product) > 0;
    const hasReference = Boolean(references(product));
    const hasIdentity = Boolean(clean(product.brand) && clean(product.name) && productId(product));
    const readiness = !hasIdentity
      ? "IDENTITY_REQUIRED"
      : !hasPhoto
        ? "PHOTO_REQUIRED"
        : !hasReference
          ? "MANUFACTURER_REFERENCE_REQUIRED"
          : source.marketEvidence === "EXACT_KZ_LISTING"
            ? "CANONICAL_CONTENT_READY"
            : "KZ_SKU_EVIDENCE_REQUIRED";
    return {
      source: source.label,
      sourceFile: source.file,
      brand: clean(product.brand),
      name: clean(product.name),
      productId: productId(product),
      manufacturerRefs: references(product),
      variantCount: Number(product.variantCount ?? 1),
      imageCount: imageCount(product),
      sourcePageUrl: clean(product.sourcePageUrl),
      marketEvidence: source.marketEvidence,
      readiness,
    };
  });
  rows.push(...sourceRows);
  sourceSummaries.push({
    source: source.label,
    products: sourceRows.length,
    withPhoto: sourceRows.filter((row) => row.imageCount > 0).length,
    withReference: sourceRows.filter((row) => row.manufacturerRefs).length,
    variantSkus: sourceRows.reduce((sum, row) => sum + Math.max(1, row.variantCount), 0),
    canonicalContentReady: sourceRows.filter((row) => row.readiness === "CANONICAL_CONTENT_READY").length,
    kzSkuEvidenceRequired: sourceRows.filter((row) => row.readiness === "KZ_SKU_EVIDENCE_REQUIRED").length,
  });
}

const statusCounts = rows.reduce((counts, row) => {
  counts[row.readiness] = (counts[row.readiness] ?? 0) + 1;
  return counts;
}, {});
const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    exactPhotoRequired: true,
    manufacturerReferenceRequired: true,
    kzSkuEvidenceRequiredForAutomaticPublication: true,
    missingFieldsNeverDeleteCard: true,
  },
  totals: {
    products: rows.length,
    variantSkus: rows.reduce((sum, row) => sum + Math.max(1, row.variantCount), 0),
    withPhoto: rows.filter((row) => row.imageCount > 0).length,
    withoutPhoto: rows.filter((row) => row.imageCount === 0).length,
    withManufacturerReference: rows.filter((row) => row.manufacturerRefs).length,
    withoutManufacturerReference: rows.filter((row) => !row.manufacturerRefs).length,
    statusCounts,
  },
  sources: sourceSummaries,
};

const headers = [
  "source",
  "brand",
  "name",
  "productId",
  "manufacturerRefs",
  "variantCount",
  "imageCount",
  "marketEvidence",
  "readiness",
  "sourcePageUrl",
  "sourceFile",
];
const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
].join("\n") + "\n";
const md = `# Manufacturer catalog evidence audit

Generated: ${report.generatedAt}

## Rules

- Missing photos or references never delete a discovered product card.
- Automatic publication requires an exact product photo, manufacturer identity and KZ evidence for the exact SKU.
- Brand-level KZ presence is enough for collection, but not for automatic publication of every global SKU.

## Totals

- Product records: ${report.totals.products}
- Variant SKUs: ${report.totals.variantSkus}
- Exact source photos: ${report.totals.withPhoto}
- Photo required: ${report.totals.withoutPhoto}
- Manufacturer reference present: ${report.totals.withManufacturerReference}
- Manufacturer reference required: ${report.totals.withoutManufacturerReference}

## Sources

| Source | Products | Variant SKUs | Photo | Ref | Ready | KZ SKU evidence required |
|---|---:|---:|---:|---:|---:|---:|
${sourceSummaries.map((source) => `| ${source.source} | ${source.products} | ${source.variantSkus} | ${source.withPhoto} | ${source.withReference} | ${source.canonicalContentReady} | ${source.kzSkuEvidenceRequired} |`).join("\n")}

## Readiness

${Object.entries(statusCounts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `- ${status}: ${count}`).join("\n")}
`;

await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(mdOutputPath, md),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
