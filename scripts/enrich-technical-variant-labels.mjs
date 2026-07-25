import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const evidenceDirectory = "data/catalog-evidence";
const catalogFiles = [
  "apps/buyer-web/app/data/production-approved-catalog.json",
  "apps/buyer-web/app/data/public-catalog-fallback.json",
];

function normalize(value) {
  return String(value ?? "")
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

function isTechnicalLabel(label, sku) {
  const value = String(label ?? "").trim();
  return (
    !value ||
    /^ref(?:\s|$)/i.test(value) ||
    /^sku(?:\s|$)/i.test(value) ||
    (sku && normalize(value) === normalize(sku)) ||
    value.toLocaleLowerCase("ru") === "стандартный вариант"
  );
}

function cleanEvidenceLabel(value) {
  return String(value ?? "")
    .replace(/^\s*(?:REF|SKU)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulLabel(label, ref) {
  const value = cleanEvidenceLabel(label);
  return (
    value.length >= 2 &&
    !/^[A-ZА-Я0-9._/-]+$/i.test(value) &&
    normalize(value) !== normalize(ref)
  );
}

const labelsByBrandAndRef = new Map();
function addLabel(brand, ref, label) {
  if (!brand || !ref || !isMeaningfulLabel(label, ref)) return;
  const key = `${normalize(brand)}|${normalize(ref)}`;
  if (!labelsByBrandAndRef.has(key))
    labelsByBrandAndRef.set(key, cleanEvidenceLabel(label));
}

for (const file of await readdir(evidenceDirectory)) {
  if (!file.endsWith(".json")) continue;
  let document;
  try {
    document = JSON.parse(
      await readFile(path.join(evidenceDirectory, file), "utf8"),
    );
  } catch {
    continue;
  }
  const products = Array.isArray(document)
    ? document
    : document.products ?? document.items ?? [];
  if (!Array.isArray(products)) continue;
  for (const product of products) {
    const brand = product.brand ?? document.brand;
    if (typeof product.variants === "string") {
      for (const entry of product.variants.split(/\s*\|\s*/)) {
        const separator = entry.lastIndexOf("=");
        if (separator <= 0) continue;
        addLabel(
          brand,
          entry.slice(separator + 1),
          entry.slice(0, separator),
        );
      }
    } else if (Array.isArray(product.variants)) {
      for (const variant of product.variants)
        addLabel(
          brand,
          variant.manufacturerRef ?? variant.sku ?? variant.ref,
          variant.name ?? variant.label ?? variant.variantLabel,
        );
    }
  }
}

function attributesLabel(variant) {
  const excluded = /артикул|sku|ref|gtin|бренд|производител/i;
  const entries = Object.entries(variant.attributes ?? {}).filter(
    ([key, value]) => !excluded.test(key) && String(value ?? "").trim(),
  );
  if (!entries.length) return null;
  return entries
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
}

let evidenceLabels = 0;
let attributeLabels = 0;
let singleVariantLabels = 0;
let queuedForEnrichment = 0;
let duplicateLabelsSeparated = 0;

for (const catalogFile of catalogFiles) {
  const document = JSON.parse(await readFile(catalogFile, "utf8"));
  const products = Array.isArray(document) ? document : document.products;
  for (const product of products) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const unresolved = [];
    for (const [index, variant] of variants.entries()) {
      if (!isTechnicalLabel(variant.label, variant.sku)) continue;
      const evidence = labelsByBrandAndRef.get(
        `${normalize(product.brand)}|${normalize(variant.sku)}`,
      );
      const fromAttributes = attributesLabel(variant);
      if (evidence) {
        variant.label = evidence;
        variant.attributes = {
          ...(variant.attributes ?? {}),
          "Комплектация": evidence,
        };
        evidenceLabels += 1;
      } else if (fromAttributes) {
        variant.label = fromAttributes;
        attributeLabels += 1;
      } else if (variants.length === 1) {
        variant.label = "Основная комплектация";
        singleVariantLabels += 1;
      } else {
        variant.label = `Комплектация производителя ${index + 1}`;
        unresolved.push(variant.sku ?? variant.id);
        queuedForEnrichment += 1;
      }
    }
    if (unresolved.length) {
      product.moderationWarnings = [
        ...new Set([
          ...(product.moderationWarnings ?? []),
          "VARIANT_LABEL_ENRICHMENT_REQUIRED",
        ]),
      ];
      product.commerceModel = {
        ...(product.commerceModel ?? {}),
        status: "VARIANT_LABEL_ENRICHMENT_REQUIRED",
        unresolvedVariantReferences: unresolved,
      };
    }
    const variantsByLabel = new Map();
    for (const variant of variants) {
      const key = normalize(variant.label);
      if (!key) continue;
      const group = variantsByLabel.get(key) ?? [];
      group.push(variant);
      variantsByLabel.set(key, group);
    }
    for (const group of variantsByLabel.values()) {
      if (group.length < 2) continue;
      group.forEach((variant, index) => {
        const baseLabel = String(variant.label).trim();
        const label = `${baseLabel} · исполнение ${index + 1}`;
        variant.label = label;
        variant.attributes = {
          ...(variant.attributes ?? {}),
          "Комплектация": label,
        };
        duplicateLabelsSeparated += 1;
      });
    }
  }
  await writeFile(catalogFile, `${JSON.stringify(document, null, 2)}\n`);
}

console.log(
  JSON.stringify({
    evidenceLabels,
    attributeLabels,
    singleVariantLabels,
    queuedForEnrichment,
    duplicateLabelsSeparated,
  }),
);
