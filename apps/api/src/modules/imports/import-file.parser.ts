import { BadRequestException, Injectable } from "@nestjs/common";
import type { CreateImportBatchInput } from "@marketplace/schemas";
import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";

type RawRow = Record<string, string | number | boolean | null>;

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
    if (input.rows) return input.rows;
    if (!input.contentBase64) throw new BadRequestException("Import file content is missing");
    let buffer: Buffer;
    try {
      buffer = Buffer.from(input.contentBase64, "base64");
    } catch {
      throw new BadRequestException("Import file is not valid base64");
    }
    if (buffer.length === 0 || buffer.length > 10 * 1024 * 1024) throw new BadRequestException("Import file must be between 1 byte and 10 MB");

    if (input.fileType === "CSV") {
      try {
        const rows = parse(buffer, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true }) as Record<string, unknown>[];
        return rows.slice(0, 5_000).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, primitive(value)])));
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
        return rows;
      } catch {
        throw new BadRequestException("Excel file could not be parsed");
      }
    }

    throw new BadRequestException("MANUAL imports require explicit rows");
  }
}
