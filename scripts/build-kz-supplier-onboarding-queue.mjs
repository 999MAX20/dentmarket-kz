import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = path.resolve(process.cwd());
const registryPath = path.join(root, "data/suppliers-kz-registry.csv");
const outputDirectory = path.join(root, "data/reports/kz-suppliers");
const registry = parse(await fs.readFile(registryPath), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
});

const queued = registry.filter((supplier) => supplier.ingestionStatus === "QUEUED");
const imported = (supplier) => supplier.ingestionStatus.startsWith("IMPORTED");
const stage = (status, nextAction) => ({ status, nextAction });

const rows = queued.map((supplier) => ({
  supplierKey: supplier.supplierName.toLocaleLowerCase("ru").replace(/[^a-zа-я0-9]+/giu, "-").replace(/^-|-$/gu, ""),
  supplierName: supplier.supplierName,
  website: supplier.website,
  catalogUrl: supplier.catalogUrl,
  organization: stage("PENDING_BIN_AND_LEGAL_DOCUMENTS", "Получить БИН, юридическое название и подтверждающие документы"),
  credential: stage("PENDING_SUPPLIER", "Выдать приглашение и получить контакт владельца организации"),
  warehouse: stage("PENDING_SUPPLIER", "Получить города, адреса складов и график отгрузки"),
  source: stage(supplier.catalogUrl ? "PUBLIC_SOURCE_DISCOVERED" : "PENDING_SUPPLIER", supplier.catalogUrl ? "Подтвердить источник и условия использования каталога" : "Получить XLSX, CSV, PDF или API-источник"),
  import: stage(imported(supplier) ? "IMPORTED" : "QUEUED", imported(supplier) ? "Проверить последнюю загрузку" : "Запустить импорт после получения источника"),
  matching: stage(imported(supplier) ? "READY_FOR_MAPPING" : "BLOCKED_BY_SOURCE", "Сопоставить SKU и названия с canonical-карточками без создания дублей"),
  compliance: stage("BLOCKED_BY_DOCUMENTS", "Проверить лицензии, регистрационные документы и признаки медизделий"),
  eds: stage("BLOCKED_BY_CREDENTIALS", "Подключить EDS gateway после подтверждения организации"),
  offer: stage("BLOCKED_BY_EDS_AND_AGREEMENT", "Создавать offer только после активного договора и ЭЦП"),
  price: stage("BLOCKED_BY_OFFER", "Загрузить цену поставщика после подтверждения offer"),
  stock: stage("BLOCKED_BY_OFFER", "Загрузить остаток, склад и срок поставки"),
  testOrder: stage("BLOCKED_BY_STOCK_AND_PSP", "Провести тестовый заказ после договора, остатка и PSP sandbox"),
  nextAction: supplier.catalogUrl ? "Запросить у поставщика БИН, договорные данные и актуальный XLSX/PDF с SKU" : "Запросить у поставщика БИН и первый XLSX/PDF-прайс",
}));

const csv = (items) => {
  const columns = ["supplierKey", "supplierName", "website", "catalogUrl", "organization", "credential", "warehouse", "source", "import", "matching", "compliance", "eds", "offer", "price", "stock", "testOrder", "nextAction"];
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return `${columns.map(quote).join(",")}\n${items.map((item) => columns.map((column) => quote(typeof item[column] === "object" ? `${item[column].status}: ${item[column].nextAction}` : item[column])).join(",")).join("\n")}\n`;
};

const summary = {
  generatedAt: new Date().toISOString(),
  registrySuppliers: registry.length,
  queuedSuppliers: rows.length,
  importedSuppliers: registry.filter(imported).length,
  policy: "Не помечать поставщика коммерчески активным до организации, источника, compliance, ЭЦП и активного договора.",
  suppliers: rows,
};

const markdown = `# Очередь onboarding поставщиков Казахстана\n\nСформировано: ${summary.generatedAt}\n\nВ очереди: ${rows.length} поставщиков из ${registry.length}. Каждый поставщик проходит полный цикл: организация → credential → склад → источник → импорт → matching → compliance → ЭЦП → договор → offer → цена → остаток → тестовый заказ.\n\n${rows.map((row) => `- **${row.supplierName}** — ${row.nextAction}`).join("\n")}\n\n${summary.policy}\n`;

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDirectory, "onboarding-queue.json"), `${JSON.stringify(summary, null, 2)}\n`),
  fs.writeFile(path.join(outputDirectory, "onboarding-queue.csv"), csv(rows)),
  fs.writeFile(path.join(outputDirectory, "README.md"), markdown),
]);

console.log(JSON.stringify({ registrySuppliers: registry.length, queuedSuppliers: rows.length, importedSuppliers: summary.importedSuppliers }, null, 2));
