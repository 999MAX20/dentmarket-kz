import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { SmartRecommendationInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { resolvePriceRules } from "../pricing/price-resolver";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { haversineKm, rankRecommendations, type RecommendationCandidate } from "./recommendation.engine";

@Injectable()
export class SmartRecommendationService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertBuyer(input: SmartRecommendationInput, context: SupplierActorContext) {
    const operator = Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId: context.organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
    if (input.buyerOrganizationId !== context.organizationId && !operator) throw new ForbiddenException("Buyer recommendation context belongs to another organization");
    const address = await this.prisma.address.findFirst({ where: { id: input.destinationAddressId, organizationId: input.buyerOrganizationId }, include: { city: { include: { region: true } } } });
    if (!address) throw new NotFoundException("Buyer destination address not found");
    return address;
  }

  async recommend(input: SmartRecommendationInput, context: SupplierActorContext) {
    const existing = await this.prisma.recommendationDecision.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing && existing.buyerOrganizationId === input.buyerOrganizationId) return existing.result;
    const address = await this.assertBuyer(input, context);
    const now = new Date();
    const [buyer, dentistry] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: input.buyerOrganizationId }, select: { primaryIndustryId: true } }),
      this.prisma.industry.findUnique({ where: { code: "dentistry-kz" }, select: { id: true } }),
    ]);
    const industryId = buyer?.primaryIndustryId ?? dentistry?.id;
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, status: "ACTIVE", ...(industryId ? { industries: { some: { industryId } } } : {}) }, include: {
      categories: true,
      variants: { where: { status: "ACTIVE" }, include: { supplierOffers: { where: { status: "ACTIVE", publication: { is: { marketplaceVisible: true, status: { in: ["PUBLISHED", "RESTRICTED"] } } } }, include: {
        supplier: { include: { organization: true } },
        packaging: true,
        prices: { where: { status: "ACTIVE", validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] }, orderBy: { validFrom: "desc" }, take: 1 },
        priceTiers: { where: { minimumQuantity: { lte: input.quantity }, validFrom: { lte: now }, OR: [{ maximumQuantity: null }, { maximumQuantity: { gte: input.quantity } }], AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }] } },
        contractPrices: { where: { buyerOrganizationId: input.buyerOrganizationId, status: "ACTIVE", minimumQuantity: { lte: input.quantity }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] } },
        inventoryBalances: { where: { quantityAvailable: { gt: 0 } }, include: { warehouse: true }, orderBy: { quantityAvailable: "desc" } },
        deliveryOptions: { where: { status: "ACTIVE" }, include: { warehouse: true } },
      } } } },
    } });
    if (!product) throw new NotFoundException("Marketplace product not found");
    const offers = product.variants.flatMap(({ supplierOffers }) => supplierOffers);
    const supplierIds = [...new Set(offers.map(({ supplierOrganizationId }) => supplierOrganizationId))];
    const offerIds = offers.map(({ id }) => id);
    const warehouseIds = offers.flatMap(({ inventoryBalances }) => inventoryBalances.map(({ warehouseId }) => warehouseId));
    const [trustSnapshots, performance, promotions, purchased, gaps, deliveryRules, promotedFlag] = await Promise.all([
      this.prisma.supplierTrustSnapshot.findMany({ where: { supplierOrganizationId: { in: supplierIds } } }),
      this.prisma.deliveryPerformanceEvent.groupBy({ by: ["supplierOrganizationId"], where: { supplierOrganizationId: { in: supplierIds }, destinationCityId: address.cityId, actualHours: { not: null }, occurredAt: { gte: new Date(Date.now() - 180 * 86_400_000) } }, _avg: { actualHours: true }, _count: true }),
      this.prisma.promotion.findMany({ where: { supplierOrganizationId: { in: supplierIds }, status: "ACTIVE", isPrivate: false, startsAt: { lte: now }, endsAt: { gt: now } } }),
      this.prisma.supplierOrderItem.findMany({ where: { offerId: { in: offerIds }, supplierOrder: { buyerOrganizationId: input.buyerOrganizationId, status: { in: ["DELIVERED", "PARTIALLY_FULFILLED"] } } }, select: { offerId: true }, distinct: ["offerId"] }),
      this.prisma.productGapIncident.findMany({ where: { status: { in: ["HARD_BLOCKED", "SOFT_ACTION_ACTIVE"] }, OR: [{ subjectType: "SupplierOffer", subjectId: { in: offerIds } }, { subjectType: "Warehouse", subjectId: { in: warehouseIds } }, { subjectType: "Organization", subjectId: { in: supplierIds } }] } }),
      this.prisma.deliveryRule.findMany({ where: { supplierOrganizationId: { in: supplierIds }, status: "ACTIVE", OR: [{ deliveryZoneId: null }, { deliveryZone: { cities: { some: { cityId: address.cityId } } } }] }, include: { deliveryZone: { include: { cities: true } } }, orderBy: { priority: "asc" } }),
      this.prisma.featureFlag.findUnique({ where: { key: "promoted.offers" } }),
    ]);
    const trustBySupplier = new Map(trustSnapshots.map((snapshot) => [snapshot.supplierOrganizationId, snapshot]));
    const performanceBySupplier = new Map(performance.map((item) => [item.supplierOrganizationId, item]));
    const purchasedOfferIds = new Set(purchased.map(({ offerId }) => offerId));
    const categoryIds = product.categories.map(({ categoryId }) => categoryId);
    const candidates: RecommendationCandidate[] = [];
    const details = new Map<string, Record<string, unknown>>();

    for (const offer of offers) {
      const decision = resolvePriceRules({ quantity: input.quantity, at: now, contracts: offer.contractPrices.map((price) => ({ id: price.id, amountMinor: price.amountMinor.toString(), currency: price.currency, minimumQuantity: price.minimumQuantity.toString(), validFrom: price.validFrom, validTo: price.validTo, priority: price.priority })), tiers: offer.priceTiers.map((price) => ({ id: price.id, amountMinor: price.unitPriceMinor.toString(), currency: price.currency, minimumQuantity: price.minimumQuantity.toString(), maximumQuantity: price.maximumQuantity?.toString(), validFrom: price.validFrom, validTo: price.validTo })), base: offer.prices[0] ? { id: offer.prices[0].id, amountMinor: offer.prices[0].amountMinor.toString(), currency: offer.prices[0].currency, validFrom: offer.prices[0].validFrom, validTo: offer.prices[0].validTo } : null });
      if (!decision.amountMinor) continue;
      const balance = offer.inventoryBalances.find(({ quantityAvailable }) => Number(quantityAvailable) >= input.quantity) ?? offer.inventoryBalances[0];
      if (!balance) continue;
      const option = offer.deliveryOptions.find(({ warehouseId, method }) => warehouseId === balance.warehouseId && (balance.warehouse.cityId === address.cityId || ["NATIONWIDE", "CARRIER", "MARKETPLACE_LOGISTICS", "SPECIAL"].includes(method))) ?? offer.deliveryOptions.find(({ warehouseId }) => warehouseId === balance.warehouseId);
      const rule = deliveryRules.find((item) => item.supplierOrganizationId === offer.supplierOrganizationId && (!item.warehouseId || item.warehouseId === balance.warehouseId) && (!item.categoryId || categoryIds.includes(item.categoryId)));
      const relatedGaps = gaps.filter((gap) => [offer.id, balance.warehouseId, offer.supplierOrganizationId].includes(gap.subjectId));
      const deliverable = Boolean(option || rule || balance.warehouse.cityId === address.cityId);
      const basePriceMinor = Number(decision.amountMinor) * input.quantity;
      const promotion = promotions.find((item) => {
        const scope = item.scope && typeof item.scope === "object" && !Array.isArray(item.scope) ? item.scope as Record<string, unknown> : {};
        const matches = (key: string, value: string) => !Array.isArray(scope[key]) || (scope[key] as string[]).length === 0 || (scope[key] as string[]).includes(value);
        return item.supplierOrganizationId === offer.supplierOrganizationId && matches("offerIds", offer.id) && matches("productIds", product.id) && (!Array.isArray(scope.categoryIds) || scope.categoryIds.length === 0 || categoryIds.some((id) => (scope.categoryIds as string[]).includes(id))) && matches("cityIds", address.cityId) && matches("warehouseIds", balance.warehouseId);
      });
      let discountMinor = 0;
      if (!relatedGaps.some(({ actionType }) => actionType === "HIDE_DISCOUNT") && promotion?.kind === "PERCENTAGE" && promotion.percentageBasisPoints) discountMinor = Math.floor(basePriceMinor * promotion.percentageBasisPoints / 10_000);
      if (!relatedGaps.some(({ actionType }) => actionType === "HIDE_DISCOUNT") && promotion?.kind === "FIXED_AMOUNT" && promotion.fixedAmountMinor) discountMinor = Math.min(basePriceMinor, Number(promotion.fixedAmountMinor));
      const deliveryPriceMinor = promotion?.kind === "FREE_SHIPPING" ? 0 : option?.priceType === "FIXED" ? Number(option.fixedAmountMinor ?? 0) : rule?.priceType === "FIXED" ? Number(rule.fixedAmountMinor ?? 0) : 0;
      const history = performanceBySupplier.get(offer.supplierOrganizationId);
      const etaHours = Math.max(1, Math.round(Number(history?._avg.actualHours ?? option?.maxLeadTimeHours ?? rule?.maxLeadTimeHours ?? option?.minLeadTimeHours ?? rule?.minLeadTimeHours ?? (balance.warehouse.cityId === address.cityId ? 8 : 72))));
      const trust = trustBySupplier.get(offer.supplierOrganizationId);
      const availabilityIndicator = Array.isArray(trust?.indicators) ? (trust.indicators as Array<Record<string, unknown>>).find(({ code }) => code === "availability_accuracy") : null;
      const baseConfirmationProbability = typeof availabilityIndicator?.value === "number" ? availabilityIndicator.value / 100 : 0.75;
      const confirmationProbability = relatedGaps.some(({ actionType }) => actionType === "REQUIRE_CONFIRMATION") ? baseConfirmationProbability * 0.7 : baseConfirmationProbability;
      const freshness = balance.freshnessStatus === "FRESH" && (!balance.freshnessExpiresAt || balance.freshnessExpiresAt > now) ? 1 : balance.freshnessStatus === "STALE" ? 0.45 : 0.2;
      const criticalRisk = gaps.some((gap) => gap.actionType === "HARD_BLOCK" && [offer.id, balance.warehouseId, offer.supplierOrganizationId].includes(gap.subjectId));
      const verifiedWarehouse = balance.warehouse.geoStatus === "VERIFIED";
      const distanceKm = address.latitude != null && address.longitude != null && balance.warehouse.latitude != null && balance.warehouse.longitude != null ? haversineKm({ latitude: Number(address.latitude), longitude: Number(address.longitude) }, { latitude: Number(balance.warehouse.latitude), longitude: Number(balance.warehouse.longitude) }) : null;
      const candidate: RecommendationCandidate = { offerId: offer.id, productPriceMinor: Math.max(0, basePriceMinor - discountMinor), deliveryPriceMinor, etaHours, freshness, confirmationProbability, trustScore: trust?.score == null ? null : Number(trust.score), verifiedWarehouse, distanceKm, personalPrice: decision.source === "CONTRACT", previouslyPurchased: purchasedOfferIds.has(offer.id), sponsored: Boolean(promotedFlag?.enabled && promotion?.isSponsored && verifiedWarehouse && freshness >= 0.45 && deliverable), criticalRisk, deliverable: deliverable && !relatedGaps.some(({ actionType }) => ["HOLD_FOR_REVIEW", "DISABLE_COMPARISON"].includes(actionType)), softRiskPenalty: relatedGaps.some(({ actionType }) => actionType === "DOWNRANK") ? 0.15 : 0 };
      candidates.push(candidate);
      details.set(offer.id, { supplier: { id: offer.supplierOrganizationId, name: offer.supplier.organization.displayName }, warehouse: { id: balance.warehouseId, name: balance.warehouse.name, cityId: balance.warehouse.cityId, verified: verifiedWarehouse }, currency: decision.currency, priceSource: decision.source, quantityAvailable: balance.quantityAvailable.toString(), promotion: promotion ? { id: promotion.id, name: promotion.name, discountMinor, isSponsored: promotion.isSponsored, label: promotion.sponsorshipLabel ?? "Продвижение" } : null, productGaps: relatedGaps.map(({ type, actionType, explanation, remediation }) => ({ type, actionType, explanation, remediation })), destinationVerified: address.geoStatus === "VERIFIED" });
    }
    const ranked = rankRecommendations(candidates, input.mode);
    const enrich = <T extends { offerId: string; distanceKm: number | null }>(item: T) => ({ ...item, ...details.get(item.offerId), distanceKm: item.distanceKm == null ? null : Number(item.distanceKm.toFixed(1)) });
    const result = { mode: input.mode, product: { id: product.id, name: product.canonicalName }, destination: { addressId: address.id, cityId: address.cityId, city: address.city.nameRu, verified: address.geoStatus === "VERIFIED" }, organicBestOfferId: ranked.organicBestOfferId, scenarios: ranked.organic.map(enrich), promoted: ranked.sponsored.map(enrich), fairness: { organicOrderPreserved: true, promotionCannotOverrideCriticalRisk: true, unverifiedWarehouseHasNoLocalPriority: true, fullOrganicResultVisible: true }, formulaVersion: "recommend-v1" };
    await this.prisma.$transaction([
      this.prisma.recommendationDecision.create({ data: { buyerOrganizationId: input.buyerOrganizationId, requestedById: context.actorId, productId: input.productId, destinationAddressId: input.destinationAddressId, mode: input.mode, input: input as unknown as Prisma.InputJsonValue, result: result as unknown as Prisma.InputJsonValue, idempotencyKey: input.idempotencyKey } }),
      this.prisma.auditLog.create({ data: { ...context, organizationId: input.buyerOrganizationId, action: "recommendation.generated", entityType: "Product", entityId: input.productId, after: { mode: input.mode, destinationAddressId: input.destinationAddressId, candidates: candidates.length, organicBestOfferId: ranked.organicBestOfferId, formulaVersion: "recommend-v1" } } }),
    ]);
    return result;
  }
}
