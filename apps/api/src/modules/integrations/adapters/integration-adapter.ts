export type IntegrationAdapterContext = {
  connectionId: string;
  credentials: Record<string, string>;
  configuration: Record<string, unknown>;
};

export type ExternalCatalogItem = {
  externalId: string;
  name: string;
  supplierSku?: string;
  gtin?: string;
  brand?: string;
  manufacturer?: string;
  unit?: string;
  raw: Record<string, unknown>;
};

export type CatalogPage = { items: ExternalCatalogItem[]; nextCursor?: Record<string, unknown> };
export type ExternalPriceItem = {
  externalId: string;
  priceTypeId?: string;
  priceTypeName?: string;
  valueMinor: number;
  currency: string;
  raw: Record<string, unknown>;
};

export type ExternalInventoryItem = {
  externalId: string;
  externalWarehouseId?: string;
  stock: number;
  reserved: number;
  available: number;
  raw: Record<string, unknown>;
};

export type PricePage = { items: ExternalPriceItem[]; nextCursor?: Record<string, unknown> };
export type InventoryPage = { items: ExternalInventoryItem[]; nextCursor?: Record<string, unknown> };
export type AdapterResult = { externalId?: string; data: Record<string, unknown> };

export class RetryableIntegrationError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = "RetryableIntegrationError";
  }
}

export class PermanentIntegrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentIntegrationError";
  }
}

export interface IntegrationAdapter {
  readonly provider: "MOYSKLAD" | "MOCK";
  testConnection(context: IntegrationAdapterContext): Promise<AdapterResult>;
  discover(context: IntegrationAdapterContext): Promise<AdapterResult>;
  pullCatalog(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<CatalogPage>;
  pullPrices(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<PricePage>;
  pullInventory(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<InventoryPage>;
  exportOrder(context: IntegrationAdapterContext, payload: Record<string, unknown>): Promise<AdapterResult>;
  createReservation(context: IntegrationAdapterContext, payload: Record<string, unknown>): Promise<AdapterResult>;
  releaseReservation(context: IntegrationAdapterContext, payload: Record<string, unknown>): Promise<AdapterResult>;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
