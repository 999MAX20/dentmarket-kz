import fs from "node:fs/promises";
import path from "node:path";

const variantsPath = path.resolve("data/catalog-variant-families-wave-2.csv");
const evidencePath = path.resolve("data/catalog-kz-market-evidence.csv");
const skuEvidencePath = path.resolve("data/catalog-kz-sku-evidence.csv");
const expansionPath = path.resolve("data/catalog-expansion-wave-1.csv");
const catalogPath = path.resolve("apps/buyer-web/app/data/public-catalog-fallback.json");
const csvOutputPath = path.resolve("data/reports/catalog-kz-sku-coverage.csv");
const jsonOutputPath = path.resolve("data/reports/catalog-kz-coverage.json");
const markdownOutputPath = path.resolve("data/reports/catalog-kz-coverage.md");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else value += character;
  }
  if (value || row.length) {
    row.push(value);
    if (row.some(Boolean)) rows.push(row);
  }
  const [headers, ...records] = rows;
  return records.map((record, rowIndex) => {
    if (record.length > headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${record.length} columns; expected ${headers.length}`);
    }
    while (record.length < headers.length) record.push("");
    return Object.fromEntries(headers.map((header, index) => [header, record[index].trim()]));
  });
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function key(brand, productName) {
  return `${brand}|${productName}`.toLocaleLowerCase("ru");
}

const [variantText, evidenceText, skuEvidenceText, expansionText, catalog] = await Promise.all([
  fs.readFile(variantsPath, "utf8"),
  fs.readFile(evidencePath, "utf8"),
  fs.readFile(skuEvidencePath, "utf8"),
  fs.readFile(expansionPath, "utf8"),
  fs.readFile(catalogPath, "utf8").then(JSON.parse),
]);
const variants = parseCsv(variantText);
const officialReferenceVariants = variants.filter(
  (variant) => variant.referenceType !== "LOCAL_CATALOG_ID",
);
const evidence = parseCsv(evidenceText);
const skuEvidence = parseCsv(skuEvidenceText);
const expansion = parseCsv(expansionText);
const evidenceByCard = new Map(evidence.map((record) => [key(record.brand, record.canonicalProductName), record]));
const skuEvidenceByReference = new Map(skuEvidence.map((record) => [`${record.brand}|${record.manufacturerRef}`.toLocaleLowerCase("ru"), record]));
const publishedCards = new Set((catalog.products ?? []).map((product) => key(product.brand, product.name)));
const variantsByReference = officialReferenceVariants.reduce((groups, variant, index) => {
  if (!variant.manufacturerRef) throw new Error(`Variant row ${index + 2} is missing manufacturerRef`);
  const referenceKey = `${variant.brand}|${variant.manufacturerRef}`.toLocaleLowerCase("ru");
  const group = groups.get(referenceKey) ?? [];
  group.push(variant);
  groups.set(referenceKey, group);
  return groups;
}, new Map());
const rows = [...variantsByReference.values()].map((referenceVariants) => {
  const [variant] = referenceVariants;
  const canonicalFamilies = new Set(referenceVariants.map((item) => key(item.brand, item.canonicalProductName)));
  if (canonicalFamilies.size > 1) {
    throw new Error(`Ambiguous manufacturer reference: ${variant.brand} ${variant.manufacturerRef}`);
  }
  const marketEvidence = evidenceByCard.get(key(variant.brand, variant.canonicalProductName));
  const exactSkuEvidence = skuEvidenceByReference.get(`${variant.brand}|${variant.manufacturerRef}`.toLocaleLowerCase("ru"));
  return {
    brand: variant.brand,
    manufacturer: variant.manufacturer,
    canonicalProductName: variant.canonicalProductName,
    manufacturerRef: variant.manufacturerRef,
    sourceAliases: [...new Set(referenceVariants.map((item) => item.sourceName))].join(" | "),
    variantLabel: variant.variantLabel,
    kzStatus: exactSkuEvidence?.kzStatus ?? (marketEvidence ? "KZ_FAMILY_CONFIRMED_VARIANT_REVIEW_REQUIRED" : "KZ_CONFIRMATION_REQUIRED"),
    publishedCard: publishedCards.has(key(variant.brand, variant.canonicalProductName)) ? "YES" : "NO",
    evidenceUrl: exactSkuEvidence?.evidenceUrl ?? marketEvidence?.evidenceUrl ?? "",
    lastChecked: exactSkuEvidence?.lastChecked ?? marketEvidence?.lastChecked ?? "",
    notes: exactSkuEvidence?.notes ?? marketEvidence?.notes ?? "Official reference retained; Kazakhstan availability has not been confirmed",
  };
});

const headers = ["brand", "manufacturer", "canonicalProductName", "manufacturerRef", "sourceAliases", "variantLabel", "kzStatus", "publishedCard", "evidenceUrl", "lastChecked", "notes"];
const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(","))].join("\n") + "\n";
const brands = [...new Set([
  ...rows.map((row) => row.brand),
  ...expansion.map((row) => row.brand),
  ...(catalog.products ?? []).map((product) => product.brand).filter(Boolean),
])].sort((a, b) => a.localeCompare(b));
const brandCoverage = brands.map((brand) => {
  const brandRows = rows.filter((row) => row.brand === brand);
  const expansionRows = expansion.filter((row) => row.brand === brand);
  const publishedFamilies = new Set((catalog.products ?? []).filter((product) => product.brand === brand).map((product) => product.name));
  const kzMarketFamilies = new Set(evidence.filter((row) => row.brand === brand).map((row) => row.canonicalProductName));
  const kzSkuConfirmedFamilies = new Set(brandRows.filter((row) => row.kzStatus === "KZ_SKU_CONFIRMED").map((row) => row.canonicalProductName));
  const coverageStatus = kzMarketFamilies.size > 0
    ? "KZ_AUDIT_IN_PROGRESS"
    : expansionRows.length > 0 || brandRows.length > 0
      ? "KZ_AUDIT_REQUIRED"
      : "NOT_CLASSIFIED";
  return {
    brand,
    coverageStatus,
    references: brandRows.length,
    kzConfirmedReferences: brandRows.filter((row) => row.kzStatus === "KZ_SKU_CONFIRMED").length,
    confirmationRequiredReferences: brandRows.filter((row) => row.kzStatus !== "KZ_SKU_CONFIRMED").length,
    publishedReferences: brandRows.filter((row) => row.publishedCard === "YES").length,
    canonicalFamilies: new Set(brandRows.map((row) => row.canonicalProductName)).size,
    kzMarketFamilies: kzMarketFamilies.size,
    kzSkuConfirmedFamilies: kzSkuConfirmedFamilies.size,
    publishedFamilies: publishedFamilies.size,
    expansionFamilies: new Set(expansionRows.map((row) => row.canonicalProductName)).size,
  };
});
const report = {
  generatedAt: new Date().toISOString(),
  policy: {
    referenceKey: "brand + manufacturerRef",
    publishRule: "Kazakhstan evidence is tracked independently from the global manufacturer catalog",
    unconfirmedReferencesAreDeleted: false,
    unconfirmedReferencesCanMatchSupplierUploads: true,
    sellerOfferCreatesDuplicateCard: false,
  },
  totals: {
    references: rows.length,
    kzConfirmedReferences: rows.filter((row) => row.kzStatus === "KZ_SKU_CONFIRMED").length,
    confirmationRequiredReferences: rows.filter((row) => row.kzStatus !== "KZ_SKU_CONFIRMED").length,
    publishedReferences: rows.filter((row) => row.publishedCard === "YES").length,
    ambiguousReferences: 0,
  },
  brands: brandCoverage,
};
const markdown = [
  "# Kazakhstan SKU coverage",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "| Brand | Audit status | References | Exact KZ refs | KZ review | Published-card refs | Ref families | KZ market families | Exact KZ families | Public cards | Expansion queue |",
  "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ...brandCoverage.map((brand) => `| ${brand.brand} | ${brand.coverageStatus} | ${brand.references} | ${brand.kzConfirmedReferences} | ${brand.confirmationRequiredReferences} | ${brand.publishedReferences} | ${brand.canonicalFamilies} | ${brand.kzMarketFamilies} | ${brand.kzSkuConfirmedFamilies} | ${brand.publishedFamilies} | ${brand.expansionFamilies} |`),
  "",
  "Unconfirmed references remain available for supplier-file matching, but do not become seller offers without the normal checks.",
  "",
].join("\n");

await fs.mkdir(path.dirname(csvOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(csvOutputPath, csv),
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(markdownOutputPath, markdown),
]);
console.log(JSON.stringify(report.totals, null, 2));
