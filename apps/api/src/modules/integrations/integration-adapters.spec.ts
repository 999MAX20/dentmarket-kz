import { afterEach, describe, expect, it, vi } from "vitest";
import { MockIntegrationAdapter } from "./adapters/mock.adapter";
import { MoySkladIntegrationAdapter } from "./adapters/moysklad.adapter";
import { RetryableIntegrationError } from "./adapters/integration-adapter";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const context = { connectionId: "00000000-0000-4000-8000-000000000101", credentials: { accessToken: "ms-token" }, configuration: {} };

describe("integration adapters", () => {
  it("keeps mock reservation IDs idempotent", async () => {
    const adapter = new MockIntegrationAdapter();
    const first = await adapter.createReservation(context, { inventoryReservationId: "r-1", quantity: "2" });
    const second = await adapter.createReservation(context, { inventoryReservationId: "r-1", quantity: "2" });
    expect(first.externalId).toBe(second.externalId);
  });

  it("reads a configured mock catalog only once", async () => {
    const adapter = new MockIntegrationAdapter();
    const configured = { ...context, configuration: { mockCatalog: [{ externalId: "item-1", name: "Композит A2", supplierSku: "SKU-1" }] } };
    expect((await adapter.pullCatalog(configured)).items[0]).toMatchObject({ externalId: "item-1", name: "Композит A2" });
    expect((await adapter.pullCatalog(configured, { offset: 1 })).items).toEqual([]);
  });

  it("normalizes configured mock prices and inventory", async () => {
    const adapter = new MockIntegrationAdapter();
    const configured = {
      ...context,
      configuration: {
        mockPrices: [{ externalId: "item-1", valueMinor: 125_000, currency: "KZT" }],
        mockInventory: [{ externalId: "item-1", externalWarehouseId: "warehouse-1", stock: 12, reserved: 3 }],
      },
    };
    expect((await adapter.pullPrices(configured)).items[0]).toMatchObject({ externalId: "item-1", valueMinor: 125_000, currency: "KZT" });
    expect((await adapter.pullInventory(configured)).items[0]).toMatchObject({ externalId: "item-1", externalWarehouseId: "warehouse-1", stock: 12, reserved: 3, available: 9 });
  });

  it("uses the official MySklad API base and bearer authorization", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "employee-1", meta: { href: "employee-href" } }), { status: 200, headers: { "content-type": "application/json", "x-ratelimit-remaining": "44" } }));
    globalThis.fetch = fetchMock;
    const adapter = new MoySkladIntegrationAdapter();
    const result = await adapter.testConnection(context);
    expect(result.externalId).toBe("employee-href");
    expect(fetchMock).toHaveBeenCalledWith("https://api.moysklad.ru/api/remap/1.2/context/employee/", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer ms-token" }) }));
  });

  it("turns MySklad rate limits into retryable failures", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ errors: [{ error: "rate limit" }] }), { status: 429, headers: { "x-lognex-retry-after": "2" } }));
    const adapter = new MoySkladIntegrationAdapter();
    const error = await adapter.testConnection(context).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RetryableIntegrationError);
    expect((error as RetryableIntegrationError).retryAfterMs).toBe(2_000);
  });

  it("selects and normalizes configured MySklad sale prices", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      rows: [{ id: "product-1", salePrices: [{ value: 100_000, priceType: { id: "retail", name: "Розница" } }, { value: 85_000, priceType: { id: "b2b", name: "B2B" } }] }],
      meta: { size: 1 },
    }), { status: 200 }));
    const adapter = new MoySkladIntegrationAdapter();
    const page = await adapter.pullPrices({ ...context, configuration: { priceTypeIds: ["b2b"], currency: "KZT" } });
    expect(page.items).toEqual([expect.objectContaining({ externalId: "product-1", priceTypeId: "b2b", priceTypeName: "B2B", valueMinor: 85_000, currency: "KZT" })]);
    expect(page.nextCursor).toEqual({ entity: "variant", offset: 0 });
  });

  it("reads MySklad product modifications through the variant endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ rows: [{ id: "variant-1", name: "Композит A2 / 4 г", code: "A2-4" }], meta: { size: 1 } }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const adapter = new MoySkladIntegrationAdapter();
    const page = await adapter.pullCatalog(context, { entity: "variant", offset: 0 });
    expect(page.items[0]).toMatchObject({ externalId: "variant-1", name: "Композит A2 / 4 г", supplierSku: "A2-4" });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/entity/variant?"), expect.any(Object));
  });

  it("flattens MySklad stock by store and keeps external reserve", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      rows: [{ meta: { href: "https://api.moysklad.ru/api/remap/1.2/entity/product/product-1" }, stockByStore: [{ meta: { href: "https://api.moysklad.ru/api/remap/1.2/entity/store/store-1" }, stock: 12, reserve: 4, inTransit: 2 }] }],
      meta: { size: 1 },
    }), { status: 200 }));
    const adapter = new MoySkladIntegrationAdapter();
    const page = await adapter.pullInventory(context);
    expect(page.items).toEqual([expect.objectContaining({ externalId: "product-1", externalWarehouseId: "store-1", stock: 12, reserved: 4, available: 8 })]);
  });
});
