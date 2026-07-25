import { describe, expect, it } from "vitest";
import {
  inferSupplierColumnMapping,
  normalizeImportedPriceMinor,
} from "./column-mapping";

describe("supplier price-list column mapping", () => {
  const requested = {
    externalId: "externalId",
    name: "name",
    supplierSku: "supplierSku",
    brand: "brand",
    priceMinor: "priceMinor",
    currency: "currency",
    quantityOnHand: "quantityOnHand",
  };

  it("recognizes a common Russian price list", () => {
    const result = inferSupplierColumnMapping(
      [
        {
          Артикул: "41294",
          Наименование: "Scotchbond Universal Plus 5 мл",
          Бренд: "Solventum",
          Цена: "32500",
          Остаток: "8",
        },
      ],
      requested,
    );
    expect(result.mapping).toMatchObject({
      externalId: "Артикул",
      supplierSku: "Артикул",
      name: "Наименование",
      brand: "Бренд",
      priceMinor: "Цена",
      quantityOnHand: "Остаток",
    });
    expect(result.missingRequired).toEqual([]);
  });

  it("falls back to the name when an external ID is absent", () => {
    const result = inferSupplierColumnMapping(
      [{ Товар: "Адгезив", Стоимость: 1000 }],
      requested,
    );
    expect(result.mapping?.externalId).toBe("Товар");
    expect(result.mapping?.name).toBe("Товар");
  });

  it("requires review when a product-name column cannot be found", () => {
    const result = inferSupplierColumnMapping([{ Цена: 1000 }], requested);
    expect(result.mapping).toBeNull();
    expect(result.missingRequired).toEqual(["name"]);
  });

  it("converts a normal price to minor units", () => {
    expect(normalizeImportedPriceMinor("32 500,50 ₸", "Цена")).toBe("3250050");
    expect(normalizeImportedPriceMinor("3250050", "priceMinor")).toBe("3250050");
  });
});
