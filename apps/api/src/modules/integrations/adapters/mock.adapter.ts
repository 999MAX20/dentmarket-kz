import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { asRecord, type AdapterResult, type CatalogPage, type IntegrationAdapter, type IntegrationAdapterContext, type InventoryPage, type PricePage } from "./integration-adapter";

@Injectable()
export class MockIntegrationAdapter implements IntegrationAdapter {
  readonly provider = "MOCK" as const;

  private externalId(prefix: string, context: IntegrationAdapterContext, payload: Record<string, unknown>) {
    const digest = createHash("sha256").update(`${context.connectionId}:${JSON.stringify(payload)}`).digest("hex").slice(0, 20);
    return `${prefix}_${digest}`;
  }

  async testConnection(context: IntegrationAdapterContext): Promise<AdapterResult> {
    return { externalId: `mock-account-${context.connectionId}`, data: { ok: true, provider: this.provider, capabilities: ["CATALOG", "PRICE", "INVENTORY", "ORDER", "RESERVATION"] } };
  }

  async discover(context: IntegrationAdapterContext): Promise<AdapterResult> {
    return { data: { organizations: [{ id: "mock-org", name: "Mock organization" }], warehouses: [{ id: "mock-warehouse", name: "Mock warehouse" }], configured: Object.keys(context.configuration) } };
  }

  async pullCatalog(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<CatalogPage> {
    if (Number(cursor?.offset ?? 0) > 0) return { items: [] };
    const configured = Array.isArray(context.configuration.mockCatalog) ? context.configuration.mockCatalog : [];
    const items = configured.map((value, index) => {
      const item = asRecord(value);
      return {
        externalId: String(item.externalId ?? `mock-item-${index + 1}`),
        name: String(item.name ?? `Mock item ${index + 1}`),
        supplierSku: typeof item.supplierSku === "string" ? item.supplierSku : undefined,
        gtin: typeof item.gtin === "string" ? item.gtin : undefined,
        raw: item,
      };
    });
    return { items };
  }

  async pullPrices(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<PricePage> {
    if (Number(cursor?.offset ?? 0) > 0) return { items: [] };
    const configured = Array.isArray(context.configuration.mockPrices)
      ? context.configuration.mockPrices
      : Array.isArray(context.configuration.mockCatalog)
        ? context.configuration.mockCatalog
        : [];
    const currency = typeof context.configuration.currency === "string" ? context.configuration.currency : "KZT";
    const items = configured.flatMap((value, index) => {
      const item = asRecord(value);
      const valueMinor = Number(item.valueMinor ?? item.priceMinor);
      if (!Number.isFinite(valueMinor) || valueMinor < 0) return [];
      return [{
        externalId: String(item.externalId ?? `mock-item-${index + 1}`),
        priceTypeId: typeof item.priceTypeId === "string" ? item.priceTypeId : undefined,
        priceTypeName: typeof item.priceTypeName === "string" ? item.priceTypeName : undefined,
        valueMinor,
        currency: typeof item.currency === "string" ? item.currency : currency,
        raw: item,
      }];
    });
    return { items };
  }

  async pullInventory(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<InventoryPage> {
    if (Number(cursor?.offset ?? 0) > 0) return { items: [] };
    const configured = Array.isArray(context.configuration.mockInventory)
      ? context.configuration.mockInventory
      : Array.isArray(context.configuration.mockCatalog)
        ? context.configuration.mockCatalog
        : [];
    const items = configured.flatMap((value, index) => {
      const item = asRecord(value);
      const stock = Number(item.stock ?? item.quantityOnHand);
      if (!Number.isFinite(stock)) return [];
      const reserved = Number(item.reserved ?? 0);
      const available = Number(item.available ?? stock - reserved);
      if (!Number.isFinite(reserved) || !Number.isFinite(available)) return [];
      return [{
        externalId: String(item.externalId ?? `mock-item-${index + 1}`),
        externalWarehouseId: typeof item.externalWarehouseId === "string" ? item.externalWarehouseId : "mock-warehouse",
        stock,
        reserved,
        available,
        raw: item,
      }];
    });
    return { items };
  }

  async exportOrder(context: IntegrationAdapterContext, payload: Record<string, unknown>) {
    const externalId = this.externalId("mock_order", context, payload);
    return { externalId, data: { accepted: true, externalId } };
  }

  async createReservation(context: IntegrationAdapterContext, payload: Record<string, unknown>) {
    const externalId = this.externalId("mock_reservation", context, payload);
    return { externalId, data: { reserved: true, externalId } };
  }

  async releaseReservation(context: IntegrationAdapterContext, payload: Record<string, unknown>) {
    return { externalId: typeof payload.externalReservationId === "string" ? payload.externalReservationId : undefined, data: { released: true } };
  }
}
