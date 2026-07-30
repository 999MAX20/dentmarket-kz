import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { AssignOfferPackagingInput, CreateSupplierOfferInput, SetOfferPriceInput, SetOfferPublicationInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SupplierAccessService, type SupplierActorContext } from "../suppliers/supplier-access.service";
import { ComplianceService } from "../compliance/compliance.service";
import { MarketplaceAgreementsService } from "../agreements/marketplace-agreements.service";

@Injectable()
export class OffersService {
  constructor(private readonly prisma: PrismaService, private readonly access: SupplierAccessService, private readonly compliance: ComplianceService, private readonly agreements: MarketplaceAgreementsService) {}

  async list(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    return this.prisma.supplierOffer.findMany({
      where: { supplierOrganizationId },
      include: {
        productVariant: { include: { product: true } },
        saleUnit: true,
        packaging: { include: { unit: true, parentPackaging: true } },
        publication: true,
        prices: { orderBy: { createdAt: "desc" } },
        priceHistory: { orderBy: { createdAt: "desc" }, take: 10 },
        inventoryBalances: { include: { warehouse: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(supplierOrganizationId: string, input: CreateSupplierOfferInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    const [variant, source, packaging, existing] = await Promise.all([
      this.prisma.productVariant.findUnique({ where: { id: input.productVariantId } }),
      input.sourceId ? this.prisma.supplierDataSource.findFirst({ where: { id: input.sourceId, supplierOrganizationId } }) : Promise.resolve(null),
      input.packagingId ? this.prisma.productPackaging.findFirst({ where: { id: input.packagingId, productVariantId: input.productVariantId, status: "ACTIVE" } }) : Promise.resolve(null),
      this.prisma.supplierOffer.findFirst({ where: { supplierOrganizationId, productVariantId: input.productVariantId, saleUnitId: input.saleUnitId ?? null } }),
    ]);
    if (!variant) throw new NotFoundException("Product variant not found");
    if (input.sourceId && !source) throw new NotFoundException("Supplier data source not found");
    if (input.packagingId && !packaging) throw new NotFoundException("Active packaging for the product variant not found");
    if (packaging && !new Prisma.Decimal(input.baseUnitsPerSaleUnit).equals(packaging.quantityInBaseUnit)) throw new BadRequestException("Offer base-unit coefficient must equal the selected packaging coefficient");
    if (existing) throw new ConflictException("Supplier offer already exists for this variant and sale unit");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const offer = await tx.supplierOffer.create({
        data: {
          supplierOrganizationId,
          productVariantId: input.productVariantId,
          saleUnitId: input.saleUnitId ?? variant.saleUnitId,
          sourceId: input.sourceId ?? null,
          packagingId: input.packagingId ?? null,
          supplierSku: input.supplierSku ?? null,
          baseUnitsPerSaleUnit: input.baseUnitsPerSaleUnit,
          minimumOrderQuantity: input.minimumOrderQuantity,
          orderIncrement: input.orderIncrement,
          confirmationMode: input.confirmationMode,
          sourceType: input.sourceType,
          externalId: input.externalId ?? null,
          publication: { create: {} },
        },
        include: { publication: true, productVariant: { include: { product: true } } },
      });
        await tx.auditLog.create({ data: { ...context, action: "offer.created", entityType: "SupplierOffer", entityId: offer.id, after: offer } });
        await tx.outboxEvent.create({ data: { aggregateType: "SupplierOffer", aggregateId: offer.id, eventType: "SupplierOfferCreated", payload: { supplierOrganizationId, offerId: offer.id, productVariantId: input.productVariantId } } });
        return offer;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Supplier offer already exists for this variant and sale unit");
      throw error;
    }
  }

  private async requireOffer(supplierOrganizationId: string, offerId: string) {
    const offer = await this.prisma.supplierOffer.findFirst({ where: { id: offerId, supplierOrganizationId }, include: { publication: true, productVariant: { include: { product: { include: { industries: true } } } } } });
    if (!offer) throw new NotFoundException("Supplier offer not found");
    return offer;
  }

  async setPrice(supplierOrganizationId: string, offerId: string, input: SetOfferPriceInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const offer = await this.requireOffer(supplierOrganizationId, offerId);
    const now = new Date();
    const policy = await this.prisma.freshnessPolicy.findFirst({ where: { scopeKey: { in: [supplierOrganizationId, "global"] }, source: input.source, dataType: "PRICE", status: "ACTIVE" }, orderBy: [{ priority: "asc" }, { supplierOrganizationId: { sort: "desc", nulls: "last" } }] });
    const defaultMinutes = input.source === "API" || input.source === "ERP" ? 15 : input.source === "IMPORT" ? 24 * 60 : 48 * 60;
    const freshnessExpiresAt = new Date(now.getTime() + (policy?.staleAfterMinutes ?? defaultMinutes) * 60_000);
    try {
      return await this.prisma.$transaction(async (tx) => {
      await tx.offerPrice.updateMany({ where: { offerId, status: "ACTIVE" }, data: { status: "INACTIVE", validTo: now } });
      const price = await tx.offerPrice.create({ data: { offerId, amountMinor: input.amountMinor, currency: input.currency, includesVat: input.includesVat, vatRate: input.vatRate ?? null, source: input.source, validFrom: now, lastConfirmedAt: now, freshnessExpiresAt } });
      await tx.offerPriceHistory.create({ data: { offerId, amountMinor: input.amountMinor, currency: input.currency, includesVat: input.includesVat, vatRate: input.vatRate ?? null, source: input.source, changedById: context.actorId, reason: input.reason ?? null } });
      const updatedOffer = await tx.supplierOffer.update({ where: { id: offerId }, data: { status: "ACTIVE", version: { increment: 1 } } });
      const majorAmount = new Prisma.Decimal(input.amountMinor).div(100);
      await tx.productSearchDocument.updateMany({ where: { productId: (await tx.productVariant.findUniqueOrThrow({ where: { id: offer.productVariantId } })).productId }, data: { minPrice: majorAmount, maxPrice: majorAmount, projectionVersion: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "offer.price.changed", entityType: "SupplierOffer", entityId: offerId, before: offer, after: { offer: updatedOffer, price } } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierOffer", aggregateId: offerId, eventType: "OfferPriceChanged", payload: { supplierOrganizationId, offerId, amountMinor: input.amountMinor, currency: input.currency } } });
        return { offer: updatedOffer, price };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Offer price changed concurrently; retry with current data");
      throw error;
    }
  }

  async assignPackaging(supplierOrganizationId: string, offerId: string, input: AssignOfferPackagingInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const offer = await this.requireOffer(supplierOrganizationId, offerId);
    const packaging = await this.prisma.productPackaging.findFirst({ where: { id: input.packagingId, productVariantId: offer.productVariantId, status: "ACTIVE" }, include: { unit: true } });
    if (!packaging) throw new BadRequestException("Packaging does not belong to the offer variant");
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.supplierOffer.updateMany({ where: { id: offerId, version: input.version }, data: { packagingId: packaging.id, saleUnitId: packaging.unitId, baseUnitsPerSaleUnit: packaging.quantityInBaseUnit, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Offer was changed by another request");
      const updated = await tx.supplierOffer.findUniqueOrThrow({ where: { id: offerId }, include: { packaging: { include: { unit: true } } } });
      await tx.auditLog.create({ data: { ...context, action: "offer.packaging.assigned", entityType: "SupplierOffer", entityId: offerId, before: { packagingId: offer.packagingId, baseUnitsPerSaleUnit: offer.baseUnitsPerSaleUnit }, after: { packagingId: packaging.id, baseUnitsPerSaleUnit: packaging.quantityInBaseUnit } } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierOffer", aggregateId: offerId, eventType: "OfferPackagingChanged", payload: { supplierOrganizationId, offerId, packagingId: packaging.id, baseUnitsPerSaleUnit: packaging.quantityInBaseUnit.toString() } } });
      return updated;
    });
  }

  async setPublication(supplierOrganizationId: string, offerId: string, input: SetOfferPublicationInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const offer = await this.requireOffer(supplierOrganizationId, offerId);
    if (input.status === "PUBLISHED" || input.marketplaceVisible) {
      await this.agreements.assertActive(supplierOrganizationId);
    }
    if (input.status === "PUBLISHED") {
      if (offer.productVariant.product.status !== "ACTIVE") throw new BadRequestException("Only confirmed ACTIVE product cards can be published");
      const [supplier, dentistry] = await Promise.all([
        this.prisma.organization.findUnique({ where: { id: supplierOrganizationId }, select: { primaryIndustryId: true } }),
        this.prisma.industry.findUnique({ where: { code: "dentistry-kz" }, select: { id: true } }),
      ]);
      const supplierIndustryId = supplier?.primaryIndustryId ?? dentistry?.id;
      if (!supplierIndustryId || !offer.productVariant.product.industries.some((industry) => industry.industryId === supplierIndustryId)) {
        throw new BadRequestException("Offer product is outside the supplier industry scope");
      }
      const [activePrice, availableBalance] = await Promise.all([
        this.prisma.offerPrice.count({ where: { offerId, status: "ACTIVE" } }),
        this.prisma.inventoryBalance.count({ where: { offerId, quantityAvailable: { gt: 0 }, freshnessStatus: "FRESH" } }),
      ]);
      if (activePrice === 0 || availableBalance === 0) throw new BadRequestException("Published offer requires an active price and fresh available inventory");
      await this.compliance.assertOfferPublishable(supplierOrganizationId, offerId, context);
    }
    return this.prisma.$transaction(async (tx) => {
      const publication = await tx.offerPublication.upsert({
        where: { offerId },
        update: { status: input.status, marketplaceVisible: input.marketplaceVisible, blockedReason: input.blockedReason ?? null, publishedAt: input.status === "PUBLISHED" ? new Date() : undefined },
        create: { offerId, status: input.status, marketplaceVisible: input.marketplaceVisible, blockedReason: input.blockedReason ?? null, publishedAt: input.status === "PUBLISHED" ? new Date() : undefined },
      });
      await tx.auditLog.create({ data: { ...context, action: "offer.publication.changed", entityType: "SupplierOffer", entityId: offerId, before: offer.publication ?? Prisma.JsonNull, after: publication } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierOffer", aggregateId: offerId, eventType: "OfferPublicationChanged", payload: { supplierOrganizationId, offerId, status: input.status, marketplaceVisible: input.marketplaceVisible } } });
      return publication;
    });
  }
}
