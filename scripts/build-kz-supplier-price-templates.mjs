import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = path.resolve(process.cwd());
const registryPath = path.join(root, "data/suppliers-kz-registry.csv");
const catalogPath = path.join(root, "apps/buyer-web/app/data/public-catalog-fallback.json");
const outputDirectory = path.join(root, "data/templates/kz-suppliers");
const suppliers = parse(await fs.readFile(registryPath), { columns: true, skip_empty_lines: true, bom: true });
const catalog = JSON.parse(await fs.readFile(catalogPath));

const slug = (value) => String(value ?? "supplier").toLocaleLowerCase("ru").replace(/[^a-zа-я0-9]+/giu, "-").replace(/^-|-$/gu, "") || "supplier";
const host = (value) => {
  try { return new URL(value).hostname.replace(/^www\./iu, ""); } catch { return ""; }
};
const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const columns = [
  "canonicalProductId", "canonicalVariantId", "canonicalProductName", "canonicalBrand", "canonicalManufacturer", "canonicalCategory",
  "canonicalSourceUrl", "sourceEvidenceStatus", "supplierSku", "supplierProductName", "price", "currency", "stock", "warehouse",
  "leadTimeDays", "availableFrom", "licenseDocumentUrl", "rowAction",
];

const rowsFor = (supplier) => {
  const supplierHost = host(supplier.website);
  return (catalog.products ?? [])
    .filter((product) => supplierHost && host(product.sourceUrl) === supplierHost)
    .flatMap((product) => {
      const variants = product.variants?.length ? product.variants : [{ id: "", label: product.name }];
      return variants.map((variant) => ({
        canonicalProductId: product.id,
        canonicalVariantId: variant.id ?? "",
        canonicalProductName: product.name,
        canonicalBrand: product.brand ?? "",
        canonicalManufacturer: product.manufacturer ?? "",
        canonicalCategory: product.category?.name ?? product.categoryPath ?? "",
        canonicalSourceUrl: product.sourceUrl ?? "",
        sourceEvidenceStatus: "PUBLIC_SOURCE_REQUIRES_SUPPLIER_CONFIRMATION",
        supplierSku: "",
        supplierProductName: "",
        price: "",
        currency: "KZT",
        stock: "",
        warehouse: "",
        leadTimeDays: "",
        availableFrom: "",
        licenseDocumentUrl: "",
        rowAction: "CONFIRM_AND_FILL_COMMERCIAL_DATA",
      }));
    });
};

const renderCsv = (rows) => `${columns.map(quote).join(",")}\n${rows.map((row) => columns.map((column) => quote(row[column])).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
const summaryRows = [];

await fs.mkdir(outputDirectory, { recursive: true });
for (const supplier of suppliers) {
  const rows = rowsFor(supplier);
  const fileName = `${slug(supplier.supplierName)}-price-stock-template.csv`;
  await fs.writeFile(path.join(outputDirectory, fileName), renderCsv(rows));
  summaryRows.push({ supplierName: supplier.supplierName, website: supplier.website, template: fileName, preparedRows: rows.length, sourceEvidenceStatus: rows.length ? "PUBLIC_SOURCE_REQUIRES_SUPPLIER_CONFIRMATION" : "NO_PUBLIC_ROWS_FOUND_REQUEST_FULL_CATALOG" });
}

const summary = {
  generatedAt: new Date().toISOString(),
  suppliers: suppliers.length,
  templates: summaryRows.length,
  preparedRows: summaryRows.reduce((total, row) => total + row.preparedRows, 0),
  suppliersWithPreparedRows: summaryRows.filter((row) => row.preparedRows > 0).length,
  suppliersWithoutPublicRows: summaryRows.filter((row) => row.preparedRows === 0).length,
  commercialFields: ["supplierSku", "price", "currency", "stock", "warehouse", "leadTimeDays", "availableFrom", "licenseDocumentUrl"],
  policy: "Цена и остаток не публикуются до supplier confirmation, compliance и активного договора ЭЦП.",
  rows: summaryRows,
};
const markdown = `# Шаблоны прайс-листа и остатков поставщиков Казахстана\n\nСформировано: ${summary.generatedAt}\n\nСоздано шаблонов: ${summary.templates}. Предподготовлено строк: ${summary.preparedRows}.\n\nПоставщик заполняет коммерческие поля: SKU, цену, валюту, остаток, склад и срок поставки. Canonical-карточка и вариант уже указаны в строке. Публичное происхождение строки требует подтверждения поставщика и не является offer.\n\n${summaryRows.map((row) => `- ${row.supplierName}: ${row.preparedRows} строк — ${row.template}`).join("\n")}\n\n${summary.policy}\n`;

await Promise.all([
  fs.writeFile(path.join(outputDirectory, "README.md"), markdown),
  fs.writeFile(path.join(outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
]);
console.log(JSON.stringify({ suppliers: summary.suppliers, templates: summary.templates, preparedRows: summary.preparedRows, suppliersWithPreparedRows: summary.suppliersWithPreparedRows }, null, 2));
