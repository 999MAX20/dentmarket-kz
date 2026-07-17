import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePromotionInput, EvaluatePromotionInput, RedeemPromotionInput } from "@marketplace/schemas";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { calculatePromotionDiscount, scopeMatches } from "./promotion-engine";

const couponHash = (value: string) => createHash("sha256").update(value.trim().toUpperCase()).digest("hex");

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async supplierOrganizationId(context: SupplierActorContext, requested?: string) {
    if (!requested || requested === context.organizationId) return context.organizationId;
    const operator = await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId: context.organizationId, capability: "MARKETPLACE_OPERATOR" } } });
    if (!operator) throw new NotFoundException("Supplier promotion workspace not found");
    return requested;
  }

  async create(input: CreatePromotionInput, context: SupplierActorContext, requestedSupplierId?: string) {
    const supplierOrganizationId = await this.supplierOrganizationId(context, requestedSupplierId);
    const supplier = await this.prisma.supplierProfile.findUnique({ where: { organizationId: supplierOrganizationId } });
    if (!supplier) throw new NotFoundException("Supplier profile not found");
    const scopedOffers = input.scope.offerIds.length ? await this.prisma.supplierOffer.findMany({ where: { id: { in: input.scope.offerIds }, supplierOrganizationId }, include: { prices: { where: { status: "ACTIVE" }, take: 1, orderBy: { validFrom: "desc" } } } }) : [];
    if (scopedOffers.length !== new Set(input.scope.offerIds).size) throw new NotFoundException("One or more scoped offers were not found");
    return this.prisma.$transaction(async (tx) => {
      const promotion = await tx.promotion.create({ data: { supplierOrganizationId, name: input.name, description: input.description, kind: input.kind, percentageBasisPoints: input.percentageBasisPoints, fixedAmountMinor: input.fixedAmountMinor, currency: input.currency, minimumOrderMinor: input.minimumOrderMinor, minimumQuantity: input.minimumQuantity, scope: input.scope, couponCodeHash: input.couponCode ? couponHash(input.couponCode) : null, isPrivate: input.isPrivate, usageLimit: input.usageLimit, perBuyerLimit: input.perBuyerLimit, startsAt: new Date(input.startsAt), endsAt: new Date(input.endsAt), createdById: context.actorId, oldPriceEvidence: { lookbackDays: 30, capturedAt: new Date().toISOString(), scopedOfferCount: scopedOffers.length } } });
      for (const offer of scopedOffers) for (const price of offer.prices) await tx.promotionPriceSnapshot.create({ data: { promotionId: promotion.id, offerId: offer.id, amountMinor: price.amountMinor, currency: price.currency, observedAt: price.validFrom, source: "active_price_at_creation" } });
      await tx.auditLog.create({ data: { ...context, organizationId: supplierOrganizationId, action: "promotion.created", entityType: "Promotion", entityId: promotion.id, after: { name: promotion.name, kind: promotion.kind, scope: promotion.scope, initiatedByOrganizationId: context.organizationId } } });
      return { ...promotion, couponCode: input.couponCode ?? null };
    });
  }

  async list(context: SupplierActorContext, activeOnly = false, requestedSupplierId?: string) {
    const supplierOrganizationId = await this.supplierOrganizationId(context, requestedSupplierId);
    const now = new Date();
    return this.prisma.promotion.findMany({ where: { supplierOrganizationId, ...(activeOnly ? { status: "ACTIVE", startsAt: { lte: now }, endsAt: { gt: now } } : {}) }, orderBy: [{ status: "asc" }, { startsAt: "desc" }], take: 200 });
  }

  async updateStatus(promotionId: string, status: "ACTIVE" | "PAUSED" | "ARCHIVED", version: number, context: SupplierActorContext, requestedSupplierId?: string) {
    const supplierOrganizationId = await this.supplierOrganizationId(context, requestedSupplierId);
    const promotion = await this.prisma.promotion.findFirst({ where: { id: promotionId, supplierOrganizationId } });
    if (!promotion) throw new NotFoundException("Promotion not found");
    if (promotion.version !== version) throw new ConflictException("Promotion changed; reload before updating");
    if (status === "ACTIVE" && promotion.endsAt <= new Date()) throw new ConflictException("Expired promotion cannot be activated");
    const updated = await this.prisma.promotion.updateMany({ where: { id: promotionId, version }, data: { status, version: { increment: 1 }, approvedById: status === "ACTIVE" ? context.actorId : promotion.approvedById, approvedAt: status === "ACTIVE" ? new Date() : promotion.approvedAt } });
    if (updated.count !== 1) throw new ConflictException("Promotion changed concurrently");
    await this.prisma.auditLog.create({ data: { ...context, organizationId: supplierOrganizationId, action: `promotion.${status.toLowerCase()}`, entityType: "Promotion", entityId: promotionId, before: { status: promotion.status, version }, after: { status, version: version + 1, initiatedByOrganizationId: context.organizationId } } });
    return this.prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
  }

  async setPlacement(promotionId: string, input: { isSponsored: boolean; label: string; version: number }, context: SupplierActorContext) {
    const operator = await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId: context.organizationId, capability: "MARKETPLACE_OPERATOR" } } });
    if (!operator) throw new NotFoundException("Promotion placement not found");
    const promotion = await this.prisma.promotion.findUnique({ where: { id: promotionId } });
    if (!promotion) throw new NotFoundException("Promotion not found");
    if (input.isSponsored && promotion.status !== "ACTIVE") throw new ConflictException("Only an active eligible promotion can receive a sponsored placement");
    const changed = await this.prisma.promotion.updateMany({ where: { id: promotionId, version: input.version }, data: { isSponsored: input.isSponsored, sponsorshipLabel: input.isSponsored ? input.label : null, sponsorshipApprovedById: input.isSponsored ? context.actorId : null, sponsorshipApprovedAt: input.isSponsored ? new Date() : null, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Promotion changed; reload before updating placement");
    const updated = await this.prisma.promotion.findUniqueOrThrow({ where: { id: promotionId } });
    await this.prisma.auditLog.create({ data: { ...context, action: "promotion.placement_updated", entityType: "Promotion", entityId: promotionId, before: { isSponsored: promotion.isSponsored, version: promotion.version }, after: { isSponsored: updated.isSponsored, label: updated.sponsorshipLabel, version: updated.version, organicRankingUnaffected: true } } });
    return updated;
  }

  private async target(input: EvaluatePromotionInput) {
    const offer = await this.prisma.supplierOffer.findUnique({ where: { id: input.offerId }, include: { productVariant: { include: { product: { include: { categories: true } } } } } });
    if (!offer) throw new NotFoundException("Offer not found");
    return { offer, target: { offerId: offer.id, productId: offer.productVariant.productId, categoryIds: offer.productVariant.product.categories.map(({ categoryId }) => categoryId), cityId: input.cityId, warehouseId: input.warehouseId } };
  }

  async evaluate(input: EvaluatePromotionInput) {
    const { offer, target } = await this.target(input);
    const at = input.at ? new Date(input.at) : new Date();
    const promotions = await this.prisma.promotion.findMany({ where: { supplierOrganizationId: offer.supplierOrganizationId, status: "ACTIVE", startsAt: { lte: at }, endsAt: { gt: at }, OR: [{ currency: input.currency }, { currency: null }] }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }] });
    const results = [];
    for (const promotion of promotions) {
      const scope = promotion.scope as Record<string, string[]>;
      if (!scopeMatches(scope, target)) continue;
      if (promotion.couponCodeHash && (!input.couponCode || couponHash(input.couponCode) !== promotion.couponCodeHash)) continue;
      if (promotion.usageLimit != null && promotion.redemptionCount >= promotion.usageLimit) continue;
      if (promotion.perBuyerLimit != null) {
        const used = await this.prisma.promotionRedemption.count({ where: { promotionId: promotion.id, buyerOrganizationId: input.buyerOrganizationId } });
        if (used >= promotion.perBuyerLimit) continue;
      }
      const calculation = calculatePromotionDiscount({ kind: promotion.kind, percentageBasisPoints: promotion.percentageBasisPoints, fixedAmountMinor: promotion.fixedAmountMinor == null ? null : BigInt(promotion.fixedAmountMinor.toString()), minimumOrderMinor: promotion.minimumOrderMinor == null ? null : BigInt(promotion.minimumOrderMinor.toString()), minimumQuantity: promotion.minimumQuantity == null ? null : Number(promotion.minimumQuantity) }, BigInt(input.subtotalMinor), input.quantity);
      if (calculation.eligible) results.push({ promotionId: promotion.id, name: promotion.name, kind: promotion.kind, discountMinor: calculation.discountMinor, freeShipping: calculation.freeShipping ?? false, currency: input.currency, endsAt: promotion.endsAt });
    }
    return results.sort((left, right) => Number(right.discountMinor - left.discountMinor));
  }

  async redeem(input: RedeemPromotionInput, context: SupplierActorContext) {
    const evaluation = await this.evaluate(input);
    const applied = evaluation.find(({ promotionId }) => promotionId === input.promotionId);
    if (!applied) throw new ConflictException("Promotion is not eligible for this order");
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.promotionRedemption.findUnique({ where: { promotionId_idempotencyKey: { promotionId: input.promotionId, idempotencyKey: input.idempotencyKey } } });
      if (existing) return existing;
      const promotion = await tx.promotion.findUniqueOrThrow({ where: { id: input.promotionId } });
      if (promotion.status !== "ACTIVE" || promotion.endsAt <= new Date() || (promotion.usageLimit != null && promotion.redemptionCount >= promotion.usageLimit)) throw new ConflictException("Promotion limit or validity changed");
      const redemption = await tx.promotionRedemption.create({ data: { promotionId: input.promotionId, buyerOrganizationId: input.buyerOrganizationId, checkoutId: input.checkoutId, supplierOrderId: input.supplierOrderId, discountAmountMinor: new Prisma.Decimal(applied.discountMinor.toString()), currency: input.currency, idempotencyKey: input.idempotencyKey, metadata: { offerId: input.offerId, quantity: input.quantity } } });
      await tx.promotion.update({ where: { id: input.promotionId }, data: { redemptionCount: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "promotion.redeemed", entityType: "PromotionRedemption", entityId: redemption.id, after: { promotionId: input.promotionId, discountMinor: applied.discountMinor.toString(), buyerOrganizationId: input.buyerOrganizationId } } });
      return redemption;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async analytics(context: SupplierActorContext, requestedSupplierId?: string) {
    const supplierOrganizationId = await this.supplierOrganizationId(context, requestedSupplierId);
    const promotions = await this.prisma.promotion.findMany({ where: { supplierOrganizationId }, select: { id: true, name: true, status: true, redemptionCount: true } });
    const totals = await this.prisma.promotionRedemption.groupBy({ by: ["promotionId", "currency"], where: { promotionId: { in: promotions.map(({ id }) => id) } }, _sum: { discountAmountMinor: true }, _count: true });
    return promotions.map((promotion) => ({ ...promotion, totals: totals.filter(({ promotionId }) => promotionId === promotion.id) }));
  }
}
