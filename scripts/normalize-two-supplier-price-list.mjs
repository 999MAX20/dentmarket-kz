import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const sourcePath = path.join(
  root,
  "outputs/019fbc76-8b0c-7f21-a718-4db77a620acc/Прейскурант_2_поставщика_нормализация.xlsx",
);
const outputDir = path.join(root, "outputs/two-supplier-normalization-20260801");
await fs.mkdir(outputDir, { recursive: true });

const source = await SpreadsheetFile.importXlsx(await FileBlob.load(sourcePath));
const values = (sheetName, address) => source.worksheets.getItem(sheetName).getRange(address).values;
const canonicalRows = values("Каталог площадки", "A5:H14");
const supplierSheets = ["ДенталПрофи KZ", "МедСнаб Дент"];
const supplierRows = Object.fromEntries(supplierSheets.map((name) => [name, values(name, "A5:L14")]));

const clean = (value) => String(value ?? "").trim();
const keyPart = (value) => clean(value).toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, "");
const matchingKey = (brand, article) => `${keyPart(brand)}|${keyPart(article)}`;

const canonical = canonicalRows.map((row) => ({
  matchingKey: clean(row[0]),
  canonicalProductId: clean(row[1]),
  canonicalName: clean(row[2]),
  brand: clean(row[3]),
  manufacturerArticle: clean(row[4]),
  category: clean(row[5]),
  canonicalPack: clean(row[6]),
  saleUnit: clean(row[7]),
}));
const canonicalByKey = new Map(canonical.map((row) => [matchingKey(row.brand, row.manufacturerArticle), row]));

const supplierConfig = {
  "ДенталПрофи KZ": { supplierId: "SUP-DPK-KZ", organizationName: "ТОО «ДенталПрофи Казахстан»" },
  "МедСнаб Дент": { supplierId: "SUP-MSD-KZ", organizationName: "ТОО «МедСнаб Дент»" },
};
const offers = [];
const moderation = [];
for (const sheetName of supplierSheets) {
  const config = supplierConfig[sheetName];
  for (const row of supplierRows[sheetName]) {
    const [supplierSku, localName, brand, article, localCategory, localPack, priceKzt, quantityOnHand, warehouse, currency, vat, updatedAt] = row;
    const target = canonicalByKey.get(matchingKey(brand, article));
    if (!target) throw new Error(`No canonical card for ${sheetName}: ${brand} ${article}`);
    const offer = {
      supplierId: config.supplierId,
      supplierOrganization: config.organizationName,
      supplierSku: clean(supplierSku),
      localName: clean(localName),
      localCategory: clean(localCategory),
      localPack: clean(localPack),
      canonicalProductId: target.canonicalProductId,
      canonicalName: target.canonicalName,
      brand: target.brand,
      manufacturerArticle: target.manufacturerArticle,
      priceKzt: Number(priceKzt),
      quantityOnHand: Number(quantityOnHand),
      warehouse: clean(warehouse),
      currency: clean(currency),
      vat: clean(vat),
      sourceUpdatedAtSerial: Number(updatedAt),
    };
    offers.push(offer);
    moderation.push({
      supplierId: config.supplierId,
      supplierSku: offer.supplierSku,
      localName: offer.localName,
      matchingKey: target.matchingKey,
      canonicalProductId: target.canonicalProductId,
      canonicalName: target.canonicalName,
      matchStatus: "MATCHED_TO_CANONICAL",
      matchReason: "brand + manufacturer article",
      commercialDataOwner: config.organizationName,
    });
  }
}

const grouped = new Map();
for (const offer of offers) grouped.set(offer.canonicalProductId, (grouped.get(offer.canonicalProductId) ?? 0) + 1);
const result = {
  generatedAt: new Date().toISOString(),
  sourceFile: sourcePath,
  rules: {
    canonicalCardOwner: "DentMarket",
    canonicalFields: ["canonicalProductId", "canonicalName", "brand", "manufacturerArticle", "category", "canonicalPack", "saleUnit"],
    supplierFields: ["supplierSku", "localName", "localCategory", "localPack", "priceKzt", "quantityOnHand", "warehouse", "currency", "vat", "sourceUpdatedAtSerial"],
    matchingKey: "normalized brand + manufacturer article",
    duplicatePolicy: "one canonical card, many supplier offers",
  },
  summary: {
    canonicalCards: canonical.length,
    suppliers: supplierSheets.length,
    supplierOffers: offers.length,
    canonicalCardsWithTwoOffers: [...grouped.values()].filter((count) => count === supplierSheets.length).length,
    unmatchedOffers: moderation.filter((row) => row.matchStatus !== "MATCHED_TO_CANONICAL").length,
    duplicateCanonicalCards: canonical.length - new Set(canonical.map((row) => row.matchingKey)).size,
  },
  canonical,
  offers,
  moderation,
};
await fs.writeFile(path.join(outputDir, "normalized-result.json"), `${JSON.stringify(result, null, 2)}\n`);
const csvEscape = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const offerHeaders = Object.keys(offers[0]);
await fs.writeFile(path.join(outputDir, "supplier-offers.csv"), `${offerHeaders.join(",")}\n${offers.map((row) => offerHeaders.map((key) => csvEscape(row[key])).join(",")).join("\n")}\n`);

const workbook = Workbook.create();
const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("A1:D1").merge();
readme.getRange("A1").values = [["DentMarket — тест нормализации двух прайсов"]];
readme.getRange("A3:B10").values = [
  ["Источник", path.basename(sourcePath)],
  ["Поставщики", supplierSheets.join("; ")],
  ["Единые карточки", canonical.length],
  ["Предложения поставщиков", offers.length],
  ["Дублей canonical-карточек", result.summary.duplicateCanonicalCards],
  ["Сопоставлено автоматически", `${offers.length - result.summary.unmatchedOffers}/${offers.length}`],
  ["Цены/остатки", "Только в supplier offers; в canonical-карточки не записываются"],
  ["Правило", "Одна canonical-карточка + отдельное предложение каждого поставщика"],
];
const writeTable = (sheet, headers, rows) => {
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
  if (rows.length) sheet.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
  sheet.freezePanes.freezeRows(1);
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = { fill: "#174E4A", font: { bold: true, color: "#FFFFFF" }, wrapText: true };
  sheet.getUsedRange().format = { font: { name: "Aptos", size: 10, color: "#243B53" }, verticalAlignment: "center" };
  sheet.getRangeByIndexes(0, 0, 1, headers.length).format = { fill: "#174E4A", font: { bold: true, color: "#FFFFFF" }, wrapText: true };
};
writeTable(workbook.worksheets.add("Canonical карточки"), Object.keys(canonical[0]), canonical.map((row) => Object.values(row)));
writeTable(workbook.worksheets.add("Supplier offers"), offerHeaders, offers.map((row) => offerHeaders.map((key) => row[key])));
writeTable(workbook.worksheets.add("Модерация"), Object.keys(moderation[0]), moderation.map((row) => Object.values(row)));
for (const sheet of [readme, ...["Canonical карточки", "Supplier offers", "Модерация"].map((name) => workbook.worksheets.getItem(name))]) {
  sheet.getRange("A:A").format.columnWidth = 24;
  sheet.getRange("B:B").format.columnWidth = 42;
  sheet.getRange("C:Z").format.columnWidth = 24;
}
readme.getRange("A1:D1").format = { fill: "#174E4A", font: { name: "Aptos Display", size: 16, bold: true, color: "#FFFFFF" } };
readme.getRange("A3:A10").format = { fill: "#E6F4F1", font: { bold: true, color: "#174E4A" }, wrapText: true };
readme.getRange("B3:B10").format.wrapText = true;
const preview = await workbook.render({ sheetName: "Модерация", range: "A1:I21", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "moderation-preview.png"), new Uint8Array(await preview.arrayBuffer()));
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "normalized-two-supplier-result.xlsx"));
const inspect = await workbook.inspect({ kind: "table", range: "Модерация!A1:I8", include: "values,formulas", tableMaxRows: 8, tableMaxCols: 12 });
await fs.writeFile(path.join(outputDir, "normalized-two-supplier-result.xlsx.inspect.ndjson"), inspect.ndjson);
console.log(JSON.stringify({ outputDir, ...result.summary }, null, 2));
