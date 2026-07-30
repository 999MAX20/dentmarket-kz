import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const registry = JSON.parse(
  await fs.readFile(
    path.join(root, "data/verticals/beauty-kz/supplier-brand-registry.json"),
    "utf8",
  ),
);
const policy = JSON.parse(
  await fs.readFile(
    path.join(root, "data/verticals/beauty-kz/canonical-intake-policy.json"),
    "utf8",
  ),
);
const reportsDir = path.join(root, "data/reports/beauty-kz");
const parseCsv = (input) => {
  const [header, ...rows] = input.trim().split(/\r?\n/);
  if (!header) return [];
  const headers = header.split(",");
  return rows
    .filter(Boolean)
    .map((row) =>
      Object.fromEntries(
        row
          .split(",")
          .map((value, index) => [headers[index], value.replace(/^"|"$/g, "")]),
      ),
    );
};
const results = [];
for (const source of policy.sources) {
  const file = path.join(root, source.template);
  const rows = parseCsv(await fs.readFile(file, "utf8"));
  const validRows = rows.filter((row) => row.externalId && row.name);
  const commercialRows = validRows.filter(
    (row) => row.priceMinor || row.quantityOnHand || row.currency,
  );
  results.push({
    supplierKey: source.supplierKey,
    template: source.template,
    brands: registry.brands.filter((brand) =>
      brand.supplierKeys.includes(source.supplierKey),
    ).length,
    rows: validRows.length,
    canonicalReady: validRows.length,
    commercialRows: commercialRows.length,
    status: validRows.length
      ? "READY_FOR_CANONICAL_REVIEW"
      : "WAITING_FOR_CATALOG_FILE",
    commercialDataPolicy: commercialRows.length
      ? "COMMERCIAL_FIELDS_DETECTED_AND_KEPT_SEPARATE"
      : "NO_PRICE_OR_STOCK_EXPECTED",
  });
}
await fs.mkdir(reportsDir, { recursive: true });
await fs.writeFile(
  path.join(reportsDir, "canonical-intake-report.json"),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), policy, results },
    null,
    2,
  ) + "\n",
);
await fs.writeFile(
  path.join(reportsDir, "canonical-intake-report.md"),
  [
    "# Beauty KZ canonical intake report",
    "",
    "| Поставщик | Бренды | Строки | Готово к canonical | Коммерческие поля | Статус |",
    "|---|---:|---:|---:|---:|---|",
    ...results.map(
      (item) =>
        `| ${item.supplierKey} | ${item.brands} | ${item.rows} | ${item.canonicalReady} | ${item.commercialRows} | ${item.status} |`,
    ),
    "",
    "Цена и остаток не являются обязательными для создания canonical-карточки.",
  ].join("\n") + "\n",
);
console.log(
  `Beauty canonical intake report generated: ${results.length} suppliers, ${results.reduce((sum, item) => sum + item.canonicalReady, 0)} canonical-ready rows.`,
);
