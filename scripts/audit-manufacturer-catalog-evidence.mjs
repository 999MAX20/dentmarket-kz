import fs from "node:fs/promises";
import path from "node:path";

const sources = [
  { file: "nordstom-full-catalog.json", label: "NORD STOM KZ", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "toboom-manufacturer-catalog.json", label: "TOBOOM official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "vladmiva-dental-catalog.json", label: "ВладМиВа official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "ztdental-manufacturer-catalog.json", label: "ZT Dental official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "pierrot-manufacturer-catalog.json", label: "Pierrot official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "latus-manufacturer-catalog.json", label: "LaTus official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "dentkist-manufacturer-catalog.json", label: "DentKist official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "cormed-manufacturer-catalog.json", label: "Кормед official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "saeshin-manufacturer-catalog.json", label: "Saeshin official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "nic-manufacturer-catalog.json", label: "NIC official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "imd-manufacturer-catalog.json", label: "IMD official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "alpha-bio-kz-catalog.json", label: "Alpha-Bio Tec. official KZ representative", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "osstem-kz-catalog.json", label: "Osstem Kazakhstan", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "medesy-manufacturer-catalog.json", label: "MEDESY official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "septodont-manufacturer-catalog.json", label: "Septodont official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "zhermack-manufacturer-catalog.json", label: "Zhermack official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "melag-manufacturer-catalog.json", label: "MELAG official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "dio-manufacturer-catalog.json", label: "DIO official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "medit-manufacturer-catalog.json", label: "Medit official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "shining3d-manufacturer-catalog.json", label: "SHINING 3D official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "genoray-manufacturer-catalog.json", label: "Genoray official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "good-doctors-manufacturer-catalog.json", label: "Good Doctors official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "osung-manufacturer-catalog.json", label: "OSUNG official distributor", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "bego-manufacturer-catalog.json", label: "BEGO official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "durr-dental-manufacturer-catalog.json", label: "Dürr Dental official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "ray-manufacturer-catalog.json", label: "RAY official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "myobrace-manufacturer-catalog.json", label: "Myobrace official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "kavo-manufacturer-catalog.json", label: "KaVo official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "morita-manufacturer-catalog.json", label: "Morita official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "revyline-kz-catalog.json", label: "Revyline Kazakhstan official", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "binergia-manufacturer-catalog.json", label: "Бинергия official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "lintex-manufacturer-catalog.json", label: "Линтэкс official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "medidez-kz-catalog.json", label: "МедиДез Kazakhstan official", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "aes-kz-catalog.json", label: "Aes observed in Kazakhstan", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "biola-kz-catalog.json", label: "BIOLA observed in Kazakhstan", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "amazing-white-manufacturer-catalog.json", label: "Amazing White official importer", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "anthos-manufacturer-catalog.json", label: "Anthos official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "denti-kz-brand-listings.json", label: "Denti.kz exact brand listings", marketEvidence: "EXACT_KZ_LISTING" },
  { file: "averon-manufacturer-catalog.json", label: "Averon official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "bilumix-manufacturer-catalog.json", label: "BiLumix official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "ajax-manufacturer-catalog.json", label: "Ajax official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "dental-art-manufacturer-catalog.json", label: "Dental Art official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "castellini-manufacturer-catalog.json", label: "Castellini official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "diplomat-dental-manufacturer-catalog.json", label: "Diplomat Dental official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "doctor-smile-manufacturer-catalog.json", label: "Doctor Smile official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "dental-x-regional-catalog.json", label: "Dental X regional brand catalog", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "denu-manufacturer-catalog.json", label: "DENU / HDI official catalog", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "up3d-manufacturer-catalog.json", label: "UP3D official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "myray-manufacturer-catalog.json", label: "MyRay official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "mgf-manufacturer-catalog.json", label: "MGF official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "kaeser-dental-catalog.json", label: "Kaeser dental official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "humanchemie-manufacturer-catalog.json", label: "Humanchemie official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "madespa-manufacturer-catalog.json", label: "Madespa official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "handy-manufacturer-catalog.json", label: "Handy official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "olident-manufacturer-catalog.json", label: "Olident official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "falcon-manufacturer-catalog.json", label: "Falcon official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "sani-manufacturer-catalog.json", label: "SANI official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "nti-manufacturer-catalog.json", label: "NTI official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "strauss-manufacturer-catalog.json", label: "Strauss official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "suntem-manufacturer-catalog.json", label: "Suntem official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "mercury-manufacturer-catalog.json", label: "Mercury official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "gapadent-manufacturer-catalog.json", label: "Gapadent KZ and verified range", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "draeger-anesthesia-catalog.json", label: "Dräger official anesthesia range", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "bisco-manufacturer-catalog.json", label: "BISCO official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "gc-europe-catalog.json", label: "GC Europe official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "nsk-manufacturer-catalog.json", label: "NSK official Japan", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "wh-manufacturer-catalog.json", label: "W&H official global", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "ultradent-manufacturer-catalog.json", label: "Ultradent official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "ivoclar-russia-catalog.json", label: "Ivoclar official Russian range", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "tealth-manufacturer-catalog.json", label: "Tealth official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "cicada-manufacturer-catalog.json", label: "CICADA official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "youjoy-manufacturer-catalog.json", label: "YouJoy official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "shofu-manufacturer-catalog.json", label: "Shofu official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "voco-manufacturer-catalog.json", label: "VOCO official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "kuraray-noritake-manufacturer-catalog.json", label: "Kuraray Noritake official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "kulzer-manufacturer-catalog.json", label: "Kulzer official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "vita-manufacturer-catalog.json", label: "VITA official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "lm-dental-manufacturer-catalog.json", label: "LM Dental official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "woodpecker-manufacturer-catalog.json", label: "Woodpecker official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "fomos-manufacturer-catalog.json", label: "FOMOS official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "dentsply-sirona-manufacturer-catalog.json", label: "Dentsply Sirona official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "kerr-manufacturer-catalog.json", label: "Kerr official regional catalog", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "solventum-dental-catalog.json", label: "Solventum official oral care", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "vrn-manufacturer-catalog.json", label: "VRN official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
  { file: "iqdent-manufacturer-catalog.json", label: "IQ Dent official", marketEvidence: "KZ_BRAND_AND_SELECTED_SKUS" },
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
