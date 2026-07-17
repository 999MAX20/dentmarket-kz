import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { ImportFileParser } from "./import-file.parser";

describe("ImportFileParser", () => {
  it("parses CSV content while preserving headers", async () => {
    const parser = new ImportFileParser();
    const rows = await parser.parse({
      sourceId: "00000000-0000-4000-8000-000000000022",
      fileName: "price.csv",
      fileType: "CSV",
      contentBase64: Buffer.from("id,name,price\nA-1,Композит A2,125000\n").toString("base64"),
      columnMapping: { externalId: "id", name: "name", priceMinor: "price" },
    });
    expect(rows).toEqual([{ id: "A-1", name: "Композит A2", price: "125000" }]);
  });

  it.each([
    { name: "supplier-title", rows: [["Прайс-лист на 17.07.2026"], [], ["Артикул", "Наименование", "Цена", "Остаток"], ["A-1", "Композит A2", 125000, 14]], expected: { Артикул: "A-1", Наименование: "Композит A2", Цена: 125000, Остаток: 14 } },
    { name: "metadata-preamble", rows: [["Поставщик", "ТОО Dental"], ["Валюта", "KZT"], ["SKU", "Товар", "Цена, KZT", "Ед. изм."], ["G-10", "Перчатки M", 4900, "уп"]], expected: { SKU: "G-10", Товар: "Перчатки M", "Цена, KZT": 4900, "Ед. изм.": "уп" } },
    { name: "offset-columns", rows: [[null, null, "Каталог расходников"], [null, "Код", "Название товара", "Бренд", "Количество"], [null, "B-7", "Нагрудники", "CleanDent", 50]], expected: { Код: "B-7", "Название товара": "Нагрудники", Бренд: "CleanDent", Количество: 50 } },
  ])("detects the real header in dirty Excel: $name", async ({ rows, expected }) => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("Прайс"); rows.forEach((row) => sheet.addRow(row));
    const content = Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64");
    const parsed = await new ImportFileParser().parse({ sourceId: "00000000-0000-4000-8000-000000000022", fileName: "dirty.xlsx", fileType: "EXCEL", contentBase64: content, columnMapping: { externalId: "Код", name: "Название" } });
    expect(parsed[0]).toEqual(expected);
  });
});

describe("PDF supplier price parsing", () => {
  it("extracts text table rows but leaves an unconfirmed currency out of the price pipeline", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([600, 800]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("No. Name Unit Price Note", { x: 40, y: 740, size: 11, font });
    page.drawText("1", { x: 45, y: 700, size: 10, font });
    page.drawText("Scan Body", { x: 100, y: 700, size: 10, font });
    page.drawText("Piece", { x: 250, y: 700, size: 10, font });
    page.drawText("4130", { x: 360, y: 700, size: 10, font });
    page.drawText("With database", { x: 430, y: 700, size: 10, font });
    const bytes = Buffer.from(await pdf.save());
    const result = await new ImportFileParser().parseWithDiagnostics({ sourceId: "00000000-0000-4000-8000-000000000022", fileName: "supplier.pdf", fileType: "PDF", contentBase64: bytes.toString("base64"), columnMapping: { externalId: "externalId", name: "name", priceMinor: "priceMinor" } });
    expect(result).toMatchObject({ requiresReview: false, metadata: { method: "pdf_text_table", extractedRows: 1 } });
    expect(result.rows[0]).toMatchObject({ name: "Scan Body", sourcePrice: "4130", priceMinor: "", requiresPriceConfirmation: true });
  });

  it("routes image-only catalogs to review instead of inventing products", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([600, 800]);
    const bytes = Buffer.from(await pdf.save());
    const result = await new ImportFileParser().parseWithDiagnostics({ sourceId: "00000000-0000-4000-8000-000000000022", fileName: "catalog.pdf", fileType: "PDF", contentBase64: bytes.toString("base64"), columnMapping: { externalId: "externalId", name: "name" } });
    expect(result).toMatchObject({ rows: [], requiresReview: true, metadata: { method: "pdf_no_table" } });
  });
});
