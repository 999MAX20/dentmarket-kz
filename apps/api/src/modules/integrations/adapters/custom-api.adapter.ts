import { Injectable } from "@nestjs/common";
import { asRecord, type AdapterResult, type CatalogPage, type ExternalCatalogItem, type ExternalInventoryItem, type ExternalPriceItem, type IntegrationAdapter, type IntegrationAdapterContext, type InventoryPage, PermanentIntegrationError, type PricePage, RetryableIntegrationError } from "./integration-adapter";

type ApiPayload = Record<string, unknown>;

@Injectable()
export class CustomApiIntegrationAdapter implements IntegrationAdapter {
  readonly provider = "CUSTOM_API" as const;

  private url(context: IntegrationAdapterContext, operation: string, cursor?: Record<string, unknown>) {
    const baseUrl = typeof context.configuration.baseUrl === "string" ? context.configuration.baseUrl : typeof context.configuration.endpoint === "string" ? context.configuration.endpoint : "";
    if (!baseUrl || !/^https:\/\//i.test(baseUrl)) throw new PermanentIntegrationError("CUSTOM_API requires an HTTPS configuration.baseUrl");
    const pathKey = `${operation}Path`;
    const pathValue = typeof context.configuration[pathKey] === "string" ? context.configuration[pathKey] as string : `/${operation}`;
    if (!pathValue.startsWith("/") || pathValue.startsWith("//")) throw new PermanentIntegrationError(`CUSTOM_API ${pathKey} must be a relative path`);
    const url = new URL(pathValue, `${baseUrl.replace(/\/$/, "")}/`);
    if (cursor) for (const [key, value] of Object.entries(cursor)) if (["string", "number", "boolean"].includes(typeof value)) url.searchParams.set(key, String(value));
    return url;
  }

  private async request(context: IntegrationAdapterContext, operation: string, method: "GET" | "POST", body?: Record<string, unknown>, cursor?: Record<string, unknown>) {
    const token = context.credentials.accessToken ?? context.credentials.apiKey;
    if (!token) throw new PermanentIntegrationError("CUSTOM_API accessToken or apiKey is missing");
    const timeout = Number(context.configuration.timeoutMs ?? 15_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number.isFinite(timeout) ? Math.min(60_000, Math.max(1_000, timeout)) : 15_000);
    try {
      const idempotencyKey = typeof body?.idempotencyKey === "string" ? body.idempotencyKey : undefined;
      const response = await fetch(this.url(context, operation, cursor), { method, signal: controller.signal, headers: { Accept: "application/json", ...(method === "POST" ? { "content-type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) }, body: method === "POST" ? JSON.stringify(body ?? {}) : undefined });
      const text = await response.text();
      let payload: ApiPayload = {};
      if (text) {
        try { payload = asRecord(JSON.parse(text)); } catch { throw new RetryableIntegrationError("CUSTOM_API returned invalid JSON"); }
      }
      if (!response.ok) {
        const message = typeof payload.message === "string" ? payload.message : `CUSTOM_API request failed with status ${response.status}`;
        if (response.status === 429 || response.status >= 500) throw new RetryableIntegrationError(message, Number(response.headers.get("retry-after") ?? 0) * 1_000 || undefined);
        throw new PermanentIntegrationError(message);
      }
      return payload;
    } catch (error) {
      if (error instanceof RetryableIntegrationError || error instanceof PermanentIntegrationError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new RetryableIntegrationError("CUSTOM_API request timed out");
      throw new RetryableIntegrationError(error instanceof Error ? error.message : "CUSTOM_API network request failed");
    } finally { clearTimeout(timer); }
  }

  private rows(payload: ApiPayload) {
    const data = asRecord(payload.data);
    return Array.isArray(payload.items) ? payload.items : Array.isArray(data.items) ? data.items : [];
  }

  private nextCursor(payload: ApiPayload) {
    const cursor = payload.nextCursor ?? asRecord(payload.meta).nextCursor;
    return cursor && typeof cursor === "object" && !Array.isArray(cursor) ? cursor as Record<string, unknown> : undefined;
  }

  private externalId(row: ApiPayload) { return String(row.externalId ?? row.id ?? row.sku ?? "").trim(); }

  async testConnection(context: IntegrationAdapterContext): Promise<AdapterResult> {
    const payload = await this.request(context, "health", "GET");
    return { externalId: typeof payload.accountId === "string" ? payload.accountId : undefined, data: { provider: this.provider, health: payload } };
  }

  async discover(context: IntegrationAdapterContext): Promise<AdapterResult> {
    const payload = await this.request(context, "discover", "GET");
    return { data: payload };
  }

  async pullCatalog(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<CatalogPage> {
    const payload = await this.request(context, "catalog", "GET", undefined, cursor);
    const items: ExternalCatalogItem[] = this.rows(payload).map((value) => { const row = asRecord(value); return { externalId: this.externalId(row), name: String(row.name ?? row.title ?? "Без названия"), supplierSku: typeof row.supplierSku === "string" ? row.supplierSku : typeof row.sku === "string" ? row.sku : undefined, gtin: typeof row.gtin === "string" ? row.gtin : undefined, brand: typeof row.brand === "string" ? row.brand : undefined, manufacturer: typeof row.manufacturer === "string" ? row.manufacturer : undefined, unit: typeof row.unit === "string" ? row.unit : undefined, raw: row }; }).filter(({ externalId }) => externalId.length > 0);
    return { items, nextCursor: this.nextCursor(payload) };
  }

  async pullPrices(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<PricePage> {
    const payload = await this.request(context, "prices", "GET", undefined, cursor);
    const items: ExternalPriceItem[] = this.rows(payload).flatMap((value) => { const row = asRecord(value); const externalId = this.externalId(row); const valueMinor = Number(row.valueMinor ?? row.amountMinor ?? row.price); if (!externalId || !Number.isFinite(valueMinor) || valueMinor < 0) return []; return [{ externalId, priceTypeId: typeof row.priceTypeId === "string" ? row.priceTypeId : undefined, priceTypeName: typeof row.priceTypeName === "string" ? row.priceTypeName : undefined, valueMinor, currency: typeof row.currency === "string" ? row.currency : "KZT", raw: row }]; });
    return { items, nextCursor: this.nextCursor(payload) };
  }

  async pullInventory(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<InventoryPage> {
    const payload = await this.request(context, "inventory", "GET", undefined, cursor);
    const items: ExternalInventoryItem[] = this.rows(payload).flatMap((value) => { const row = asRecord(value); const externalId = this.externalId(row); const stock = Number(row.stock ?? row.quantityOnHand ?? 0); const reserved = Number(row.reserved ?? row.quantityReserved ?? 0); if (!externalId || !Number.isFinite(stock) || !Number.isFinite(reserved)) return []; return [{ externalId, externalWarehouseId: typeof row.externalWarehouseId === "string" ? row.externalWarehouseId : typeof row.warehouseId === "string" ? row.warehouseId : undefined, stock, reserved, available: Number.isFinite(Number(row.available)) ? Number(row.available) : stock - reserved, raw: row }]; });
    return { items, nextCursor: this.nextCursor(payload) };
  }

  async exportOrder(context: IntegrationAdapterContext, payload: Record<string, unknown>) { return this.post(context, "orders", payload); }
  async createReservation(context: IntegrationAdapterContext, payload: Record<string, unknown>) { return this.post(context, "reservations", payload); }
  async releaseReservation(context: IntegrationAdapterContext, payload: Record<string, unknown>) { return this.post(context, "reservationRelease", payload); }

  private async post(context: IntegrationAdapterContext, operation: string, payload: Record<string, unknown>) {
    const result = await this.request(context, operation, "POST", payload);
    return { externalId: this.externalId(result), data: result };
  }
}
