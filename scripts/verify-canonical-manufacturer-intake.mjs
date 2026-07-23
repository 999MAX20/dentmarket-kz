import fs from "node:fs/promises";
import path from "node:path";

const catalog = JSON.parse(await fs.readFile(path.resolve("data/reports/canonical-manufacturer-intake.json"), "utf8"));
const coverage = JSON.parse(await fs.readFile(path.resolve("data/reports/kz-brand-catalog-coverage.json"), "utf8"));
const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
const key = (value) => clean(value).toLocaleLowerCase("ru").replace(/[®™]/gu, "");
const ids = new Set(); const refs = new Set(); const duplicateIds = []; const duplicateRefs = []; const invalidPublishableImages = []; const invalidRefs = []; const emptyVariantLabels = [];
const rejectedAsset = /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image|awaiting|example|coming[-_]?soon|systemoverview|indications-and-product-groups)/iu;
for (const product of catalog.products ?? []) {
  if (ids.has(product.canonicalProductId)) duplicateIds.push(product.canonicalProductId); ids.add(product.canonicalProductId);
  if (product.publishableImageUrl && rejectedAsset.test(product.publishableImageUrl)) invalidPublishableImages.push({ canonicalProductId: product.canonicalProductId, url: product.publishableImageUrl });
  for (const variant of product.variants ?? []) {
    if (!clean(variant.variantLabel)) emptyVariantLabels.push(product.canonicalProductId);
    const manufacturerRef = clean(variant.manufacturerRef); if (!manufacturerRef) continue;
    if (/^(?:n\/?a|none|null|undefined|nr|lex|ined|ore|ormed|rigerated)$/iu.test(manufacturerRef)) invalidRefs.push({ canonicalProductId: product.canonicalProductId, manufacturerRef });
    const refKey = `${key(product.brand)}\u0000${key(manufacturerRef)}`; if (refs.has(refKey)) duplicateRefs.push({ brand: product.brand, manufacturerRef }); refs.add(refKey);
  }
}
const unresolvedCoverage = (coverage.brands ?? []).filter((brand) => !["STRUCTURED_EVIDENCE_COLLECTED", "MARKET_LABEL_CLASSIFIED_NO_CANONICAL_CATALOG"].includes(brand.status));
const failures = { duplicateIds, duplicateRefs, invalidPublishableImages, invalidRefs, emptyVariantLabels, unresolvedCoverage };
const failureCount = Object.values(failures).reduce((sum, rows) => sum + rows.length, 0);
const result = { verdict: failureCount ? "FAIL" : "PASS", marketBrands: coverage.totals.marketBrands, structuredBrands: coverage.totals.STRUCTURED_EVIDENCE_COLLECTED ?? 0, classifiedMarketLabels: coverage.totals.MARKET_LABEL_CLASSIFIED_NO_CANONICAL_CATALOG ?? 0, canonicalProducts: catalog.totals.canonicalProducts, canonicalVariants: catalog.totals.canonicalVariantSkus, canonicalReferences: refs.size, publishablePhotos: catalog.totals.productsWithPublishablePhoto, quarantinedPhotos: catalog.totals.photoReviewRequired, cardsRetainedWithoutPhoto: catalog.totals.photoRequired + catalog.totals.photoReviewRequired, failureCount, failures };
console.log(JSON.stringify(result, null, 2));
if (failureCount) process.exitCode = 1;
