import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = path.resolve(process.cwd());
const sampleOnly = process.env.SAMPLE_ONLY === "1";
const outputDir = path.join(
  root,
  "outputs",
  sampleOnly
    ? "catalog-import-fixture-sample-20260717"
    : "catalog-import-fixture-20260717",
);
await fs.mkdir(outputDir, { recursive: true });
const sources = [
  "data/imports/medstom-catalog.csv",
  "data/imports/kazdentservice-catalog.csv",
];
const existing = [];
for (const sourceFile of sources) {
  const sourceRows = parse(await fs.readFile(path.join(root, sourceFile)), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  });
  existing.push(
    ...sourceRows.map((row) => ({
      ...row,
      supplierSource: path.basename(sourceFile, ".csv"),
      expectedAction: "USE_EXISTING_CARD",
      expectedMatchReason: "Каноническая карточка уже загружена в каталог",
    })),
  );
}
const missingNames = [
  [
    "fixture-missing-001",
    "Стоматологический микромотор KZ Dental Pro X1",
    "KZDP-X1",
    "KZ Dental Pro",
    "KZ Dental Manufacturing",
    "шт",
    "8900000",
    "KZT",
    "10",
    "Микромоторы",
  ],
  [
    "fixture-missing-002",
    "Композит светоотверждаемый DentKZ Universal A2 4 г",
    "DKZ-CMP-A2",
    "DentKZ",
    "DentKZ Labs",
    "шт",
    "185000",
    "KZT",
    "50",
    "Композитные материалы",
  ],
  [
    "fixture-missing-003",
    "Насадка эндодонтическая Endo KZ E25",
    "EKZ-E25",
    "Endo KZ",
    "Endo KZ",
    "шт",
    "99000",
    "KZT",
    "20",
    "Эндодонтические инструменты",
  ],
  [
    "fixture-missing-004",
    "Матрица стоматологическая KazMatrix секционная M",
    "KM-M",
    "KazMatrix",
    "KazMatrix",
    "упаковка",
    "42000",
    "KZT",
    "100",
    "Матрицы",
  ],
  [
    "fixture-missing-005",
    "Слюноотсос одноразовый BioSuction Казахстан 100 шт",
    "BS-100",
    "BioSuction",
    "BioSuction KZ",
    "упаковка",
    "27000",
    "KZT",
    "120",
    "Расходные материалы",
  ],
  [
    "fixture-missing-006",
    "Цемент стеклоиономерный Almaty Glass Ionomer 15 г",
    "AGI-15",
    "Almaty Dental",
    "Almaty Dental",
    "шт",
    "210000",
    "KZT",
    "35",
    "Цементы",
  ],
  [
    "fixture-missing-007",
    "Фотополимерная лампа Qazaq Cure 2",
    "QC-2",
    "Qazaq Cure",
    "Qazaq Cure",
    "шт",
    "4300000",
    "KZT",
    "8",
    "Фотополимерные лампы",
  ],
  [
    "fixture-missing-008",
    "Имплантат KZ Implant Standard 4.0x10",
    "KZI-4010",
    "KZ Implant",
    "KZ Implant",
    "шт",
    "780000",
    "KZT",
    "24",
    "Имплантаты",
  ],
  [
    "fixture-missing-009",
    "Стоматологическое зеркало ErgoDent №5",
    "ED-M5",
    "ErgoDent",
    "ErgoDent",
    "шт",
    "12000",
    "KZT",
    "200",
    "Инструменты",
  ],
  [
    "fixture-missing-010",
    "Перчатки нитриловые DentalSafe M 100 шт",
    "DS-M-100",
    "DentalSafe",
    "DentalSafe KZ",
    "коробка",
    "39000",
    "KZT",
    "80",
    "Средства защиты",
  ],
  [
    "fixture-missing-011",
    "Дезинфицирующий раствор SteriKZ 1 л",
    "SKZ-1L",
    "SteriKZ",
    "SteriKZ",
    "шт",
    "56000",
    "KZT",
    "70",
    "Дезинфекция",
  ],
  [
    "fixture-missing-012",
    "Наконечник турбинный Steppe Air T1",
    "SAT-T1",
    "Steppe Air",
    "Steppe Air",
    "шт",
    "12500000",
    "KZT",
    "6",
    "Наконечники",
  ],
];
const missing = missingNames.map(
  ([
    externalId,
    name,
    supplierSku,
    brand,
    manufacturer,
    unit,
    priceMinor,
    currency,
    quantityOnHand,
    category,
  ]) => ({
    externalId,
    name,
    supplierSku,
    brand,
    manufacturer,
    unit,
    priceMinor,
    currency,
    quantityOnHand,
    category,
    sourceUrl: "fixture://missing-cards",
    sourceUpdatedAt: "2026-07-17",
    supplierSource: "fixture-missing-cards",
    expectedAction: "CREATE_PRODUCT_CANDIDATE",
    expectedMatchReason:
      "В каноническом каталоге карточка отсутствует; создать кандидата на модерацию",
  }),
);
const rows = sampleOnly
  ? [...existing.slice(0, 5), ...missing]
  : [...existing, ...missing];
const headers = [
  "externalId",
  "name",
  "supplierSku",
  "brand",
  "manufacturer",
  "unit",
  "priceMinor",
  "currency",
  "quantityOnHand",
  "category",
  "sourceUrl",
  "sourceUpdatedAt",
  "supplierSource",
  "expectedAction",
  "expectedMatchReason",
];
const workbook = Workbook.create();
const importSheet = workbook.worksheets.add("Import_Mixed");
const readme = workbook.worksheets.add("README");
readme.showGridLines = false;
readme.getRange("A1:D1").merge();
readme.getRange("A1").values = [
  ["DentMarket — смешанный сценарий импорта карточек"],
];
readme.getRange("A3:B8").values = [
  [
    "Назначение",
    "Боевой тест XLSX: существующие карточки должны предложить USE_EXISTING_CARD, новые — CREATE_PRODUCT_CANDIDATE.",
  ],
  ["Существующие", existing.length],
  ["Новые для кандидата", missing.length],
  ["Всего строк", rows.length],
  [
    "Ключевой принцип",
    "Новые карточки не публикуются автоматически: только кандидат на квалификацию и модерацию.",
  ],
  [
    "Источники",
    "Medstom KZ + KazDentService; fixture-строки явно помечены sourceUrl=fixture://missing-cards.",
  ],
];
importSheet.showGridLines = false;
importSheet.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
importSheet.getRangeByIndexes(1, 0, rows.length, headers.length).values =
  rows.map((row) => headers.map((header) => row[header] ?? null));
importSheet.freezePanes.freezeRows(1);
const searchSheet = workbook.worksheets.add("Search_QA");
searchSheet.showGridLines = false;
const searchRows = [
  ["Query", "Expected", "Reason"],
  [
    "YouJoy EASE02",
    "EXISTING",
    "Поиск по названию сохранённой KazDentService-карточки",
  ],
  ["0323", "EXISTING", "Поиск по SKU сохранённой карточки"],
  ["IQ Dent", "EXISTING", "Поиск по бренду/названию Medstom-карточек"],
  [
    "KZ Dental Pro X1",
    "MISSING",
    "Новая fixture-карточка не должна считаться канонической",
  ],
  [
    "Steppe Air T1",
    "MISSING",
    "Новая fixture-карточка должна перейти в кандидата",
  ],
];
searchSheet.getRangeByIndexes(0, 0, searchRows.length, 3).values = searchRows;
searchSheet.freezePanes.freezeRows(1);
const dark = "#102A43";
for (const sheet of [readme, importSheet, searchSheet]) {
  const used = sheet.getUsedRange();
  used.format.font = { name: "Aptos", size: 10, color: "#243B53" };
  used.format.verticalAlignment = "center";
}
readme.getRange("A1:D1").format = {
  fill: dark,
  font: { name: "Aptos Display", size: 16, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};
readme.getRange("A1:D1").format.rowHeight = 30;
readme.getRange("A3:A8").format = {
  fill: "#EAF2F8",
  font: { bold: true, color: dark },
  wrapText: true,
};
readme.getRange("B3:B8").format.wrapText = true;
importSheet.getRangeByIndexes(0, 0, 1, headers.length).format = {
  fill: dark,
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
  horizontalAlignment: "center",
};
importSheet.getRangeByIndexes(0, 1, rows.length, 1).format.wrapText = true;
importSheet.getRangeByIndexes(1, 13, existing.length, 1).format = {
  fill: "#E6FFFA",
  font: { color: "#065F46", bold: true },
};
importSheet.getRangeByIndexes(
  existing.length + 1,
  13,
  missing.length,
  1,
).format = { fill: "#FFF4E5", font: { color: "#9A3412", bold: true } };
importSheet.getRangeByIndexes(1, 6, rows.length, 1).format.numberFormat = [
  ["#,##0"],
];
importSheet.getRangeByIndexes(1, 8, rows.length, 1).format.numberFormat = [
  ["#,##0"],
];
searchSheet.getRange("A1:C1").format = {
  fill: dark,
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
searchSheet.getRange("A2:A6").format.font = { bold: true, color: dark };
readme.getRange("A:A").format.columnWidth = 22;
readme.getRange("B:B").format.columnWidth = 100;
importSheet.getRange("A:A").format.columnWidth = 22;
importSheet.getRange("B:B").format.columnWidth = 52;
importSheet.getRange("C:F").format.columnWidth = 20;
importSheet.getRange("G:I").format.columnWidth = 16;
importSheet.getRange("J:J").format.columnWidth = 28;
importSheet.getRange("K:L").format.columnWidth = 34;
importSheet.getRange("M:N").format.columnWidth = 24;
importSheet.getRange("O:O").format.columnWidth = 58;
searchSheet.getRange("A:A").format.columnWidth = 26;
searchSheet.getRange("B:B").format.columnWidth = 16;
searchSheet.getRange("C:C").format.columnWidth = 62;
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(path.join(outputDir, "catalog-import-mixed-fixture.xlsx"));
await fs.writeFile(
  path.join(outputDir, "manifest.json"),
  `${JSON.stringify({ rows: rows.map((row) => ({ externalId: row.externalId, expectedAction: row.expectedAction })), existing: existing.length, missing: missing.length, total: rows.length }, null, 2)}\n`,
);
for (const sheetName of ["README", "Import_Mixed", "Search_QA"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `${sheetName}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}
const inspect = await workbook.inspect({
  kind: "table",
  range: "Import_Mixed!A1:O8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 15,
});
await fs.writeFile(path.join(outputDir, "inspect.ndjson"), inspect.ndjson);
console.log(
  JSON.stringify(
    {
      ok: true,
      output: path.join(outputDir, "catalog-import-mixed-fixture.xlsx"),
      existing: existing.length,
      missing: missing.length,
      total: rows.length,
    },
    null,
    2,
  ),
);
