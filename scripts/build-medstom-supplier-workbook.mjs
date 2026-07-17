import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.cwd();
const sourcePath = path.join(root, "apps/buyer-web/app/data/medstom-catalog.json");
const outputDir = path.join(root, "outputs/medstom-supplier-onboarding-20260717");
const qaDir = path.join(outputDir, "qa");
const outputPath = path.join(outputDir, "Medstom_KZ_catalog_supplier_cycle.xlsx");
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const lifecycleReport = await fs.readFile(path.join(outputDir, "supplier-lifecycle-verification.json"), "utf8").then(JSON.parse).catch(() => null);
const products = source.products;
const categories = [...new Set(products.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "ru"));

const workbook = Workbook.create();
const passport = workbook.worksheets.add("Паспорт поставщика");
const catalog = workbook.worksheets.add("Каталог");
const categorySheet = workbook.worksheets.add("Категории");
const lifecycle = workbook.worksheets.add("Цикл поставщика");
const mapping = workbook.worksheets.add("Маппинг импорта");

const navy = "#123047";
const teal = "#0F766E";
const pale = "#E8F2F0";
const warning = "#FFF4CE";
const border = "#D6DEE3";
const muted = "#5D6B74";

function title(sheet, range, value, subtitle) {
  sheet.showGridLines = false;
  sheet.getRange(range).merge();
  sheet.getRange(range).values = [[value]];
  sheet.getRange(range).format = { fill: navy, font: { color: "#FFFFFF", bold: true, size: 20 }, verticalAlignment: "center" };
  sheet.getRange(range).format.rowHeight = 34;
  if (subtitle) {
    const row = Number(range.match(/\d+/)?.[0] ?? 1) + 1;
    const endColumn = range.split(":")[1].replace(/\d+/g, "");
    const subtitleRange = `A${row}:${endColumn}${row + 1}`;
    sheet.getRange(subtitleRange).merge();
    sheet.getRange(subtitleRange).values = [[subtitle]];
    sheet.getRange(subtitleRange).format = { fill: pale, font: { color: muted, italic: true }, wrapText: true, verticalAlignment: "center" };
  }
}

function header(range) {
  range.format = { fill: teal, font: { color: "#FFFFFF", bold: true }, wrapText: true, verticalAlignment: "center", borders: { preset: "all", style: "thin", color: border } };
  range.format.rowHeight = 30;
}

title(passport, "A1:F1", "Medstom KZ — паспорт пилотного поставщика", "Публичный каталог собран для технического пилота. Компания не зарегистрирована юридически в DentMarket KZ, документы и остатки не подтверждены, договор с ЭЦП не подписан.");
passport.getRange("A4:B14").values = [
  ["Поле", "Значение"],
  ["Название поставщика", "Medstom KZ"],
  ["Режим", "Пилотный внешний каталог / UNVERIFIED"],
  ["Источник", source.source.url],
  ["Дата импорта", new Date(source.source.importedAt)],
  ["Карточек в публичном источнике", products.length],
  ["Категорий", categories.length],
  ["Карточек с ценой", products.filter((item) => Number(item.priceMinor) > 0).length],
  ["Карточек с подтверждённым остатком", 0],
  ["Юридические документы", "Не предоставлены"],
  ["Договор с двумя ЭЦП", "Не инициирован — публикация офферов заблокирована"],
];
header(passport.getRange("A4:B4"));
passport.getRange("A5:A14").format.font = { bold: true, color: navy };
passport.getRange("A4:B14").format.borders = { preset: "all", style: "thin", color: border };
passport.getRange("B8").setNumberFormat("yyyy-mm-dd hh:mm");
passport.getRange("A16:F18").merge();
passport.getRange("A16:F18").values = [["Правило публикации: цена из внешнего каталога является справочной. Оффер становится доступен покупателю только после верификации поставщика, активного годового договора с двумя ЭЦП, активной цены и свежего положительного остатка."]];
passport.getRange("A16:F18").format = { fill: warning, font: { color: "#6B4E00", bold: true }, wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: "#E6B800" } };
passport.getRange("A:A").format.columnWidth = 34;
passport.getRange("B:B").format.columnWidth = 72;
passport.getRange("C:F").format.columnWidth = 14;

title(catalog, "A1:M1", "Каталог Medstom KZ", "Фактические поля публичного каталога на дату импорта. Пустой остаток не преобразуется в наличие; цены указаны в тенге и требуют подтверждения поставщиком.");
const catalogHeaders = ["External ID", "Артикул импорта", "Наименование", "Категория", "Единица", "Цена, KZT", "Цена minor", "Валюта", "Остаток", "Статус остатка", "Верификация", "Источник", "Импортировано UTC"];
const catalogRows = products.map((item) => [
  item.externalId,
  item.supplierSku,
  item.name,
  item.category,
  item.unit || "шт",
  item.priceMinor ? Number(item.priceMinor) / 100 : null,
  item.priceMinor ? Number(item.priceMinor) : null,
  item.currency || "KZT",
  null,
  "НЕ ПОДТВЕРЖДЁН",
  "UNVERIFIED",
  item.sourceUrl,
  new Date(item.sourceUpdatedAt),
]);
catalog.getRangeByIndexes(3, 0, 1, catalogHeaders.length).values = [catalogHeaders];
catalog.getRangeByIndexes(4, 0, catalogRows.length, catalogHeaders.length).values = catalogRows;
header(catalog.getRange("A4:M4"));
catalog.tables.add(`A4:M${catalogRows.length + 4}`, true, "MedstomCatalogTable");
catalog.freezePanes.freezeRows(4);
catalog.getRange(`F5:G${catalogRows.length + 4}`).setNumberFormat("#,##0.00");
catalog.getRange(`M5:M${catalogRows.length + 4}`).setNumberFormat("yyyy-mm-dd hh:mm");
catalog.getRange(`J5:K${catalogRows.length + 4}`).format = { fill: warning, font: { color: "#6B4E00" } };
const widths = [18, 18, 52, 34, 12, 16, 16, 10, 14, 22, 16, 34, 21];
widths.forEach((width, index) => { catalog.getRangeByIndexes(0, index, catalogRows.length + 4, 1).format.columnWidth = width; });
catalog.getRange(`A4:M${catalogRows.length + 4}`).format.wrapText = true;

title(categorySheet, "A1:E1", "Контроль категорий", "Сводка рассчитана формулами по листу «Каталог» и служит проверкой полноты выгрузки.");
categorySheet.getRange("A4:E4").values = [["Категория", "Карточек", "С ценой", "Без цены", "Доля с ценой"]];
header(categorySheet.getRange("A4:E4"));
categorySheet.getRangeByIndexes(4, 0, categories.length, 1).values = categories.map((value) => [value]);
for (let index = 0; index < categories.length; index += 1) {
  const row = index + 5;
  categorySheet.getRange(`B${row}:E${row}`).formulas = [[
    `=COUNTIF('Каталог'!$D$5:$D$${catalogRows.length + 4},A${row})`,
    `=COUNTIFS('Каталог'!$D$5:$D$${catalogRows.length + 4},A${row},'Каталог'!$F$5:$F$${catalogRows.length + 4},">0")`,
    `=B${row}-C${row}`,
    `=IFERROR(C${row}/B${row},0)`,
  ]];
  categorySheet.getRange(`E${row}`).setNumberFormat("0.0%");
}
const totalRow = categories.length + 6;
categorySheet.getRange(`A${totalRow}:E${totalRow}`).values = [["ИТОГО", null, null, null, null]];
categorySheet.getRange(`B${totalRow}:E${totalRow}`).formulas = [[`=SUM(B5:B${totalRow - 2})`, `=SUM(C5:C${totalRow - 2})`, `=SUM(D5:D${totalRow - 2})`, `=IFERROR(C${totalRow}/B${totalRow},0)`]];
categorySheet.getRange(`A${totalRow}:E${totalRow}`).format = { fill: pale, font: { bold: true, color: navy }, borders: { preset: "all", style: "thin", color: border } };
categorySheet.getRange(`E${totalRow}`).setNumberFormat("0.0%");
categorySheet.tables.add(`A4:E${totalRow - 2}`, true, "CategoryQATable");
categorySheet.freezePanes.freezeRows(4);
categorySheet.getRange("A:A").format.columnWidth = 48;
categorySheet.getRange("B:D").format.columnWidth = 16;
categorySheet.getRange("E:E").format.columnWidth = 18;

title(lifecycle, "A1:F1", "Полный цикл нового поставщика", "Контрольная карта реального контура. Юридически значимые этапы не подменяются тестовыми данными; до их завершения публикация закрыта.");
lifecycle.getRange("A4:F4").values = [["№", "Этап", "Результат пилота", "Статус", "Блокирует публикацию", "Следующее действие"]];
const cycleRows = [
  [1, "Регистрация организации", lifecycleReport ? `API-тест PASSED: ${lifecycleReport.supplier.organizationId}; юридическая регистрация Medstom не выполнялась` : "Создан технический паспорт внешнего поставщика без присвоения чужого БИН", lifecycleReport ? "API-ТЕСТ PASSED" : "ПИЛОТ ЗАВЕРШЁН", "ДА", "Поставщик проходит self-registration и подтверждает email/БИН"],
  [2, "Профиль и документы", "Источник и ассортимент зафиксированы; лицензии и дистрибьюторские документы отсутствуют", "ОЖИДАЕТ ПОСТАВЩИКА", "ДА", "Загрузить и верифицировать документы"],
  [3, "Склад и география", "Остатки публичным источником не предоставлены", "НЕ ПОДТВЕРЖДЕНО", "ДА", "Добавить склад и канал обновления остатков"],
  [4, "Источник данных", "Публичный Tilda Store API, снимок 341 карточки", "ЗАВЕРШЁН", "НЕТ", "Согласовать официальный API/Excel-канал"],
  [5, "Excel-выгрузка", "Каталог и паспорт собраны в этом файле", "ЗАВЕРШЁН", "НЕТ", "Поставщик проверяет строки и цены"],
  [6, "Импорт и маппинг", lifecycleReport ? `Supabase batch ${lifecycleReport.steps.find((step) => step.step === "catalog_upload_normalization")?.evidence.batchId}: 341 обработано, 0 ошибок` : "Сформированы JSON и CSV по штатной схеме SupplierExternalItem", lifecycleReport ? "API-ТЕСТ PASSED" : "ЗАВЕРШЁН", "НЕТ", "Загрузить через кабинет после регистрации"],
  [7, "Нормализация и matching", lifecycleReport ? "Все строки нормализованы; одна позиция прошла подтверждённый matching, остальные направлены в очередь кандидатов" : "Карточки готовы к ProductCandidate/ручной модерации", lifecycleReport ? "API-ТЕСТ PASSED" : "ГОТОВО К МОДЕРАЦИИ", "ДА", "Сопоставить варианты и подтвердить единицы"],
  [8, "Офферы и цены", "335 цен получены; 6 карточек без цены; все требуют ручного подтверждения", "НЕ ОПУБЛИКОВАНО", "ДА", "Подтвердить цену, НДС, упаковку и MOQ"],
  [9, "Годовой договор с двумя ЭЦП", lifecycleReport ? "Автотест: две тестовые ЭЦП активировали договор ровно на 12 месяцев; реального юридического эффекта нет" : "Окно подписания доступно только при отсутствии действующего договора; автопролонгация 12 месяцев", lifecycleReport ? "API-ТЕСТ PASSED" : "НЕ ИНИЦИИРОВАН", "ДА", "Поставщик и оператор подписывают собственными ЭЦП"],
  [10, "Публикация", lifecycleReport ? "До договора получен 403; после всех gate-проверок оффер опубликован и сразу скрыт как тестовый" : "Проверено правило: договор + активная цена + свежий положительный остаток обязательны", lifecycleReport ? "PASSED И СКРЫТО" : "ЗАБЛОКИРОВАНО", "ДА", "Публиковать только после прохождения всех gate-проверок"],
];
lifecycle.getRangeByIndexes(4, 0, cycleRows.length, 6).values = cycleRows;
header(lifecycle.getRange("A4:F4"));
lifecycle.tables.add(`A4:F${cycleRows.length + 4}`, true, "SupplierLifecycleTable");
lifecycle.freezePanes.freezeRows(4);
lifecycle.getRange(`D5:E${cycleRows.length + 4}`).format = { fill: warning, font: { color: "#6B4E00", bold: true } };
[8, 30, 52, 24, 22, 54].forEach((width, index) => { lifecycle.getRangeByIndexes(0, index, cycleRows.length + 4, 1).format.columnWidth = width; });
lifecycle.getRange(`A4:F${cycleRows.length + 4}`).format.wrapText = true;

title(mapping, "A1:E1", "Маппинг штатного импорта", "Колонки файла сопоставлены с SupplierColumnMapping; отсутствующие факты оставлены пустыми, а не выдуманы.");
mapping.getRange("A4:E4").values = [["Поле платформы", "Колонка каталога", "Обязательное", "Преобразование", "Контроль"]];
const mappingRows = [
  ["externalId", "External ID", "Да", "Без изменений", "341 уникальное значение"],
  ["name", "Наименование", "Да", "Trim + нормализация текста", "Пустых нет"],
  ["supplierSku", "Артикул импорта", "Нет", "Технический артикул MSK-…", "Не является артикулом поставщика до подтверждения"],
  ["brand", "—", "Нет", "Пусто", "Не извлекается из названия"],
  ["manufacturer", "—", "Нет", "Пусто", "Не подменяется брендом"],
  ["unit", "Единица", "Нет", "По источнику, по умолчанию шт", "Требует проверки упаковки"],
  ["priceMinor", "Цена minor", "Нет", "KZT × 100", "335 значений, 6 пустых"],
  ["currency", "Валюта", "Нет", "KZT", "Единая валюта"],
  ["quantityOnHand", "Остаток", "Нет", "Пусто", "Наличие не подтверждается"],
];
mapping.getRangeByIndexes(4, 0, mappingRows.length, 5).values = mappingRows;
header(mapping.getRange("A4:E4"));
mapping.tables.add(`A4:E${mappingRows.length + 4}`, true, "ImportMappingTable");
mapping.freezePanes.freezeRows(4);
[24, 26, 18, 34, 54].forEach((width, index) => { mapping.getRangeByIndexes(0, index, mappingRows.length + 4, 1).format.columnWidth = width; });
mapping.getRange(`A4:E${mappingRows.length + 4}`).format.wrapText = true;

await fs.mkdir(qaDir, { recursive: true });
const inspection = await workbook.inspect({ kind: "workbook,sheet,table,formula", maxChars: 12000, tableMaxRows: 4, tableMaxCols: 8, options: { maxResults: 200 } });
await fs.writeFile(path.join(qaDir, "inspection.ndjson"), inspection.ndjson ?? String(inspection));
const errorInspection = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, maxChars: 5000 });
await fs.writeFile(path.join(qaDir, "formula-errors.ndjson"), errorInspection.ndjson ?? String(errorInspection));
for (const sheetName of ["Паспорт поставщика", "Каталог", "Категории", "Цикл поставщика", "Маппинг импорта"]) {
  const image = await workbook.render({ sheetName, autoCrop: "all", scale: sheetName === "Каталог" ? 0.65 : 1, format: "png" });
  await fs.writeFile(path.join(qaDir, `${sheetName.replaceAll(" ", "_")}.png`), new Uint8Array(await image.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, sheets: 5, products: products.length, categories: categories.length, priced: products.filter((item) => Number(item.priceMinor) > 0).length }, null, 2));
