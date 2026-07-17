import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { SupplierAccessService } from "../suppliers/supplier-access.service";

@Injectable()
export class InventoryFreshnessService {
  private readonly logger = new Logger(InventoryFreshnessService.name);
  constructor(private readonly prisma: PrismaService, private readonly access: SupplierAccessService) {}

  @Interval(60_000)
  async scheduledRecompute() {
    try { await this.recompute(undefined, undefined); }
    catch (error) { this.logger.error("Inventory freshness recompute failed", error instanceof Error ? error.stack : undefined); }
  }

  async recompute(supplierOrganizationId: string | undefined, staleAfterMinutes?: number, context?: SupplierActorContext) {
    if (supplierOrganizationId && context) await this.access.assertCanManage(supplierOrganizationId, context);
    const now = new Date();
    const candidates = await this.prisma.inventoryBalance.findMany({ where: { supplierOrganizationId, freshnessStatus: { not: "STALE" } }, select: { id: true, supplierOrganizationId: true, offerId: true, source: true, lastSuccessfulSyncAt: true, freshnessExpiresAt: true } });
    const policyRows = await this.prisma.freshnessPolicy.findMany({ where: { status: "ACTIVE", dataType: "INVENTORY", OR: [{ supplierOrganizationId }, { supplierOrganizationId: null }] }, orderBy: { priority: "asc" } });
    const staleBalances = candidates.filter((balance) => {
      if (balance.freshnessExpiresAt) return balance.freshnessExpiresAt <= now;
      const policy = policyRows.find((candidate) => candidate.supplierOrganizationId === balance.supplierOrganizationId && candidate.source === balance.source) ?? policyRows.find((candidate) => candidate.scopeKey === "global" && candidate.source === balance.source);
      const threshold = staleAfterMinutes ?? policy?.staleAfterMinutes ?? (balance.source === "API" || balance.source === "ERP" ? 15 : balance.source === "IMPORT" ? 24 * 60 : 48 * 60);
      return !balance.lastSuccessfulSyncAt || balance.lastSuccessfulSyncAt.getTime() + threshold * 60_000 <= now.getTime();
    });
    const bySupplier = new Map<string, typeof staleBalances>();
    for (const balance of staleBalances) bySupplier.set(balance.supplierOrganizationId, [...(bySupplier.get(balance.supplierOrganizationId) ?? []), balance]);

    const result: Array<{ supplierOrganizationId: string; staleBalances: number; pausedOffers: number }> = [];
    for (const [currentSupplierId, balances] of bySupplier) {
      const summary = await this.prisma.$transaction(async (tx) => {
        await tx.inventoryBalance.updateMany({ where: { id: { in: balances.map(({ id }) => id) } }, data: { freshnessStatus: "STALE", version: { increment: 1 } } });
        const offerIds = [...new Set(balances.map(({ offerId }) => offerId).filter((id): id is string => Boolean(id)))];
        const pausedOfferIds: string[] = [];
        for (const offerId of offerIds) {
          const freshAvailable = await tx.inventoryBalance.count({ where: { offerId, freshnessStatus: "FRESH", quantityAvailable: { gt: 0 } } });
          const source = balances.find(({ offerId: balanceOfferId }) => balanceOfferId === offerId)?.source;
          const policy = policyRows.find((candidate) => candidate.supplierOrganizationId === currentSupplierId && candidate.source === source) ?? policyRows.find((candidate) => candidate.scopeKey === "global" && candidate.source === source);
          if (freshAvailable === 0 && (policy?.expirationBehavior ?? "PAUSE") === "PAUSE") {
            const paused = await tx.offerPublication.updateMany({ where: { offerId, status: "PUBLISHED" }, data: { status: "PAUSED", marketplaceVisible: false } });
            if (paused.count > 0) pausedOfferIds.push(offerId);
          }
        }
        await tx.auditLog.create({ data: { actorId: context?.actorId ?? null, organizationId: context?.organizationId ?? currentSupplierId, action: "inventory.freshness.recomputed", entityType: "SupplierProfile", entityId: currentSupplierId, after: { staleBalanceIds: balances.map(({ id }) => id), pausedOfferIds, evaluatedAt: now.toISOString() } } });
        await tx.outboxEvent.create({ data: { aggregateType: "SupplierProfile", aggregateId: currentSupplierId, eventType: "InventoryFreshnessChanged", payload: { supplierOrganizationId: currentSupplierId, staleBalanceIds: balances.map(({ id }) => id), pausedOfferIds } } });
        return { supplierOrganizationId: currentSupplierId, staleBalances: balances.length, pausedOffers: pausedOfferIds.length };
      });
      result.push(summary);
    }
    return { evaluatedAt: now, suppliers: result, staleBalances: staleBalances.length, pausedOffers: result.reduce((total, item) => total + item.pausedOffers, 0) };
  }
}
