import fs from "node:fs/promises";
import path from "node:path";

const inputPath = path.resolve("data/kz-market-brands.json");
const csvOutputPath = path.resolve("data/reports/kz-market-brand-registry.csv");
const markdownOutputPath = path.resolve("data/reports/kz-market-brand-registry.md");

const registry = JSON.parse(await fs.readFile(inputPath, "utf8"));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const identity = (value) => clean(value).toLocaleLowerCase("ru");
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

if (!/^\d{4}-\d{2}-\d{2}$/.test(registry.updatedAt)) {
  throw new Error("updatedAt must use YYYY-MM-DD");
}

const existingBrands = new Map();
for (const brand of registry.existingCatalogBrands ?? []) {
  if (!clean(brand)) throw new Error("Existing catalog contains an empty brand");
  const key = identity(brand);
  if (existingBrands.has(key)) throw new Error(`Duplicate existing brand: ${brand}`);
  existingBrands.set(key, clean(brand));
}

const evidenceByBrand = new Map();
for (const source of registry.sources ?? []) {
  if (!clean(source.id) || !clean(source.name) || !clean(source.type) || !clean(source.evidenceLevel)) {
    throw new Error("Every source must have id, name, type and evidenceLevel");
  }
  new URL(source.url);
  for (const brand of source.brands ?? []) {
    if (!clean(brand)) throw new Error(`Source ${source.id} contains an empty brand`);
    const key = identity(brand);
    const record = evidenceByBrand.get(key) ?? {
      brand: clean(brand),
      sources: [],
    };
    if (record.brand !== clean(brand)) {
      throw new Error(`Brand spelling conflict: ${record.brand} / ${brand}`);
    }
    record.sources.push({
      id: source.id,
      name: source.name,
      type: source.type,
      evidenceLevel: source.evidenceLevel,
      url: source.url,
    });
    evidenceByBrand.set(key, record);
  }
}

const allKeys = new Set([...existingBrands.keys(), ...evidenceByBrand.keys()]);
const rows = [...allKeys]
  .map((key) => {
    const evidence = evidenceByBrand.get(key);
    const brand = existingBrands.get(key) ?? evidence?.brand;
    return {
      brand,
      inCatalog: existingBrands.has(key) ? "YES" : "NO",
      sourceCount: evidence?.sources.length ?? 0,
      evidenceLevels: [...new Set(evidence?.sources.map((source) => source.evidenceLevel) ?? [])].join(" | "),
      sourceTypes: [...new Set(evidence?.sources.map((source) => source.type) ?? [])].join(" | "),
      sourceNames: [...new Set(evidence?.sources.map((source) => source.name) ?? [])].join(" | "),
      evidenceUrls: [...new Set(evidence?.sources.map((source) => source.url) ?? [])].join(" | "),
      nextAction: existingBrands.has(key)
        ? "AUDIT_COMPLETE_KZ_LINE_AND_REFERENCES"
        : "BUILD_CANONICAL_MANUFACTURER_CATALOG",
      updatedAt: registry.updatedAt,
    };
  })
  .sort((left, right) => left.brand.localeCompare(right.brand, "ru"));

const missingEvidence = rows.filter((row) => row.sourceCount === 0);
if (missingEvidence.length) {
  throw new Error(`Brands without Kazakhstan evidence: ${missingEvidence.map((row) => row.brand).join(", ")}`);
}

const headers = [
  "brand",
  "inCatalog",
  "sourceCount",
  "evidenceLevels",
  "sourceTypes",
  "sourceNames",
  "evidenceUrls",
  "nextAction",
  "updatedAt",
];
const csv = [
  headers.join(","),
  ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(",")),
].join("\n") + "\n";

const marketplaceOnly = rows.filter(
  (row) =>
    row.sourceTypes === "KZ_MARKETPLACE_OR_CLASSIFIEDS" ||
    row.evidenceLevels === "KZ_MARKET_OBSERVED_REVIEW_REQUIRED",
);
const markdown = [
  "# Kazakhstan dental brand market registry",
  "",
  `Updated: ${registry.updatedAt}`,
  "",
  `- Brands: ${rows.length}`,
  `- Already represented in the canonical catalog: ${rows.filter((row) => row.inCatalog === "YES").length}`,
  `- New catalog programs: ${rows.filter((row) => row.inCatalog === "NO").length}`,
  `- Marketplace-only evidence requiring stronger confirmation: ${marketplaceOnly.length}`,
  "",
  "Market presence is evidence for assortment research, not proof of an official distributorship.",
  "Seller listings never create seller offers or canonical cards automatically.",
  "",
  "| Brand | In catalog | Evidence sources | Next action |",
  "|---|---:|---:|---|",
  ...rows.map((row) => `| ${row.brand} | ${row.inCatalog} | ${row.sourceCount} | ${row.nextAction} |`),
  "",
].join("\n");

await fs.mkdir(path.dirname(csvOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(csvOutputPath, csv),
  fs.writeFile(markdownOutputPath, markdown),
]);

console.log(
  JSON.stringify(
    {
      brands: rows.length,
      existingCatalogBrands: rows.filter((row) => row.inCatalog === "YES").length,
      newCatalogPrograms: rows.filter((row) => row.inCatalog === "NO").length,
      marketplaceOnlyEvidence: marketplaceOnly.length,
      sources: registry.sources.length,
    },
    null,
    2,
  ),
);
