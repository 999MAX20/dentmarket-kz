import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) {}

  async buyerDashboard(context: SupplierActorContext) {
    const organizationId = context.organizationId;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [activeCart, pendingOrders, recentOrders, budgets, savedLists, spend] = await Promise.all([
      this.prisma.cart.findFirst({ where: { buyerOrganizationId: organizationId, status: "ACTIVE" }, include: { items: true }, orderBy: { updatedAt: "desc" } }),
      this.prisma.supplierOrder.count({ where: { buyerOrganizationId: organizationId, status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED", "PARTIALLY_CONFIRMED", "RESERVED", "AWAITING_PAYMENT", "PAID", "ASSEMBLING", "READY_TO_SHIP", "SHIPPED", "IN_TRANSIT"] } } }),
      this.prisma.supplierOrder.findMany({ where: { buyerOrganizationId: organizationId }, include: { supplier: { select: { displayName: true } }, items: { select: { offerId: true, quantity: true, acceptedQuantity: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
      this.prisma.purchaseBudget.findMany({ where: { organizationId, periodStart: { lte: now }, periodEnd: { gte: now } }, orderBy: { periodEnd: "asc" } }),
      this.prisma.savedList.count({ where: { organizationId } }),
      this.prisma.supplierOrder.aggregate({ where: { buyerOrganizationId: organizationId, createdAt: { gte: monthStart }, paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, _sum: { subtotalAmountMinor: true }, _count: true }),
    ]);
    return { activeCart: activeCart ? { id: activeCart.id, itemCount: activeCart.items.length, updatedAt: activeCart.updatedAt } : null, pendingOrders, recentOrders, budgets, savedLists, month: { orderCount: spend._count, spendMinor: spend._sum.subtotalAmountMinor ?? 0, currency: "KZT" } };
  }

  async supplierDashboard(context: SupplierActorContext) {
    const organizationId = context.organizationId;
    const now = new Date();
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [orders, revenue, offers, stale, integrations, payouts, promotions, lost] = await Promise.all([
      this.prisma.supplierOrder.count({ where: { supplierOrganizationId: organizationId, status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED", "PARTIALLY_CONFIRMED", "RESERVED", "AWAITING_PAYMENT", "PAID", "ASSEMBLING", "READY_TO_SHIP"] } } }),
      this.prisma.supplierOrder.aggregate({ where: { supplierOrganizationId: organizationId, createdAt: { gte: since }, paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, _sum: { subtotalAmountMinor: true }, _count: true }),
      this.prisma.supplierOffer.count({ where: { supplierOrganizationId: organizationId, status: "ACTIVE", publication: { marketplaceVisible: true } } }),
      this.prisma.inventoryBalance.count({ where: { supplierOrganizationId: organizationId, freshnessStatus: { in: ["STALE", "UNKNOWN"] } } }),
      this.prisma.integrationConnection.findMany({ where: { supplierOrganizationId: organizationId }, select: { id: true, provider: true, status: true, lastSuccessAt: true, lastErrorAt: true, lastError: true, consecutiveFailures: true }, orderBy: { updatedAt: "desc" } }),
      this.prisma.payout.groupBy({ by: ["status", "currency"], where: { paymentAllocation: { recipientOrganizationId: organizationId } }, _sum: { amountMinor: true }, _count: true }),
      this.prisma.promotion.count({ where: { supplierOrganizationId: organizationId, status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } } }),
      this.prisma.supplierOrderItem.aggregate({ where: { supplierOrder: { supplierOrganizationId: organizationId, createdAt: { gte: since } }, status: { in: ["REJECTED", "CANCELLED"] } }, _sum: { totalPriceMinor: true }, _count: true }),
    ]);
    return { pendingOrders: orders, last30Days: { orderCount: revenue._count, revenueMinor: revenue._sum.subtotalAmountMinor ?? 0, lostOrderItems: lost._count, estimatedLostSalesMinor: lost._sum.totalPriceMinor ?? 0, currency: "KZT" }, activeOffers: offers, staleInventory: stale, activePromotions: promotions, integrations, payouts };
  }

  async lists(context: SupplierActorContext) {
    const lists = await this.prisma.savedList.findMany({ where: { organizationId: context.organizationId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
    const items = await this.prisma.savedListItem.findMany({ where: { listId: { in: lists.map(({ id }) => id) } }, orderBy: { createdAt: "asc" } });
    return lists.map((list) => ({ ...list, items: items.filter(({ listId }) => listId === list.id) }));
  }

  async createList(input: { name: string; isDefault: boolean }, context: SupplierActorContext) {
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.savedList.updateMany({ where: { organizationId: context.organizationId, isDefault: true }, data: { isDefault: false } });
      const list = await tx.savedList.create({ data: { organizationId: context.organizationId, createdById: context.actorId, ...input } });
      await tx.auditLog.create({ data: { ...context, action: "saved_list.created", entityType: "SavedList", entityId: list.id, after: input } });
      return list;
    });
  }

  private async requireList(listId: string, context: SupplierActorContext) {
    const list = await this.prisma.savedList.findFirst({ where: { id: listId, organizationId: context.organizationId } });
    if (!list) throw new NotFoundException("Saved list not found");
    return list;
  }

  async upsertListItem(listId: string, input: { offerId: string; quantity: number; note?: string | null }, context: SupplierActorContext) {
    await this.requireList(listId, context);
    const offer = await this.prisma.supplierOffer.findFirst({ where: { id: input.offerId, status: "ACTIVE", publication: { marketplaceVisible: true } } });
    if (!offer) throw new NotFoundException("Published offer not found");
    return this.prisma.savedListItem.upsert({ where: { listId_offerId: { listId, offerId: input.offerId } }, update: { quantity: input.quantity, note: input.note }, create: { listId, offerId: input.offerId, quantity: input.quantity, note: input.note } });
  }

  async removeListItem(listId: string, itemId: string, context: SupplierActorContext) {
    await this.requireList(listId, context);
    const item = await this.prisma.savedListItem.findFirst({ where: { id: itemId, listId } });
    if (!item) throw new NotFoundException("Saved list item not found");
    await this.prisma.savedListItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  costCenters(context: SupplierActorContext) { return this.prisma.costCenter.findMany({ where: { organizationId: context.organizationId }, orderBy: { code: "asc" } }); }

  async createCostCenter(input: { code: string; name: string; managerId?: string | null }, context: SupplierActorContext) {
    try { return await this.prisma.costCenter.create({ data: { organizationId: context.organizationId, ...input } }); }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Cost center code already exists"); throw error; }
  }

  budgets(context: SupplierActorContext) { return this.prisma.purchaseBudget.findMany({ where: { organizationId: context.organizationId }, orderBy: [{ periodStart: "desc" }, { name: "asc" }] }); }

  async createBudget(input: { costCenterId?: string | null; name: string; periodStart: string; periodEnd: string; limitMinor: number; currency: string }, context: SupplierActorContext) {
    if (input.costCenterId && !await this.prisma.costCenter.findFirst({ where: { id: input.costCenterId, organizationId: context.organizationId, status: "ACTIVE" } })) throw new NotFoundException("Cost center not found");
    return this.prisma.purchaseBudget.create({ data: { organizationId: context.organizationId, costCenterId: input.costCenterId, name: input.name, periodStart: new Date(input.periodStart), periodEnd: new Date(input.periodEnd), limitMinor: input.limitMinor, currency: input.currency } });
  }
}
