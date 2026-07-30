import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const registry = JSON.parse(
  await fs.readFile(
    path.join(root, "data/verticals/beauty-kz/supplier-brand-registry.json"),
    "utf8",
  ),
);
const priorityByStatus = { SELF_CLAIMED: "P1", DISCOVERED: "P2" };
const nextActionBySource = {
  WEB_OR_XLSX_REQUIRED:
    "Запросить BIN, прайс XLSX/CSV и подтверждение полномочий по брендам",
  XLSX_PDF_REQUIRED:
    "Запросить BIN, прайс XLSX/PDF, склад и подтверждение полномочий по брендам",
};
const brandsBySupplier = new Map(
  registry.suppliers.map((supplier) => [supplier.key, []]),
);
for (const brand of registry.brands) {
  for (const supplierKey of brand.supplierKeys)
    brandsBySupplier.get(supplierKey)?.push(brand);
}
const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const headers = [
  "priority",
  "supplierKey",
  "supplierName",
  "website",
  "sourceUrl",
  "verificationStatus",
  "brandCount",
  "brands",
  "categories",
  "catalogSourceType",
  "nextAction",
  "requiredEvidence",
];
const rows = registry.suppliers
  .map((supplier) => {
    const brands = brandsBySupplier.get(supplier.key) ?? [];
    return {
      priority: priorityByStatus[supplier.verificationStatus] ?? "P2",
      supplierKey: supplier.key,
      supplierName: supplier.name,
      website: supplier.website,
      sourceUrl: supplier.sourceUrl,
      verificationStatus: supplier.verificationStatus,
      brandCount: brands.length,
      brands: brands.map((brand) => brand.name).join("; "),
      categories: supplier.categories.join("; "),
      catalogSourceType: supplier.catalogSourceType,
      nextAction:
        nextActionBySource[supplier.catalogSourceType] ??
        "Запросить источник каталога и документы",
      requiredEvidence:
        "BIN; регистрационные документы; договор/ЭЦП; склад; источник каталога; лицензии/регистрационные документы на регулируемые товары",
    };
  })
  .sort(
    (left, right) =>
      left.priority.localeCompare(right.priority) ||
      right.brandCount - left.brandCount ||
      left.supplierName.localeCompare(right.supplierName, "ru"),
  );
const outputDir = path.join(root, "data/reports/beauty-kz");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  path.join(outputDir, "supplier-onboarding-queue.csv"),
  [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => quote(row[header])).join(",")),
  ].join("\n") + "\n",
);
await fs.writeFile(
  path.join(outputDir, "supplier-onboarding-queue.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      vertical: registry.vertical,
      market: registry.market,
      rows,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Beauty onboarding queue generated: ${rows.length} suppliers, ${registry.brands.length} brand mappings.`,
);
