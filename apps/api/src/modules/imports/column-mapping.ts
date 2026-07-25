import type { SupplierColumnMappingInput } from "@marketplace/schemas";

type RawRow = Record<string, unknown>;
type MappingField = keyof SupplierColumnMappingInput;

const HEADER_ALIASES: Record<MappingField, RegExp[]> = {
  externalId: [
    /^external[\s_-]*id$/i,
    /^id$/i,
    /внешн.*(?:id|код)/i,
    /идентификатор/i,
  ],
  name: [
    /наименован/i,
    /назван/i,
    /описан.*товар/i,
    /^товар$/i,
    /product.*name/i,
    /^name$/i,
    /description/i,
  ],
  supplierSku: [
    /артикул/i,
    /^sku$/i,
    /supplier.*sku/i,
    /код.*товар/i,
    /номенклатур/i,
    /^ref$/i,
  ],
  gtin: [/gtin/i, /\bean\b/i, /штрих.*код/i, /barcode/i],
  brand: [/бренд/i, /торгов.*марк/i, /^brand$/i],
  manufacturer: [/производител/i, /изготовител/i, /manufacturer/i, /vendor/i],
  unit: [/единиц.*измер/i, /^ед\.?$/i, /^unit$/i, /\buom\b/i],
  priceMinor: [
    /цена/i,
    /стоимост/i,
    /прайс/i,
    /^price/i,
    /amount/i,
  ],
  currency: [/валют/i, /currency/i, /^ccy$/i],
  quantityOnHand: [
    /остаток/i,
    /в наличии/i,
    /количеств/i,
    /^qty$/i,
    /stock/i,
    /quantity/i,
  ],
  lotNumber: [/номер.*парт/i, /серия/i, /^lot/i, /batch/i],
  expirationDate: [
    /срок.*годност/i,
    /годен.*до/i,
    /expiration/i,
    /expiry/i,
    /best.*before/i,
  ],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ");
}

function headersFromRows(rows: RawRow[]) {
  const headers = new Set<string>();
  for (const row of rows.slice(0, 20))
    for (const key of Object.keys(row))
      if (normalizeHeader(key)) headers.add(key);
  return [...headers];
}

function resolveHeader(
  field: MappingField,
  headers: string[],
  requested?: string,
) {
  if (requested) {
    const exact = headers.find(
      (header) =>
        normalizeHeader(header).toLocaleLowerCase("ru") ===
        normalizeHeader(requested).toLocaleLowerCase("ru"),
    );
    if (exact) return exact;
  }
  return headers.find((header) =>
    HEADER_ALIASES[field].some((pattern) => pattern.test(normalizeHeader(header))),
  );
}

export type InferredSupplierColumnMapping = {
  mapping: SupplierColumnMappingInput | null;
  inferredFields: MappingField[];
  missingRequired: Array<"name">;
};

export function inferSupplierColumnMapping(
  rows: RawRow[],
  requested: SupplierColumnMappingInput,
): InferredSupplierColumnMapping {
  const headers = headersFromRows(rows);
  const mapping: Partial<SupplierColumnMappingInput> = {};
  const inferredFields: MappingField[] = [];

  for (const field of Object.keys(HEADER_ALIASES) as MappingField[]) {
    const requestedHeader = requested[field];
    const resolved = resolveHeader(field, headers, requestedHeader);
    if (!resolved) continue;
    mapping[field] = resolved;
    if (resolved !== requestedHeader) inferredFields.push(field);
  }

  if (!mapping.name)
    return { mapping: null, inferredFields, missingRequired: ["name"] };

  // Supplier files often have no separate external ID. The item name is a
  // valid deterministic fallback; normalizeRow later prefers SKU and GTIN.
  if (!mapping.externalId) {
    mapping.externalId = mapping.supplierSku ?? mapping.gtin ?? mapping.name;
    inferredFields.push("externalId");
  }

  return {
    mapping: mapping as SupplierColumnMappingInput,
    inferredFields,
    missingRequired: [],
  };
}

export function normalizeImportedPriceMinor(
  rawValue: string | null,
  sourceHeader?: string,
) {
  if (!rawValue) return null;
  const normalized = rawValue
    .replace(/\s|\u00a0/g, "")
    .replace(/[₸₽$€]/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  const explicitlyMinor = /minor|тиын|копе/i.test(sourceHeader ?? "");
  return String(Math.round(explicitlyMinor ? amount : amount * 100));
}
