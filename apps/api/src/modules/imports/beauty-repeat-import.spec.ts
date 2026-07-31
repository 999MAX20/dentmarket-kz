import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { inferSupplierColumnMapping } from "./import-file.parser";

const fixture = path.resolve(process.cwd(), "../../data/test-fixtures/beauty-repeat-import.csv");

describe("beauty repeat import fixture", () => {
  it("maps commercial columns while preserving canonical ownership and disposition", () => {
    const rows = parse(fs.readFileSync(fixture), { columns: true, skip_empty_lines: true, trim: true }) as Array<Record<string, string>>;
    const inferred = inferSupplierColumnMapping(rows);
    expect(inferred.missingRequired).toEqual([]);
    expect(inferred.mapping).toMatchObject({
      externalId: "externalId",
      name: "name",
      supplierSku: "supplierSku",
      priceMinor: "priceMinor",
      currency: "currency",
      quantityOnHand: "quantityOnHand",
      warehouse: "warehouse",
      leadTimeDays: "leadTimeDays",
    });
    expect(rows.filter((row) => row.expectedDisposition === "UPDATE_COMMERCIAL_ONLY")).toHaveLength(2);
    expect(rows.filter((row) => row.expectedDisposition === "CREATE_PRODUCT_CANDIDATE")).toHaveLength(1);
    expect(rows.every((row) => !("canonicalName" in row) && !("canonicalDescription" in row))).toBe(true);
  });
});
