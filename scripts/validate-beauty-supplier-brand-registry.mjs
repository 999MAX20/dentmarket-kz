import { readFile } from "node:fs/promises";

const file = new URL(
  "../data/verticals/beauty-kz/supplier-brand-registry.json",
  import.meta.url,
);
const registry = JSON.parse(await readFile(file, "utf8"));
const fail = (message) => {
  console.error(`Beauty registry: ${message}`);
  process.exitCode = 1;
};
const unique = (items, label) => {
  const keys = items.map((item) => item.key);
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  if (duplicates.length)
    fail(`duplicate ${label} keys: ${[...new Set(duplicates)].join(", ")}`);
};

if (
  registry.schemaVersion !== 1 ||
  registry.vertical !== "beauty-kz" ||
  registry.market !== "KZ"
)
  fail("invalid registry header");
unique(registry.suppliers, "supplier");
unique(registry.brands, "brand");
const supplierKeys = new Set(
  registry.suppliers.map((supplier) => supplier.key),
);
const categoryCodes = new Set([
  "professional-cosmetics",
  "face-care",
  "body-care",
  "hair-care",
  "nail-products",
  "lash-brow-products",
  "disposables",
  "salon-equipment",
  "beauty-tools",
  "sterilization",
  "spa-products",
  "training-materials",
]);
for (const supplier of registry.suppliers) {
  if (!supplier.website || !supplier.sourceUrl || !supplier.verificationStatus)
    fail(`supplier ${supplier.key} is missing evidence metadata`);
  for (const category of supplier.categories)
    if (!categoryCodes.has(category))
      fail(`unknown supplier category ${category}`);
}
for (const brand of registry.brands) {
  if (!brand.name || !brand.sourceUrls?.length || !brand.supplierKeys?.length)
    fail(`brand ${brand.key} is missing evidence metadata`);
  for (const supplierKey of brand.supplierKeys)
    if (!supplierKeys.has(supplierKey))
      fail(`brand ${brand.key} references unknown supplier ${supplierKey}`);
  for (const category of brand.categories)
    if (!categoryCodes.has(category))
      fail(`unknown brand category ${category}`);
}
if (!process.exitCode)
  console.log(
    `Beauty registry is valid: ${registry.suppliers.length} suppliers, ${registry.brands.length} brands.`,
  );
