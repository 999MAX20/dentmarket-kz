import { describe, expect, it, vi } from "vitest";
import { IntegrationExecutionService } from "./integration-execution.service";
import { PermanentIntegrationError } from "./adapters/integration-adapter";

function serviceWith(overrides: {
  order?: { supplierOrganizationId: string } | null;
  connectionSupplier?: string;
  agreement?: () => Promise<void>;
}) {
  const adapter = {
    exportOrder: vi
      .fn()
      .mockResolvedValue({ externalId: "external-1", data: {} }),
  };
  const service = new IntegrationExecutionService(
    {
      integrationConnection: {
        findUnique: vi
          .fn()
          .mockResolvedValue({
            id: "connection-1",
            supplierOrganizationId:
              overrides.connectionSupplier ?? "supplier-1",
          }),
      },
      supplierOrder: {
        findUnique: vi.fn().mockResolvedValue(overrides.order ?? null),
      },
    } as never,
    {
      resolve: vi
        .fn()
        .mockReturnValue({
          adapter,
          context: {
            connectionId: "connection-1",
            credentials: {},
            configuration: {},
          },
        }),
    } as never,
    {} as never,
    {} as never,
    {
      assertActive: overrides.agreement ?? vi.fn().mockResolvedValue(undefined),
    } as never,
  );
  return { service, adapter };
}

describe("IntegrationExecutionService ORDER_EXPORT agreement gate", () => {
  it("rejects a malformed export without supplierOrderId", async () => {
    const { service } = serviceWith({});
    await expect(
      service.execute({
        type: "ORDER_EXPORT",
        payload: {},
        connectionId: "connection-1",
      } as never),
    ).rejects.toThrow("supplierOrderId is required");
  });

  it("rejects an unknown order before calling the adapter", async () => {
    const { service } = serviceWith({ order: null });
    await expect(
      service.execute({
        type: "ORDER_EXPORT",
        payload: { supplierOrderId: "missing" },
        connectionId: "connection-1",
      } as never),
    ).rejects.toThrow("Supplier order not found");
  });

  it("rejects an order belonging to another supplier", async () => {
    const { service } = serviceWith({
      order: { supplierOrganizationId: "supplier-2" },
    });
    await expect(
      service.execute({
        type: "ORDER_EXPORT",
        payload: { supplierOrderId: "order-1" },
        connectionId: "connection-1",
      } as never),
    ).rejects.toThrow(PermanentIntegrationError);
  });
});
