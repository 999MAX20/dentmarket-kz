import { BadRequestException, Injectable } from "@nestjs/common";
import type { CreateImportBatchInput } from "@marketplace/schemas";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";

type RawRow = Record<string, string | number | boolean | null>;
export type ImportParseResult = { rows: RawRow[]; metadata: Record<string, unknown>; requiresReview: boolean };

function primitive(value: unknown): string | number | boolean | null {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

const headerHints = /(?:sku|артикул|код|наимен|товар|назван|price|цена|остат|колич|ед\.?\s*изм|бренд|gtin|штрих)/i;

function excelCell(cell: ExcelJS.Cell): string | number | boolean | null {
  if (cell.value instanceof Date) return cell.value.toISOString();
  if (typeof cell.value === "number" || typeof cell.value === "boolean") return cell.value;
  return cell.text.trim();
}

function findHeaderRow(sheet: ExcelJS.Worksheet) {
  let best = { row: 1, score: -Infinity, headers: [] as string[] };
  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 25); rowNumber += 1) {
    const headers = Array.from({ length: sheet.columnCount }, (_, index) => sheet.getRow(rowNumber).getCell(index + 1).text.trim());
    const populated = headers.filter(Boolean);
    if (populated.length < 2 || new Set(populated.map((value) => value.toLocaleLowerCase("ru"))).size !== populated.length) continue;
    const hints = populated.filter((value) => headerHints.test(value)).length;
    const numeric = populated.filter((value) => /^[-+]?\d+(?:[.,]\d+)?$/.test(value)).length;
    const score = populated.length * 10 + hints * 25 - numeric * 20;
    if (score > best.score) best = { row: rowNumber, score, headers };
  }
  if (!Number.isFinite(best.score)) throw new Error("Header row missing");
  return best;
}

@Injectable()
export class ImportFileParser {
  async parse(input: CreateImportBatchInput): Promise<RawRow[]> {
    return (await this.parseWithDiagnostics(input)).rows;
  }

  async parseWithDiagnostics(input: CreateImportBatchInput): Promise<ImportParseResult> {
    if (input.rows) return { rows: input.rows, metadata: { method: "explicit_rows" }, requiresReview: false };
    if (!input.contentBase64) throw new BadRequestException("Import file content is missing");
    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.contentBase64, "base64");
    } catch {
      throw new BadRequestException("Import file is not valid base64");
    }
    if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) throw new BadRequestException("Import file must be between 1 byte and 20 MB");

    if (input.fileType === "CSV") {
      try {
        const rows = parse(buffer, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true }) as Record<string, unknown>[];
        return { rows: rows.slice(0, 5_000).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, primitive(value)]))), metadata: { method: "csv" }, requiresReview: false };
      } catch {
        throw new BadRequestException("CSV file could not be parsed");
      }
    }

    if (input.fileType === "EXCEL") {
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error("Worksheet missing");
        const detected = findHeaderRow(sheet);
        const headers = detected.headers;
        const rows: RawRow[] = [];
        for (let rowNumber = detected.row + 1; rowNumber <= Math.min(sheet.rowCount, detected.row + 5_000); rowNumber += 1) {
          const row: RawRow = {};
          let hasValue = false;
          for (let column = 1; column <= headers.length; column += 1) {
            const header = headers[column - 1];
            if (!header) continue;
            const normalized = excelCell(sheet.getRow(rowNumber).getCell(column));
            if (normalized !== null && normalized !== "") hasValue = true;
            row[header] = normalized;
          }
          if (hasValue) rows.push(row);
        }
        return { rows, metadata: { method: "excel", sheet: sheet.name, headerRow: detected.row }, requiresReview: false };
      } catch {
        throw new BadRequestException("Excel file could not be parsed");
      }
    }

    if (input.fileType === "PDF") return this.parsePdf(buffer);

    throw new BadRequestException("MANUAL imports require explicit rows");
  }

  private async parsePdf(buffer: Buffer): Promise<ImportParseResult> {
    try {
      // pdfjs-dist is ESM-only. Keep this import dynamic at runtime so the API's
      // CommonJS bundle can start even when PDF import is not used by a request.
      let pdfModule: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
      try {
        pdfModule = await new Function("return import('pdfjs-dist/legacy/build/pdf.mjs')")() as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
      } catch {
        // Test runners may execute Function in a VM without a dynamic-import
        // callback. The native import path remains valid in that environment.
        pdfModule = await import("pdfjs-dist/legacy/build/pdf.mjs");
      }
      const { getDocument } = pdfModule;
      const document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
      const rows: RawRow[] = [];
      let textCharacters = 0;
      for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 100); pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items = content.items
          .filter((item): item is typeof item & { str: string; transform: number[]; width: number } => "str" in item && Boolean(item.str.trim()))
          .map((item) => ({ text: item.str.trim(), x: item.transform[4] ?? 0, y: item.transform[5] ?? 0, width: item.width ?? 0 }));
        textCharacters += items.reduce((sum, item) => sum + item.text.length, 0);
        const headerYs = this.pdfHeaderRows(items);
        for (let section = 0; section < headerYs.length; section += 1) {
          const headerY = headerYs[section]!;
          const nextHeaderY = headerYs[section + 1] ?? -Infinity;
          const anchors = items
            .filter((item) => item.y < headerY - 2 && item.y > nextHeaderY + 2 && item.x < viewport.width * 0.13 && /^\d{1,4}$/.test(item.text))
            .sort((left, right) => right.y - left.y);
          for (let index = 0; index < anchors.length; index += 1) {
            const anchor = anchors[index]!;
            const previousY = index === 0 ? headerY : anchors[index - 1]!.y;
            const nextY = index === anchors.length - 1 ? nextHeaderY : anchors[index + 1]!.y;
            const upper = (previousY + anchor.y) / 2;
            const lower = nextY === -Infinity ? anchor.y - 40 : (anchor.y + nextY) / 2;
            const band = items.filter((item) => item.y <= upper && item.y > lower && item.x >= viewport.width * 0.1).sort((left, right) => right.y - left.y || left.x - right.x);
            const price = [...band].filter((item) => item.x > viewport.width * 0.27 && /^\d+(?:[.,]\d{1,4})?$/.test(item.text)).sort((left, right) => right.x - left.x)[0];
            if (!price) continue;
            const unitItem = band.find((item) => /^(piece|set|pack|kit|шт\.?|компл\.?|упак\.?)$/i.test(item.text));
            const nameParts = band.filter((item) => item.x < price.x - 4 && item !== unitItem && !/^\d{1,4}$/.test(item.text));
            const name = nameParts.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
            if (name.length < 2) continue;
            const notes = band.filter((item) => item.x > price.x + price.width + 8).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
            rows.push({
              externalId: `pdf-${pageNumber}-${section + 1}-${index + 1}`,
              sourceRowNumber: anchor.text,
              name,
              supplierSku: "",
              unit: unitItem?.text ?? "",
              sourcePrice: price.text.replace(",", "."),
              priceMinor: "",
              currency: "",
              notes,
              sourcePage: pageNumber,
              requiresPriceConfirmation: true,
            });
          }
        }
      }
      const warnings = ["Валюта PDF не подтверждена: исходная цена сохранена, priceMinor не заполняется автоматически."];
      if (rows.length === 0) warnings.push("Машиночитаемая таблица не найдена. Требуется OCR или ручной маппинг.");
      return {
        rows: rows.slice(0, 5_000),
        requiresReview: rows.length === 0,
        metadata: { method: rows.length > 0 ? "pdf_text_table" : "pdf_no_table", pages: document.numPages, textCharacters, extractedRows: rows.length, warnings },
      };
    } catch {
      throw new BadRequestException("PDF file could not be parsed");
    }
  }

  private pdfHeaderRows(items: Array<{ text: string; x: number; y: number }>) {
    const groups = new Map<number, string[]>();
    for (const item of items) {
      const key = Math.round(item.y / 4) * 4;
      groups.set(key, [...(groups.get(key) ?? []), item.text]);
    }
    return [...groups.entries()]
      .filter(([, parts]) => { const line = parts.join("").replace(/\s+/g, "").toLowerCase(); return /no\.?name/.test(line) && /(price|unit|цена|стоимость)/.test(line); })
      .map(([y]) => y)
      .sort((left, right) => right - left);
  }
}
