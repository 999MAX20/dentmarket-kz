import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = path.resolve(process.cwd());
const registry = parse(await fs.readFile(path.join(root, "data/suppliers-kz-registry.csv")), { columns: true, skip_empty_lines: true, bom: true });
const outputDirectory = path.join(root, "data/integrations/one-c");
const slug = (value) => String(value ?? "supplier").toLocaleLowerCase("ru").replace(/[^a-zа-я0-9]+/giu, "-").replace(/^-|-$/gu, "") || "supplier";

const requiredMappings = [
  { entity: "PRODUCT", externalField: "Номенклатура.Код", internalTarget: "supplierSku", required: true },
  { entity: "PRODUCT", externalField: "Номенклатура.Наименование", internalTarget: "supplierProductName", required: true },
  { entity: "VARIANT", externalField: "Характеристика.Код", internalTarget: "supplierVariantSku", required: false },
  { entity: "WAREHOUSE", externalField: "Склад.Код", internalTarget: "warehouseExternalId", required: true },
  { entity: "PRICE", externalField: "Цена продажи", internalTarget: "priceMinor", required: true },
  { entity: "PRICE", externalField: "Валюта", internalTarget: "currency", required: true },
  { entity: "STOCK", externalField: "Остаток", internalTarget: "quantityOnHand", required: true },
  { entity: "STOCK", externalField: "Резерв", internalTarget: "quantityReserved", required: false },
  { entity: "ORDER", externalField: "Статус заказа", internalTarget: "orderStatus", required: true },
  { entity: "COUNTERPARTY", externalField: "Контрагент.Код", internalTarget: "counterpartyExternalId", required: true },
];

const manifests = registry.map((supplier) => ({
  tenantKey: slug(supplier.supplierName),
  supplierName: supplier.supplierName,
  provider: "ONE_C",
  mode: "PULL_AGENT",
  readinessStatus: "TEMPLATE_READY_CONNECTOR_NEEDED",
  source: { type: "ERP", catalogSource: supplier.catalogUrl || null, priceStockMode: "LIVE_FROM_1C" },
  agent: { enrollment: "ONE_TIME_TOKEN", transport: "OUTBOUND_HTTPS", signedBinaryRequired: true, minimumVersion: "0.1.0" },
  mappings: requiredMappings,
  syncPlan: ["catalog", "price", "stock", "warehouse", "order_export", "reservation", "cancel_release"],
  safetyGates: ["active_supplier_agreement", "compliance_confirmed", "fresh_price", "fresh_stock", "tenant_mapping_complete"],
  missingExternalEvidence: ["signed_agent_binary", "real_1c_database", "tenant_credentials", "warehouse_and_price_type_mapping", "control_order"],
}));

const summary = {
  generatedAt: new Date().toISOString(),
  suppliers: manifests.length,
  provider: "ONE_C",
  mode: "PULL_AGENT",
  policy: "Манифесты не содержат секретов и не объявляют подключение LIVE. Они заранее фиксируют tenant-specific mapping и readiness gates.",
  manifests,
};
const markdown = `# 1С readiness manifests\n\nПодготовлено tenant-манифестов: ${manifests.length}. Для каждого поставщика заранее зафиксированы сущности номенклатуры, вариантов, складов, цен, остатков, контрагентов и заказов.\n\nФактическая последовательность после получения данных: установить подписанный Agent → одноразовый enrollment → заполнить mapping → test sync 10–50 товаров → контрольный заказ → включить расписание. До появления реального Agent и базы 1С статус остаётся TEMPLATE_READY_CONNECTOR_NEEDED.\n\n${summary.policy}\n`;

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outputDirectory, "supplier-manifests.json"), `${JSON.stringify(summary, null, 2)}\n`),
  fs.writeFile(path.join(outputDirectory, "README.md"), markdown),
]);
console.log(JSON.stringify({ suppliers: manifests.length, mappingsPerSupplier: requiredMappings.length, status: "TEMPLATE_READY_CONNECTOR_NEEDED" }, null, 2));
