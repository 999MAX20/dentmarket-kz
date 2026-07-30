import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";
import {
  buildDescriptionSources,
  generateCanonicalDescription,
  inferCatalogCategory,
  normalizeCatalogBrand,
  normalizeCatalogCategory,
  normalizeCatalogManufacturer,
  normalizeCatalogUnit,
  normalizeCanonicalName,
  normalizeSupplierName,
} from "./lib/product-copy.mjs";
import {
  extractVariantAttributes,
  normalizedCatalogIdentity,
} from "./lib/variant-attributes.mjs";
import { inferVerifiedVariantFamily } from "./lib/verified-variant-families.mjs";

const root = path.resolve(process.cwd());
const inputDir = path.join(root, "data/imports");
const output = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-fallback.json",
);
const approvedCatalogPath = path.join(
  root,
  "data/reports/production-approved-catalog.json",
);
const aliasesPath = path.join(root, "data/catalog-model-aliases-wave-1.csv");
const skuLabelsPath = path.join(root, "data/catalog-product-skus-wave-1.csv");
const primaryVariantFamiliesPath = path.join(
  root,
  "data/catalog-variant-families-wave-2.csv",
);
const brandVariantFamiliesDirectory = path.join(root, "data/catalog-variants");
const manufacturerRefAliasesPath = path.join(
  root,
  "data/catalog-manufacturer-ref-aliases.csv",
);
const files = (await fs.readdir(inputDir))
  .filter((file) => file.endsWith(".csv"))
  .sort();
const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const aliasRows = await fs
  .readFile(aliasesPath)
  .then((content) =>
    parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: true,
    }),
  )
  .catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
const skuLabelRows = await fs
  .readFile(skuLabelsPath)
  .then((content) =>
    parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: true,
    }),
  )
  .catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
const brandVariantFamiliesPaths = await fs
  .readdir(brandVariantFamiliesDirectory)
  .then((entries) =>
    entries
      .filter((entry) => entry.endsWith(".csv"))
      .sort()
      .map((entry) => path.join(brandVariantFamiliesDirectory, entry)),
  )
  .catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
const variantFamilyRows = (
  await Promise.all(
    [primaryVariantFamiliesPath, ...brandVariantFamiliesPaths].map((inputPath) =>
      fs.readFile(inputPath).then((content) =>
        parse(content, {
          columns: true,
          skip_empty_lines: true,
          bom: true,
          trim: true,
          relax_column_count: true,
        }),
      ),
    ),
  )
).flat();
const manufacturerRefAliasRows = await fs
  .readFile(manufacturerRefAliasesPath)
  .then((content) =>
    parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
      relax_column_count: true,
    }),
  )
  .catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
const variantFamilyBySourceName = new Map(
  variantFamilyRows.map((row) => [
    clean(row.sourceName).toLocaleLowerCase("ru"),
    row,
  ]),
);
const skuLabelByKey = new Map(
  skuLabelRows.map((row) => [
    `${[row.brand || "Без бренда", row.canonicalProductName]
      .map((value) => normalizedCatalogIdentity(value))
      .join("|")}|${clean(row.manufacturerRef).toLocaleLowerCase("ru")}`,
    clean(row.variantLabel),
  ]),
);
const manufacturerRefAliasesByKey = manufacturerRefAliasRows.reduce(
  (result, row) => {
    const key = `${[row.brand || "Без бренда", row.canonicalProductName]
      .map((value) => normalizedCatalogIdentity(value))
      .join("|")}|${clean(row.currentManufacturerRef).toLocaleLowerCase("ru")}`;
    if (!result.has(key)) result.set(key, new Set());
    if (clean(row.aliasManufacturerRef))
      result.get(key).add(clean(row.aliasManufacturerRef));
    return result;
  },
  new Map(),
);
const isManufacturerReference = (value) =>
  /^(?=.*\d)[a-z0-9][a-z0-9._/-]{3,}$/i.test(clean(value));
const aliasesByProduct = aliasRows.reduce((result, row) => {
  const key = [row.brand || "Без бренда", row.canonicalProductName]
    .map((value) => normalizedCatalogIdentity(value))
    .join("|");
  if (!result.has(key)) result.set(key, new Set());
  if (
    clean(row.alias) &&
    (clean(row.aliasType).toLocaleLowerCase("ru") === "search" ||
      !isManufacturerReference(row.alias))
  )
    result.get(key).add(clean(row.alias));
  return result;
}, new Map());
const referencesByProduct = aliasRows.reduce((result, row) => {
  const key = [row.brand || "Без бренда", row.canonicalProductName]
    .map((value) => normalizedCatalogIdentity(value))
    .join("|");
  if (!result.has(key)) result.set(key, new Set());
  if (
    clean(row.aliasType).toLocaleLowerCase("ru") !== "search" &&
    isManufacturerReference(row.alias)
  )
    result.get(key).add(clean(row.alias));
  return result;
}, new Map());
const canonicalProductByAlias = aliasRows.reduce((result, row) => {
  const brand = normalizedCatalogIdentity(row.brand || "Без бренда");
  const alias = normalizedCatalogIdentity(row.alias);
  const canonicalProductName = clean(row.canonicalProductName);
  if (!alias || !canonicalProductName) return result;
  const aliasKey = `${brand}|${alias}`;
  const existing = result.get(aliasKey);
  if (existing && existing !== canonicalProductName) {
    throw new Error(
      `Ambiguous catalog alias for ${row.brand}: ${row.alias} -> ${existing} / ${canonicalProductName}`,
    );
  }
  result.set(aliasKey, canonicalProductName);
  return result;
}, new Map());

const registerVariantFamily = (family) => {
  const key = [family.brand || "Без бренда", family.canonicalProductName]
    .map((value) => normalizedCatalogIdentity(value))
    .join("|");
  if (!referencesByProduct.has(key)) referencesByProduct.set(key, new Set());
  referencesByProduct.get(key).add(clean(family.manufacturerRef));
  skuLabelByKey.set(
    `${key}|${clean(family.manufacturerRef).toLocaleLowerCase("ru")}`,
    clean(family.variantLabel),
  );
  if (!aliasesByProduct.has(key)) aliasesByProduct.set(key, new Set());
  aliasesByProduct.get(key).add(clean(family.sourceName));
};

for (const family of variantFamilyRows) registerVariantFamily(family);

const first = (row, ...keys) =>
  keys.map((key) => clean(row[key])).find(Boolean) ?? "";
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
const number = (value) => {
  const normalized = clean(value)
    .replace(/[^0-9.,-]/g, "")
    .replace(/,/g, ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
};
const categoryName = (value) => normalizeCatalogCategory(value);
const validHttpUrl = (value) =>
  /^https?:\/\/[^\s]+$/i.test(value) ? value : null;
const sourceUrlScore = (value) => {
  if (!value) return 0;
  try {
    const url = new URL(value);
    return url.pathname.split("/").filter(Boolean).length;
  } catch {
    return 0;
  }
};
const dateValue = (value) =>
  /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(clean(value)) ? clean(value) : null;
const unitValue = (value) =>
  /^(?:шт\.?|уп\.?|набор|комплект|piece|pack)$/iu.test(clean(value))
    ? clean(value)
    : null;
const categoryValue = (value) => {
  const candidate = clean(value);
  if (
    !candidate ||
    validHttpUrl(candidate) ||
    dateValue(candidate) ||
    /^(?:KZT|RUB|USD|EUR)$/i.test(candidate)
  )
    return null;
  if (/^[\d.,+-]+$/.test(candidate)) return null;
  if (/^(?:в наличии|нет в наличии|есть|available)$/iu.test(candidate))
    return null;
  return candidate;
};

// Several early hand-built CSV files have one or two omitted empty cells.
// Recover their semantic values by type instead of silently dropping the rows.
const repairShiftedRow = (row) => {
  const sourceUrl =
    [row.sourceUrl, row.category, row.quantityOnHand, row.currency]
      .map(validHttpUrl)
      .find(Boolean) ?? null;
  const sourceUpdatedAt =
    [row.sourceUpdatedAt, row.sourceUrl, row.category, row.quantityOnHand]
      .map(dateValue)
      .find(Boolean) ?? null;
  const category =
    [row.category, row.quantityOnHand, row.currency]
      .map(categoryValue)
      .find(Boolean) ?? "";
  const recoveredUnit =
    unitValue(row.unit) ?? unitValue(row.manufacturer) ?? "";
  const manufacturer = unitValue(row.manufacturer)
    ? ""
    : clean(row.manufacturer);
  const quantityOnHand =
    validHttpUrl(row.quantityOnHand) || categoryValue(row.quantityOnHand)
      ? ""
      : clean(row.quantityOnHand);
  return {
    ...row,
    manufacturer,
    unit: recoveredUnit,
    category,
    sourceUrl,
    sourceUpdatedAt,
    quantityOnHand,
  };
};

const rows = [];
for (const file of files) {
  const parsed = parse(await fs.readFile(path.join(inputDir, file)), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  });
  for (const rawRow of parsed) {
    const row = repairShiftedRow(rawRow);
    const rawName = first(row, "name", "productName", "title");
    if (!rawName) continue;
    const source =
      first(row, "source") ||
      file.replace(/-catalog\.csv$/, "").replace(/\.csv$/, "");
    const supplier = normalizeSupplierName(
      first(row, "supplierName") || source,
    );
    const catalogOnly = /^(?:true|1|yes)$/i.test(first(row, "catalogOnly"));
    const rawBrand = first(row, "brand");
    const rawManufacturer = first(row, "manufacturer");
    const sourceUrl = validHttpUrl(first(row, "sourceUrl", "url"));
    const detectedBrand = normalizeCatalogBrand({
      brand: rawBrand,
      manufacturer: rawManufacturer,
      name: rawName,
      category: row.category,
    });
    const detectedManufacturer = normalizeCatalogManufacturer(
      rawManufacturer,
      detectedBrand,
    );
    // Manufacturer catalog rows are the naming authority. Keep the official
    // Latin model spelling intact; supplier rows still pass through cleanup.
    const detectedName = catalogOnly
      ? clean(rawName)
      : normalizeCanonicalName(rawName, {
          brand: detectedBrand,
          manufacturer: detectedManufacturer,
          sourceUrl,
        });
    const family =
      variantFamilyBySourceName.get(clean(rawName).toLocaleLowerCase("ru")) ??
      variantFamilyBySourceName.get(
        clean(detectedName).toLocaleLowerCase("ru"),
      ) ??
      inferVerifiedVariantFamily(rawName) ??
      inferVerifiedVariantFamily(detectedName);
    const brand = clean(family?.brand) || detectedBrand;
    const manufacturer = clean(family?.manufacturer) || detectedManufacturer;
    const canonicalAliasName =
      canonicalProductByAlias.get(
        `${normalizedCatalogIdentity(brand || "Без бренда")}|${normalizedCatalogIdentity(rawName)}`,
      ) ??
      canonicalProductByAlias.get(
        `${normalizedCatalogIdentity(brand || "Без бренда")}|${normalizedCatalogIdentity(detectedName)}`,
      );
    const name =
      clean(family?.canonicalProductName) ||
      clean(canonicalAliasName) ||
      detectedName;
    if (/^\d+$/.test(name)) continue;
    const category = inferCatalogCategory(
      name,
      categoryName(first(row, "category")),
    );
    const supplierSku =
      first(row, "supplierSku", "sku") || clean(family?.manufacturerRef);
    const externalId =
      first(row, "externalId", "id") ||
      supplierSku ||
      hash(`${source}|${name}`);
    const key = [brand || "Без бренда", name]
      .map((value) => normalizedCatalogIdentity(value))
      .join("|");
    if (family) registerVariantFamily(family);
    const idKey = [brand || "Без бренда", name]
      .map((value) => value.toLocaleLowerCase("ru"))
      .join("|");
    const priceMinor =
      number(first(row, "priceMinor")) ?? number(first(row, "price"));
    const quantityText = first(row, "quantityOnHand", "quantity");
    const quantity = number(quantityText);
    const available =
      quantity !== null
        ? quantity > 0
        : /в наличии|есть|available|готов/i.test(quantityText);
    // A row without a product page, article or commercial data is normally a
    // category heading accidentally exported as a product.
    if (!sourceUrl && !supplierSku && !priceMinor && quantity === null)
      continue;
    rows.push({
      key,
      idKey,
      name,
      brand: brand || null,
      manufacturer: manufacturer || null,
      category,
      supplier,
      supplierSku: supplierSku || null,
      externalId,
      source,
      rawName,
      sourceUrl,
      sourceUpdatedAt: first(row, "sourceUpdatedAt") || null,
      unit: normalizeCatalogUnit(first(row, "unit")),
      priceMinor,
      currency: first(row, "currency") || "KZT",
      quantity,
      available,
      catalogOnly,
      description: first(row, "description"),
    });
  }
}

const repeatedSourceNames = new Map();
for (const row of rows) {
  const repetitionKey = `${row.source}|${row.name.toLocaleLowerCase("ru")}`;
  repeatedSourceNames.set(
    repetitionKey,
    (repeatedSourceNames.get(repetitionKey) ?? 0) + 1,
  );
}
const quarantined = [...repeatedSourceNames.entries()].filter(
  ([, count]) => count > 25,
);
const quarantinedKeys = new Set(quarantined.map(([key]) => key));
const acceptedRows = rows.filter(
  (row) =>
    !quarantinedKeys.has(`${row.source}|${row.name.toLocaleLowerCase("ru")}`),
);

const grouped = new Map();
for (const row of acceptedRows) {
  const existing = grouped.get(row.key);
  if (!existing) {
    grouped.set(row.key, {
      ...row,
      suppliers: row.catalogOnly ? [] : [row.supplier],
      sourceRecords: [row],
    });
    continue;
  }
  if (!row.catalogOnly)
    existing.suppliers = [...new Set([...existing.suppliers, row.supplier])];
  existing.sourceRecords.push(row);
  if (!existing.brand && row.brand) existing.brand = row.brand;
  if (!existing.manufacturer && row.manufacturer)
    existing.manufacturer = row.manufacturer;
  if (
    normalizeCatalogCategory(existing.category) ===
      "Стоматологические материалы и оборудование" &&
    row.category
  )
    existing.category = row.category;
  if (!existing.priceMinor && row.priceMinor)
    existing.priceMinor = row.priceMinor;
  if (
    row.sourceUrl &&
    sourceUrlScore(row.sourceUrl) > sourceUrlScore(existing.sourceUrl)
  )
    existing.sourceUrl = row.sourceUrl;
  if (!existing.description && row.description)
    existing.description = row.description;
  existing.available ||= row.available;
  if (!existing.quantity && row.quantity) existing.quantity = row.quantity;
}

const products = [...grouped.values()].map((row) => {
  const id = `public-${hash(row.idKey ?? row.key)}`;
  const manufacturerReferences = [...(referencesByProduct.get(row.key) ?? [])];
  const variants = manufacturerReferences.length
    ? manufacturerReferences.map((sku) => ({
        id: `${id}-variant-${hash(sku.toLocaleLowerCase("ru"))}`,
        sku,
        gtin: null,
        aliases: [
          ...(manufacturerRefAliasesByKey.get(
            `${row.key}|${sku.toLocaleLowerCase("ru")}`,
          ) ?? []),
        ],
        label:
          skuLabelByKey.get(`${row.key}|${sku.toLocaleLowerCase("ru")}`) ??
          `REF ${sku}`,
        attributes: {
          ...extractVariantAttributes(
            skuLabelByKey.get(`${row.key}|${sku.toLocaleLowerCase("ru")}`) ??
              `REF ${sku}`,
          ),
          "Артикул производителя": sku,
        },
      }))
    : [
        {
          id: `${id}-variant-default`,
          sku: row.supplierSku || null,
          gtin: null,
          label: row.unit
            ? `Стандартная фасовка · ${row.unit}`
            : "Стандартный вариант",
          attributes: {},
        },
      ];
  const description =
    row.description ||
    generateCanonicalDescription({
      name: row.name,
      category: row.category,
      brand: row.brand,
      manufacturer: row.manufacturer,
      unit: row.unit,
      supplierCount: row.suppliers.length,
    });
  const attributes = [
    ["Категория", row.category],
    ["Бренд", row.brand],
    ["Производитель", row.manufacturer],
    ["Артикул поставщика", row.supplierSku],
    ["Единица", row.unit],
    ["Источники", String(row.sourceRecords.length)],
  ].filter(([, value]) => value);
  const offerRecords = [
    ...row.sourceRecords
      .filter((source) => !source.catalogOnly)
      .reduce((bySupplier, source) => {
        const offerKey = [source.supplier, source.supplierSku || "без артикула"]
          .map((value) => clean(value).toLocaleLowerCase("ru"))
          .join("|");
        const current = bySupplier.get(offerKey);
        const score = (item) =>
          (item.priceMinor ? 4 : 0) +
          (item.available ? 2 : 0) +
          (item.supplierSku ? 1 : 0);
        if (!current || score(source) > score(current))
          bySupplier.set(offerKey, source);
        return bySupplier;
      }, new Map())
      .values(),
  ];
  const resolvedOfferRecords = offerRecords
    .map((source) => {
      const matchedVariant =
        variants.find(
          (variant) =>
            variant.sku &&
            source.supplierSku &&
            variant.sku.toLocaleLowerCase("ru") ===
              source.supplierSku.toLocaleLowerCase("ru"),
        ) ?? (variants.length === 1 ? variants[0] : null);
      return matchedVariant ? { source, matchedVariant } : null;
    })
    .filter(Boolean);
  const offers = resolvedOfferRecords.map(
    ({ source, matchedVariant }, index) => ({
      id: `${id}-offer-${index}`,
      variantId: matchedVariant.id,
      supplier: {
        id: `supplier-${hash(source.supplier)}`,
        name: source.supplier,
      },
      priceMinor: source.priceMinor ? String(source.priceMinor) : null,
      currency: source.currency,
      normalizedPriceMinor: source.priceMinor
        ? String(source.priceMinor)
        : null,
      packaging: {
        name: source.unit || "шт",
        quantityInBaseUnit: "1",
        unit: source.unit || "шт",
      },
      available: source.available,
      confirmationMode: "MANUAL",
      deliveryMethods: ["NATIONWIDE"],
      supplierSku: source.supplierSku,
      verifiedDocuments: false,
      officialDistributor: false,
      supplierWarranty: false,
    }),
  );
  const pricedOffers = resolvedOfferRecords
    .map(({ source }) => source.priceMinor)
    .filter(Boolean);
  const minPriceMinor = pricedOffers.length ? Math.min(...pricedOffers) : null;
  return {
    id,
    name: row.name,
    description,
    descriptionSources: buildDescriptionSources(row),
    brand: row.brand,
    manufacturer: row.manufacturer,
    category: row.category,
    sourceUrl: row.sourceUrl,
    sourceUpdatedAt: row.sourceUpdatedAt,
    attributes,
    aliases: [...(aliasesByProduct.get(row.key) ?? [])],
    variants,
    photoStatus: "category_illustration",
    catalogSource: row.sourceRecords.some((source) => source.catalogOnly)
      ? "manufacturer"
      : "supplier",
    minNormalizedPriceMinor: minPriceMinor ? String(minPriceMinor) : null,
    isAvailable: resolvedOfferRecords.some(({ source }) => source.available),
    offers,
  };
});

const approvedCatalog = await fs
  .readFile(approvedCatalogPath, "utf8")
  .then((content) => JSON.parse(content))
  .catch((error) => {
    if (error?.code === "ENOENT") return { products: [] };
    throw error;
  });
const fallbackKeys = new Set(
  products.map((product) =>
    [product.brand ?? "", product.name]
      .map((value) => normalizedCatalogIdentity(value))
      .join("|"),
  ),
);
const approvedOnlyProducts = (approvedCatalog.products ?? [])
  .filter((product) => product && product.name && product.id)
  .filter((product) => {
    const key = [product.brand ?? "", product.name]
      .map((value) => normalizedCatalogIdentity(value))
      .join("|");
    if (fallbackKeys.has(key)) return false;
    fallbackKeys.add(key);
    return true;
  })
  .map((product) => {
    const usedLabels = new Set();
    const variants = (product.variants ?? []).map((variant, index) => {
      const sku = variant.sku ?? null;
      const rawLabel = String(variant.label ?? `Вариант ${index + 1}`).trim();
      const baseLabel =
        /^REF(?:\s|$)/iu.test(rawLabel) ||
        (sku && rawLabel.toLocaleLowerCase("ru") === sku.toLocaleLowerCase("ru"))
          ? `${product.name} · REF ${sku ?? index + 1}`
          : rawLabel;
      let label = baseLabel;
      if (usedLabels.has(label.toLocaleLowerCase("ru"))) {
        label = `${baseLabel} · REF ${sku ?? index + 1}`;
      }
      usedLabels.add(label.toLocaleLowerCase("ru"));
      return {
        ...variant,
        id: variant.id ?? `${product.id}-variant-${index + 1}`,
        sku,
        label,
        attributes: {
          ...(variant.attributes ?? {}),
          ...(sku ? { "Артикул производителя": sku } : {}),
        },
      };
    });
    return {
    id: product.id,
    name: product.name,
    description: product.description ?? "",
    descriptionSources: undefined,
    brand: product.brand ?? null,
    manufacturer: product.manufacturer ?? null,
    category: product.category ?? "Стоматологические товары",
    sourceUrl: product.sourceUrl ?? null,
    sourceUpdatedAt: product.sourceUpdatedAt ?? null,
    attributes: product.attributes ?? [],
    aliases: [],
    variants,
    media: product.imageUrl
      ? [
          {
            id: `${product.id}-approved-media`,
            sourceUrl: product.imageUrl,
            securePath: null,
            normalizedStorageKey: null,
            altText: product.name,
            width: null,
            height: null,
            metadata: {
              exactProductPhoto: true,
              rightsStatus:
                "OFFICIAL_SOURCE_REQUIRES_PLATFORM_RIGHTS_CONFIRMATION",
              sourceImageUrl: product.imageUrl,
              visualCompliance: "source_verified",
            },
          },
        ]
      : [],
    photoStatus: product.photoStatus ?? "exact",
    catalogSource: product.catalogSource ?? "manufacturer",
    minNormalizedPriceMinor: null,
    isAvailable: false,
    offers: [],
  };
  });
products.push(...approvedOnlyProducts);
for (const product of products) {
  if (clean(product.description).length >= 35) continue;
  product.description = generateCanonicalDescription({
    name: product.name,
    category: product.category,
    brand: product.brand,
    manufacturer: product.manufacturer,
    unit: product.attributes?.find?.(([key]) => key === "Единица")?.[1],
    supplierCount: product.offers?.length || 1,
  });
  if (product.description.length < 35) {
    product.description += " Комплектация и артикул уточняются в предложении поставщика.";
  }
  product.descriptionStatus = "GENERATED_FROM_CANONICAL_FIELDS";
}
products.sort((a, b) => a.name.localeCompare(b.name, "ru"));
const quarantine = quarantined.map(([key, rowCount]) => {
  const separator = key.indexOf("|");
  return {
    source: key.slice(0, separator),
    repeatedName: key.slice(separator + 1),
    rowCount,
    reason: "Одинаковое название повторяется в разных URL",
  };
});
await fs.writeFile(
  output,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), sourceFiles: files, total: products.length, approvedCanonicalCards: approvedOnlyProducts.length, quarantine, products }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      output,
      sourceFiles: files.length,
      sourceRows: rows.length,
      acceptedRows: acceptedRows.length,
      quarantinedRows: rows.length - acceptedRows.length,
      canonicalCards: products.length,
      approvedCanonicalCards: approvedOnlyProducts.length,
    },
    null,
    2,
  ),
);
