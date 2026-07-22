import fs from "node:fs/promises";
import path from "node:path";

const registryPath = path.resolve("data/kz-market-brands.json");
const catalogPath = path.resolve("apps/buyer-web/app/data/public-catalog-fallback.json");
const mediaPath = path.resolve("apps/buyer-web/app/data/public-catalog-media.json");
const csvOutputPath = path.resolve("data/curation/kz-catalog-intake-queue.csv");
const jsonOutputPath = path.resolve("data/reports/kz-catalog-intake-audit.json");
const markdownOutputPath = path.resolve("data/reports/kz-catalog-intake-audit.md");

const [registry, catalog, media] = await Promise.all([
  fs.readFile(registryPath, "utf8").then(JSON.parse),
  fs.readFile(catalogPath, "utf8").then(JSON.parse),
  fs.readFile(mediaPath, "utf8").then(JSON.parse),
]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const identity = (value) => clean(value).toLocaleLowerCase("ru");
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const validHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};
const registeredBrands = new Set([
  ...(registry.existingCatalogBrands ?? []),
  ...(registry.sources ?? []).flatMap((source) => source.brands ?? []),
].map(identity));
const weakEvidenceBrands = new Set(
  (registry.sources ?? [])
    .filter((source) => source.evidenceLevel === "KZ_MARKET_OBSERVED_REVIEW_REQUIRED")
    .flatMap((source) => source.brands ?? [])
    .map(identity),
);
const strongerEvidenceBrands = new Set(
  (registry.sources ?? [])
    .filter((source) => source.evidenceLevel !== "KZ_MARKET_OBSERVED_REVIEW_REQUIRED")
    .flatMap((source) => source.brands ?? [])
    .map(identity),
);

const genericNames = new Set([
  "акции",
  "каталог",
  "мерчи",
  "оборудование",
  "инструменты",
  "стоматологические материалы",
  "стоматологические товары",
  "стоматологические материалы и оборудование",
]);
const looksLikeNoise = (product) => {
  const name = identity(product.name);
  if (!name || name.length < 4 || genericNames.has(name)) return true;
  if (/^(?:товар|позиция|модель|артикул|набор)\s*\d*$/iu.test(name)) return true;
  if (/^(?:https?:\/\/|www\.)/iu.test(name)) return true;
  return false;
};
const meaningfulReference = (value) => {
  const reference = clean(value);
  if (!reference || /^(?:без артикула|стандарт|default|null)$/iu.test(reference)) return false;
  return /[\p{L}\d]/u.test(reference) && reference.length >= 3;
};
const hasModelIdentity = (product) => {
  if ((product.variants ?? []).some((variant) => meaningfulReference(variant.sku) || meaningfulReference(variant.gtin))) {
    return true;
  }
  if (product.catalogSource === "manufacturer") return true;
  const name = clean(product.name);
  return /(?=.*\d)[A-ZА-ЯЁ\d][A-ZА-ЯЁ\d._/+\-]{2,}/u.test(name) ||
    /\b[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,3}\b/u.test(name);
};
const mediaRecordFor = (product) =>
  validHttpUrl(product.sourceUrl) ? media.entries?.[product.sourceUrl] ?? null : null;
const exactPhoto = (product) => {
  const record = mediaRecordFor(product);
  return Boolean(record?.securePath && record?.metadata?.exactProductPhoto === true);
};
const verifiedPhotoRights = (product) => {
  const status = clean(mediaRecordFor(product)?.metadata?.rightsStatus);
  return /^(?:MANUFACTURER_APPROVED|LICENSED|OWNED|PUBLIC_DOMAIN)$/u.test(status);
};

const rows = (catalog.products ?? []).map((product) => {
  const brand = clean(product.brand);
  const brandKey = identity(brand);
  const sourcePresent = validHttpUrl(product.sourceUrl);
  const identityPresent = hasModelIdentity(product);
  const photoExact = exactPhoto(product);
  const photoRightsVerified = verifiedPhotoRights(product);
  let status;
  let reason;
  if (looksLikeNoise(product)) {
    status = "REJECT_NOISE";
    reason = "Generic heading, malformed title or non-product row";
  } else if (!brand) {
    status = "BRAND_REQUIRED";
    reason = "Canonical card cannot be published without a confirmed brand";
  } else if (!registeredBrands.has(brandKey)) {
    status = "KZ_MARKET_EVIDENCE_REQUIRED";
    reason = "Brand is not present in the Kazakhstan market registry";
  } else if (!sourcePresent) {
    status = "SOURCE_REQUIRED";
    reason = "No exact source page is attached";
  } else if (!identityPresent) {
    status = "IDENTITY_REQUIRED";
    reason = "Exact model, manufacturer reference or GTIN is missing";
  } else if (weakEvidenceBrands.has(brandKey) && !strongerEvidenceBrands.has(brandKey)) {
    status = "KZ_EVIDENCE_REVIEW_REQUIRED";
    reason = "Only marketplace or classifieds evidence is currently recorded";
  } else {
    status = "CANONICAL_CONTENT_READY";
    reason = "Brand, Kazakhstan evidence, exact source and model identity are present";
  }
  return {
    productId: product.id,
    brand,
    name: clean(product.name),
    status,
    reason,
    identityPresent: identityPresent ? "YES" : "NO",
    sourcePresent: sourcePresent ? "YES" : "NO",
    exactPhoto: photoExact ? "YES" : "NO",
    verifiedPhotoRights: photoRightsVerified ? "YES" : "NO",
    sourceUrl: clean(product.sourceUrl),
    nextAction:
      status === "CANONICAL_CONTENT_READY"
        ? photoExact && photoRightsVerified
          ? "READY_FOR_FINAL_REVIEW"
          : "VERIFY_OR_REPLACE_PRODUCT_PHOTO"
        : status,
  };
});

const countBy = (field) =>
  Object.fromEntries(
    [...rows.reduce((counts, row) => counts.set(row[field], (counts.get(row[field]) ?? 0) + 1), new Map())]
      .sort((left, right) => right[1] - left[1]),
  );
const report = {
  generatedAt: new Date().toISOString(),
  policy: registry.policy,
  totals: {
    cards: rows.length,
    canonicalContentReady: rows.filter((row) => row.status === "CANONICAL_CONTENT_READY").length,
    finalReviewReady: rows.filter((row) => row.nextAction === "READY_FOR_FINAL_REVIEW").length,
    exactProductPhoto: rows.filter((row) => row.exactPhoto === "YES").length,
    verifiedPhotoRights: rows.filter((row) => row.verifiedPhotoRights === "YES").length,
  },
  byStatus: countBy("status"),
  byNextAction: countBy("nextAction"),
};
const headers = [
  "productId",
  "brand",
  "name",
  "status",
  "reason",
  "identityPresent",
  "sourcePresent",
  "exactPhoto",
  "verifiedPhotoRights",
  "sourceUrl",
  "nextAction",
];
const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
].join("\n") + "\n";
const markdown = [
  "# Kazakhstan catalog intake audit",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  `- Cards inspected: ${report.totals.cards}`,
  `- Canonical content ready: ${report.totals.canonicalContentReady}`,
  `- Ready for final review, including licensed media: ${report.totals.finalReviewReady}`,
  `- Exact product photos found: ${report.totals.exactProductPhoto}`,
  `- Photo rights verified: ${report.totals.verifiedPhotoRights}`,
  "",
  "## Statuses",
  "",
  ...Object.entries(report.byStatus).map(([status, count]) => `- ${status}: ${count}`),
  "",
  "A seller listing is evidence only. It does not create a canonical card or seller offer automatically.",
  "",
].join("\n");

await fs.mkdir(path.dirname(csvOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(csvOutputPath, csv),
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(markdownOutputPath, markdown),
]);
console.log(JSON.stringify(report, null, 2));
