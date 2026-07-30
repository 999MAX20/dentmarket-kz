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
const parseCsvLine = (line) => {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += char;
  }
  cells.push(value);
  return cells;
};
const parseCsv = (input) => {
  const [header, ...lines] = input
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\r?\n/);
  if (!header) return [];
  const headers = parseCsvLine(header);
  return lines
    .filter(Boolean)
    .map((line) =>
      Object.fromEntries(
        parseCsvLine(line).map((value, index) => [headers[index], value]),
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
