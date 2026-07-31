import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const outputDir = path.join(root, "outputs/beauty-onboarding-20260731");
await fs.mkdir(outputDir, { recursive: true });
const registry = JSON.parse(await fs.readFile(path.join(root, "data/verticals/beauty-kz/supplier-brand-registry.json"), "utf8"));
const headers = ["externalId", "name", "supplierSku", "gtin", "brand", "manufacturer", "unit", "description", "category", "variantLabel", "imageUrl", "sourceUrl", "canonicalProductId", "canonicalVariantId", "priceMinor", "currency", "quantityOnHand", "warehouse", "leadTimeDays", "matchStatus", "matchConfidence", "reviewReason"];
const readCsv = async (relative) => parse(await fs.readFile(path.join(root, relative)), { columns: true, skip_empty_lines: true, bom: true, trim: true, relax_column_count: true });
const ucg = await readCsv("data/intake/beauty-kz/ucg-kz.csv");
const publicDiscovery = await readCsv("data/intake/beauty-kz/public-catalog-discovery.csv");
const sourceRows = {
  "ucg-kz": ucg.map((row) => ({ ...row, matchStatus: "CANONICAL_READY", matchConfidence: "1.00", reviewReason: "Canonical card prepared; commercial columns intentionally blank." })),
  "procosmetics-kz": publicDiscovery.map((row) => ({ ...row, matchStatus: "DISCOVERY_REVIEW", matchConfidence: "", reviewReason: "Public card extracted; brand/SKU/authorization must be verified before publication." })),
};
const normalizeSheet = (name) => name.replace(/[^A-Za-z0-9_-]/gu, "_").slice(0, 28) || "Supplier";
const workbook = Workbook.create();
const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("A1:D1").merge();
readme.getRange("A1").values = [["DentMarket — Beauty KZ fast onboarding"]];
readme.getRange("A3:B11").values = [
  ["Назначение", "Единый шаблон для выгрузки из 1С/учётной системы. Canonical-карточка принадлежит DentMarket; поставщик присылает только коммерческие данные."],
  ["Поставщики в реестре", registry.suppliers.length],
  ["Карточки UCG", ucg.length],
  ["Публичные карточки pro.cosmetics", publicDiscovery.length],
  ["Цена/остаток в шаблоне", "Пусто до фактической выгрузки поставщика"],
  ["Повторная загрузка", "Обновляет offer price/inventory по sourceId + externalId, не создавая дубликаты"],
  ["Новые совпадения", "DISCOVERY_REVIEW / MATCH_PENDING → очередь модерации; автоматическая публикация запрещена без gates"],
  ["Склад и срок", "warehouse и leadTimeDays относятся к поставщику, не к canonical-card"],
  ["Источники", "Публичные URL сохранены в sourceUrl; проверка прав, бренда и документов выполняется до продажи"],
];
const rules = workbook.worksheets.add("Match_Rules");
rules.showGridLines = false;
rules.getRange("A1:C7").values = [
  ["Приоритет", "Правило", "Действие"],
  ["1", "GTIN/штрихкод или exact SKU в tenant mapping", "USE_EXISTING_CARD"],
  ["2", "Сохранённая mapping memory поставщика", "USE_EXISTING_CARD"],
  ["3", "Высокое совпадение названия + бренда", "USE_EXISTING_CARD"],
  ["4", "Несколько близких кандидатов", "MATCH_PENDING"],
  ["5", "Совпадений нет", "CREATE_PRODUCT_CANDIDATE; модерация"],
  ["6", "Цена/остаток/склад/срок", "Записать только в коммерческие сущности поставщика"],
];
const dark = "#174E4A";
for (const sheet of [readme, rules]) {
  const used = sheet.getUsedRange();
  used.format.font = { name: "Aptos", size: 10, color: "#243B53" };
  used.format.verticalAlignment = "center";
}
readme.getRange("A1:D1").format = { fill: dark, font: { name: "Aptos Display", size: 16, bold: true, color: "#FFFFFF" }, horizontalAlignment: "left", verticalAlignment: "center" };
readme.getRange("A1:D1").format.rowHeight = 30;
readme.getRange("A3:A11").format = { fill: "#E6F4F1", font: { bold: true, color: dark }, wrapText: true };
readme.getRange("B3:B11").format.wrapText = true;
rules.getRange("A1:C1").format = { fill: dark, font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
readme.getRange("A:A").format.columnWidth = 24; readme.getRange("B:B").format.columnWidth = 100;
rules.getRange("A:A").format.columnWidth = 12; rules.getRange("B:B").format.columnWidth = 60; rules.getRange("C:C").format.columnWidth = 42;
const rendered = ["README", "Match_Rules"];
for (const supplier of registry.suppliers) {
  const name = normalizeSheet(supplier.key);
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  const rows = (sourceRows[supplier.key] ?? []).map((row) => headers.map((header) => row[header] ?? ""));
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  sheet.freezePanes.freezeRows(1);
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = { fill: dark, font: { bold: true, color: "#FFFFFF" }, wrapText: true, horizontalAlignment: "center" };
  if (rows.length) {
    sheet.getRangeByIndexes(1, 1, rows.length, 1).format.wrapText = true;
    sheet.getRangeByIndexes(1, 7, rows.length, 1).format.wrapText = true;
    sheet.getRangeByIndexes(1, 11, rows.length, 1).format.wrapText = true;
    sheet.getRangeByIndexes(1, 19, rows.length, 3).format.wrapText = true;
  }
  sheet.getRange("A:A").format.columnWidth = 22; sheet.getRange("B:B").format.columnWidth = 44; sheet.getRange("C:G").format.columnWidth = 18; sheet.getRange("H:H").format.columnWidth = 58; sheet.getRange("I:J").format.columnWidth = 24; sheet.getRange("K:L").format.columnWidth = 42; sheet.getRange("M:S").format.columnWidth = 18; sheet.getRange("T:V").format.columnWidth = 28;
  const preview = await workbook.render({ sheetName: name, range: `A1:V${Math.min(rows.length + 1, 20)}`, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `${name}.png`), new Uint8Array(await preview.arrayBuffer()));
  rendered.push(name);
}
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
const workbookPath = path.join(outputDir, "beauty-supplier-onboarding-templates.xlsx");
await xlsx.save(workbookPath);
const inspect = await workbook.inspect({ kind: "table", range: "ucg-kz!A1:V6", include: "values,formulas", tableMaxRows: 6, tableMaxCols: 22 });
await fs.writeFile(path.join(outputDir, "inspect.ndjson"), inspect.ndjson);
await fs.writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), workbookPath, supplierSheets: registry.suppliers.length, rows: { ucg: ucg.length, procosmetics: publicDiscovery.length }, rendered }, null, 2)}\n`);
console.log(JSON.stringify({ workbookPath, supplierSheets: registry.suppliers.length, ucgRows: ucg.length, procosmeticsRows: publicDiscovery.length }, null, 2));
