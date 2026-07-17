import { Injectable } from "@nestjs/common";
import { asRecord, type AdapterResult, type CatalogPage, type IntegrationAdapter, type IntegrationAdapterContext, type InventoryPage, PermanentIntegrationError, type PricePage, RetryableIntegrationError } from "./integration-adapter";

type MoySkladResponse = Record<string, unknown> & { rows?: unknown[]; meta?: Record<string, unknown> };

@Injectable()
export class MoySkladIntegrationAdapter implements IntegrationAdapter {
  readonly provider = "MOYSKLAD" as const;
  private readonly baseUrl = "https://api.moysklad.ru/api/remap/1.2";
  private readonly fetchImpl = globalThis.fetch;

  private async request(context: IntegrationAdapterContext, path: string, init: RequestInit = {}) {
    const accessToken = context.credentials.accessToken;
    if (!accessToken) throw new PermanentIntegrationError("MySklad access token is missing");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(context.configuration.timeoutMs ?? 10_000));
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { Accept: "application/json;charset=utf-8", "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init.headers },
      });
      const text = await response.text();
      const body = text ? asRecord(JSON.parse(text) as unknown) : {};
      if (response.ok) return { body: body as MoySkladResponse, headers: response.headers };
      const message = this.errorMessage(body, response.status);
      if (response.status === 429 || response.status >= 500) {
        const retrySeconds = Number(response.headers.get("x-lognex-retry-after") ?? response.headers.get("retry-after") ?? 0);
        throw new RetryableIntegrationError(message, Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1_000 : undefined);
      }
      throw new PermanentIntegrationError(message);
    } catch (error) {
      if (error instanceof RetryableIntegrationError || error instanceof PermanentIntegrationError) throw error;
      if (error instanceof SyntaxError) throw new RetryableIntegrationError("MySklad returned invalid JSON");
      if (error instanceof Error && error.name === "AbortError") throw new RetryableIntegrationError("MySklad request timed out");
      throw new RetryableIntegrationError(error instanceof Error ? error.message : "MySklad network request failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  private errorMessage(body: Record<string, unknown>, status: number) {
    const errors = Array.isArray(body.errors) ? body.errors : [];
    const first = asRecord(errors[0]);
    return typeof first.error === "string" ? `MySklad ${status}: ${first.error}` : `MySklad request failed with status ${status}`;
  }

  private externalId(value: unknown) {
    const record = asRecord(value);
    if (typeof record.id === "string" && record.id.length > 0) return record.id;
    const href = typeof asRecord(record.meta).href === "string" ? String(asRecord(record.meta).href) : "";
    const match = href.match(/\/([^/?]+)(?:\?.*)?$/);
    return match?.[1] ?? href;
  }

  private page(context: IntegrationAdapterContext, cursor?: Record<string, unknown>) {
    return {
      offset: Math.max(0, Number(cursor?.offset ?? 0)),
      limit: Math.min(100, Math.max(1, Number(context.configuration.pageSize ?? 100))),
    };
  }

  private entity(cursor?: Record<string, unknown>) {
    return cursor?.entity === "variant" ? "variant" as const : "product" as const;
  }

  private nextEntityCursor(context: IntegrationAdapterContext, entity: "product" | "variant", offset: number, rowCount: number, size: number) {
    if (offset + rowCount < size) return { entity, offset: offset + rowCount };
    if (entity === "product" && context.configuration.includeVariants !== false) return { entity: "variant", offset: 0 };
    return undefined;
  }

  async testConnection(context: IntegrationAdapterContext): Promise<AdapterResult> {
    const { body, headers } = await this.request(context, "/context/employee/");
    const meta = asRecord(body.meta);
    return { externalId: typeof meta.href === "string" ? meta.href : undefined, data: { employee: body, rateLimitRemaining: headers.get("x-ratelimit-remaining") } };
  }

  async discover(context: IntegrationAdapterContext): Promise<AdapterResult> {
    const organizations = await this.request(context, "/entity/organization?limit=100");
    const stores = await this.request(context, "/entity/store?limit=100");
    const priceTypes = await this.request(context, "/context/companysettings/pricetype?limit=100");
    return { data: { organizations: organizations.body.rows ?? [], warehouses: stores.body.rows ?? [], priceTypes: priceTypes.body.rows ?? [] } };
  }

  async pullCatalog(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<CatalogPage> {
    const { offset, limit } = this.page(context, cursor);
    const entity = this.entity(cursor);
    const { body } = await this.request(context, `/entity/${entity}?limit=${limit}&offset=${offset}`);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const items = rows.map((value) => {
      const row = asRecord(value);
      const barcodes = Array.isArray(row.barcodes) ? row.barcodes.map(asRecord) : [];
      const firstBarcode = barcodes.map((barcode) => Object.values(barcode).find((item) => typeof item === "string")).find((item) => typeof item === "string");
      return {
        externalId: this.externalId(row),
        name: String(row.name ?? "Без названия"),
        supplierSku: typeof row.article === "string" ? row.article : typeof row.code === "string" ? row.code : undefined,
        gtin: typeof firstBarcode === "string" ? firstBarcode : undefined,
        raw: row,
      };
    }).filter((item) => item.externalId.length > 0);
    const size = Number(asRecord(body.meta).size ?? rows.length);
    return { items, nextCursor: this.nextEntityCursor(context, entity, offset, rows.length, size) };
  }

  async pullPrices(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<PricePage> {
    const { offset, limit } = this.page(context, cursor);
    const entity = this.entity(cursor);
    const { body } = await this.request(context, `/entity/${entity}?limit=${limit}&offset=${offset}`);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const configuredIds = Array.isArray(context.configuration.priceTypeIds)
      ? context.configuration.priceTypeIds.filter((value): value is string => typeof value === "string")
      : typeof context.configuration.priceTypeId === "string"
        ? [context.configuration.priceTypeId]
        : [];
    const currency = typeof context.configuration.currency === "string" ? context.configuration.currency : "KZT";
    const items = rows.flatMap((value) => {
      const row = asRecord(value);
      const externalId = this.externalId(row);
      if (!externalId) return [];
      const prices = (Array.isArray(row.salePrices) ? row.salePrices : []).map(asRecord);
      const selected = configuredIds.length > 0
        ? prices.filter((price) => configuredIds.includes(this.externalId(asRecord(price.priceType))))
        : prices.slice(0, 1);
      return selected.flatMap((price) => {
        const valueMinor = Number(price.value);
        if (!Number.isFinite(valueMinor) || valueMinor < 0) return [];
        const priceType = asRecord(price.priceType);
        return [{
          externalId,
          priceTypeId: this.externalId(priceType) || undefined,
          priceTypeName: typeof priceType.name === "string" ? priceType.name : undefined,
          valueMinor,
          currency,
          raw: { product: row, salePrice: price },
        }];
      });
    });
    const size = Number(asRecord(body.meta).size ?? rows.length);
    return { items, nextCursor: this.nextEntityCursor(context, entity, offset, rows.length, size) };
  }

  async pullInventory(context: IntegrationAdapterContext, cursor?: Record<string, unknown>): Promise<InventoryPage> {
    const { offset, limit } = this.page(context, cursor);
    const { body } = await this.request(context, `/report/stock/bystore?limit=${limit}&offset=${offset}`);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const configuredWarehouseIds = Array.isArray(context.configuration.externalWarehouseIds)
      ? context.configuration.externalWarehouseIds.filter((value): value is string => typeof value === "string")
      : [];
    const items = rows.flatMap((value) => {
      const row = asRecord(value);
      const externalId = this.externalId(row);
      if (!externalId) return [];
      const stockByStore = Array.isArray(row.stockByStore) ? row.stockByStore.map(asRecord) : [];
      return stockByStore.flatMap((stockRow) => {
        const externalWarehouseId = this.externalId(stockRow);
        if (!externalWarehouseId || (configuredWarehouseIds.length > 0 && !configuredWarehouseIds.includes(externalWarehouseId))) return [];
        const stock = Number(stockRow.stock ?? 0);
        const reserved = Number(stockRow.reserve ?? 0);
        if (!Number.isFinite(stock) || !Number.isFinite(reserved)) return [];
        return [{
          externalId,
          externalWarehouseId,
          stock,
          reserved,
          available: stock - reserved,
          raw: { product: row, stockByStore: stockRow },
        }];
      });
    });
    const size = Number(asRecord(body.meta).size ?? rows.length);
    return { items, nextCursor: offset + rows.length < size ? { offset: offset + rows.length } : undefined };
  }

  async exportOrder(context: IntegrationAdapterContext, payload: Record<string, unknown>) {
    return this.postExternalPayload(context, "/entity/customerorder", payload);
  }

  async createReservation(context: IntegrationAdapterContext, payload: Record<string, unknown>) {
    return this.postExternalPayload(context, "/entity/customerorder", payload);
  }

  async releaseReservation(_context: IntegrationAdapterContext, _payload: Record<string, unknown>): Promise<AdapterResult> {
    throw new PermanentIntegrationError("MySklad reservation release requires an explicit customer-order synchronization mapping");
  }

  private async postExternalPayload(context: IntegrationAdapterContext, path: string, payload: Record<string, unknown>): Promise<AdapterResult> {
    const externalPayload = asRecord(payload.externalPayload);
    if (Object.keys(externalPayload).length === 0) throw new PermanentIntegrationError("MySklad externalPayload mapping is not configured");
    const { body } = await this.request(context, path, { method: "POST", body: JSON.stringify(externalPayload) });
    return { externalId: typeof body.id === "string" ? body.id : undefined, data: body };
  }
}
