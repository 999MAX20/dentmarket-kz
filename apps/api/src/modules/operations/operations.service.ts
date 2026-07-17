import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/prisma/prisma.service";

type OperationsContext = { actorId: string; organizationId: string };

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertOperator(organizationId: string) {
    const capability = await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } }, select: { organizationId: true } });
    if (!capability) throw new ForbiddenException("Marketplace operator access is required");
  }

  async workQueue(context: OperationsContext) {
    await this.assertOperator(context.organizationId);
    const now = new Date();
    const [candidates, compliance, reconciliations, imports, agreements, orders, staleInventory] = await Promise.all([
      this.prisma.productCandidate.findMany({ where: { status: "PENDING" }, select: { id: true, supplierOrganizationId: true, proposedName: true, proposedSku: true, proposedGtin: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 50 }),
      this.prisma.complianceCheck.findMany({ where: { status: "REVIEW_REQUIRED" }, select: { id: true, sellerOrganizationId: true, buyerOrganizationId: true, offerId: true, warehouseId: true, riskLevel: true, reasons: true, evaluatedAt: true }, orderBy: [{ riskLevel: "desc" }, { evaluatedAt: "asc" }], take: 50 }),
      this.prisma.integrationReconciliationEntry.findMany({ where: { status: { in: ["MISMATCH", "MISSING_EXTERNAL", "MISSING_INTERNAL"] } }, select: { id: true, connectionId: true, kind: true, status: true, externalRef: true, internalType: true, internalId: true, detectedAt: true }, orderBy: { detectedAt: "asc" }, take: 50 }),
      this.prisma.importBatch.findMany({ where: { status: { in: ["UPLOADED", "MAPPED", "REVIEW_REQUIRED", "PROCESSING", "COMPLETED_WITH_ERRORS", "FAILED"] } }, select: { id: true, supplierOrganizationId: true, sourceId: true, fileName: true, status: true, totalRows: true, processedRows: true, errorRows: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 50 }),
      this.prisma.marketplaceAgreement.findMany({ where: { status: "AWAITING_SIGNATURE" }, select: { id: true, agreementNumber: true, supplierOrganizationId: true, operatorOrganizationId: true, documentId: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 50 }),
      this.prisma.supplierOrder.findMany({ where: { status: "AWAITING_CONFIRMATION" }, select: { id: true, orderNumber: true, supplierOrganizationId: true, buyerOrganizationId: true, subtotalAmountMinor: true, currency: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 50 }),
      this.prisma.inventoryBalance.findMany({ where: { freshnessStatus: { in: ["STALE", "UNKNOWN"] }, quantityAvailable: { gt: 0 } }, select: { id: true, supplierOrganizationId: true, offerId: true, warehouseId: true, quantityAvailable: true, freshnessStatus: true, freshnessExpiresAt: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 50 }),
    ]);
    const sections = [
      { type: "CATALOG_REVIEW", priority: "HIGH", count: candidates.length, items: candidates },
      { type: "COMPLIANCE_REVIEW", priority: "CRITICAL", count: compliance.length, items: compliance },
      { type: "INTEGRATION_RECONCILIATION", priority: "HIGH", count: reconciliations.length, items: reconciliations },
      { type: "IMPORT_ATTENTION", priority: "NORMAL", count: imports.length, items: imports },
      { type: "AGREEMENT_SIGNATURE", priority: "HIGH", count: agreements.length, items: agreements },
      { type: "SUPPLIER_CONFIRMATION", priority: "HIGH", count: orders.length, items: orders },
      { type: "STALE_INVENTORY", priority: "HIGH", count: staleInventory.length, items: staleInventory },
    ];
    return { generatedAt: now.toISOString(), operatorOrganizationId: context.organizationId, totalOpenItems: sections.reduce((sum, section) => sum + section.count, 0), sections };
  }
}
