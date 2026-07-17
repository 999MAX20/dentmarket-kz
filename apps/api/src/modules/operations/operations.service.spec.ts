import { describe, expect, it, vi } from "vitest";
import { OperationsService } from "./operations.service";

function prismaFixture() {
  return {
    organizationCapability: { findUnique: vi.fn() },
    productCandidate: { findMany: vi.fn().mockResolvedValue([]) },
    complianceCheck: { findMany: vi.fn().mockResolvedValue([]) },
    integrationReconciliationEntry: { findMany: vi.fn().mockResolvedValue([]) },
    importBatch: { findMany: vi.fn().mockResolvedValue([]) },
    marketplaceAgreement: { findMany: vi.fn().mockResolvedValue([]) },
    supplierOrder: { findMany: vi.fn().mockResolvedValue([]) },
    inventoryBalance: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("OperationsService", () => {
  it("denies the work queue to non-operators", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue(null);
    await expect(new OperationsService(prisma as never).workQueue({ actorId: "user", organizationId: "org" })).rejects.toThrow("Marketplace operator access is required");
  });

  it("aggregates actionable business blockers into one queue", async () => {
    const prisma = prismaFixture();
    prisma.organizationCapability.findUnique.mockResolvedValue({ organizationId: "operator" });
    prisma.productCandidate.findMany.mockResolvedValue([{ id: "candidate-1" }]);
    prisma.complianceCheck.findMany.mockResolvedValue([{ id: "check-1" }, { id: "check-2" }]);
    prisma.supplierOrder.findMany.mockResolvedValue([{ id: "order-1" }]);
    const result = await new OperationsService(prisma as never).workQueue({ actorId: "user", organizationId: "operator" });
    expect(result.totalOpenItems).toBe(4);
    expect(result.sections.map(({ type, count }) => ({ type, count }))).toContainEqual({ type: "COMPLIANCE_REVIEW", count: 2 });
    expect(result.sections.map(({ type, count }) => ({ type, count }))).toContainEqual({ type: "SUPPLIER_CONFIRMATION", count: 1 });
  });
});
