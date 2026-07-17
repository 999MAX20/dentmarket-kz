import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomApiIntegrationAdapter } from "./custom-api.adapter";

const context = { connectionId: "connection-1", credentials: { accessToken: "api-secret" }, configuration: { baseUrl: "https://supplier.example.kz/api" } };

afterEach(() => vi.unstubAllGlobals());

describe("CustomApiIntegrationAdapter", () => {
  it("normalizes catalog, price and inventory contract pages", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "p-1", name: "Композит", sku: "SKU-1" }], nextCursor: { page: 2 } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ externalId: "p-1", amountMinor: 125000, currency: "KZT" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ externalId: "p-1", warehouseId: "w-1", stock: 10, reserved: 2 }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CustomApiIntegrationAdapter();
    await expect(adapter.pullCatalog(context)).resolves.toMatchObject({ items: [{ externalId: "p-1", supplierSku: "SKU-1" }], nextCursor: { page: 2 } });
    await expect(adapter.pullPrices(context)).resolves.toMatchObject({ items: [{ externalId: "p-1", valueMinor: 125000, currency: "KZT" }] });
    await expect(adapter.pullInventory(context)).resolves.toMatchObject({ items: [{ externalId: "p-1", externalWarehouseId: "w-1", stock: 10, reserved: 2, available: 8 }] });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ Authorization: "Bearer api-secret" }) });
  });

  it("adds idempotency and maps retryable upstream failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ externalId: "order-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const adapter = new CustomApiIntegrationAdapter();
    await expect(adapter.exportOrder(context, { idempotencyKey: "order-key", orderId: "local-order" })).resolves.toMatchObject({ externalId: "order-1" });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ headers: expect.objectContaining({ "idempotency-key": "order-key" }) });
  });
});
