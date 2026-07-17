import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateContractPriceInput, CreateOfferPriceTierInput, ResolveOfferPriceInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SupplierAccessService, type SupplierActorContext } from "../suppliers/supplier-access.service";
import { numericRangesOverlap, resolvePriceRules } from "./price-resolver";

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService, private readonly access: SupplierAccessService) {}

  private async requireOffer(supplierOrganizationId: string, offerId: string) {
    const offer = await this.prisma.supplierOffer.findFirst({ where: { id: offerId, supplierOrganizationId } });
    if (!offer) throw new NotFoundException("Supplier offer not found");
    return offer;
  }

  async tiers(supplierOrganizationId: string, offerId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.requireOffer(supplierOrganizationId, offerId);
    return this.prisma.offerPriceTier.findMany({ where: { offerId }, orderBy: { minimumQuantity: "asc" } });
  }

  async createTier(supplierOrganizationId: string, offerId: string, input: CreateOfferPriceTierInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.requireOffer(supplierOrganizationId, offerId);
    const existing = await this.prisma.offerPriceTier.findMany({ where: { offerId, currency: input.currency } });
    if (existing.some((tier) => numericRangesOverlap(input, { minimumQuantity: Number(tier.minimumQuantity), maximumQuantity: tier.maximumQuantity == null ? null : Number(tier.maximumQuantity) }))) throw new ConflictException("Price tier quantity range overlaps an existing tier");
    return this.prisma.$transaction(async (tx) => {
      const tier = await tx.offerPriceTier.create({ data: { offerId, minimumQuantity: input.minimumQuantity, maximumQuantity: input.maximumQuantity ?? null, unitPriceMinor: input.unitPriceMinor, currency: input.currency, validFrom: input.validFrom ? new Date(input.validFrom) : new Date(), validTo: input.validTo ? new Date(input.validTo) : null } });
      await tx.auditLog.create({ data: { ...context, action: "pricing.tier.created", entityType: "SupplierOffer", entityId: offerId, after: tier } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierOffer", aggregateId: offerId, eventType: "OfferPriceTierCreated", payload: { supplierOrganizationId, offerId, tierId: tier.id } } });
      return tier;
    });
  }

  async contracts(supplierOrganizationId: string, offerId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.requireOffer(supplierOrganizationId, offerId);
    return this.prisma.contractPrice.findMany({ where: { offerId }, include: { buyer: true }, orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }] });
  }

  async createContract(supplierOrganizationId: string, offerId: string, input: CreateContractPriceInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const [offer, buyer] = await Promise.all([this.requireOffer(supplierOrganizationId, offerId), this.prisma.organization.findUnique({ where: { id: input.buyerOrganizationId }, include: { capabilities: true } })]);
    if (!buyer) throw new NotFoundException("Buyer organization not found");
    if (!buyer.capabilities.some(({ capability }) => capability === "BUYER")) throw new BadRequestException("Contract organization must have BUYER capability");
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.contractPrice.updateMany({ where: { supplierOrganizationId, buyerOrganizationId: input.buyerOrganizationId, offerId, status: "ACTIVE" }, data: { status: "INACTIVE" } });
        const contract = await tx.contractPrice.create({ data: { supplierOrganizationId, buyerOrganizationId: input.buyerOrganizationId, offerId, productVariantId: offer.productVariantId, contractReference: input.contractReference ?? null, amountMinor: input.amountMinor, currency: input.currency, minimumQuantity: input.minimumQuantity, validFrom: input.validFrom ? new Date(input.validFrom) : new Date(), validTo: input.validTo ? new Date(input.validTo) : null, priority: input.priority } });
        await tx.auditLog.create({ data: { ...context, action: "pricing.contract.created", entityType: "ContractPrice", entityId: contract.id, after: contract } });
        await tx.outboxEvent.create({ data: { aggregateType: "ContractPrice", aggregateId: contract.id, eventType: "ContractPriceCreated", payload: { supplierOrganizationId, buyerOrganizationId: input.buyerOrganizationId, offerId, contractPriceId: contract.id } } });
        return contract;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Contract price changed concurrently; retry");
      throw error;
    }
  }

  async resolve(supplierOrganizationId: string, offerId: string, input: ResolveOfferPriceInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.requireOffer(supplierOrganizationId, offerId);
    const at = input.at ? new Date(input.at) : new Date();
    const [contracts, tiers, base] = await Promise.all([
      input.buyerOrganizationId ? this.prisma.contractPrice.findMany({ where: { offerId, buyerOrganizationId: input.buyerOrganizationId, status: "ACTIVE", minimumQuantity: { lte: input.quantity }, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] } }) : Promise.resolve([]),
      this.prisma.offerPriceTier.findMany({ where: { offerId, minimumQuantity: { lte: input.quantity }, validFrom: { lte: at }, OR: [{ maximumQuantity: null }, { maximumQuantity: { gte: input.quantity } }], AND: [{ OR: [{ validTo: null }, { validTo: { gte: at } }] }] } }),
      this.prisma.offerPrice.findFirst({ where: { offerId, status: "ACTIVE", validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] }, orderBy: { validFrom: "desc" } }),
    ]);
    return resolvePriceRules({
      quantity: input.quantity,
      at,
      contracts: contracts.map((rule) => ({ id: rule.id, amountMinor: rule.amountMinor.toString(), currency: rule.currency, minimumQuantity: rule.minimumQuantity.toString(), validFrom: rule.validFrom, validTo: rule.validTo, priority: rule.priority })),
      tiers: tiers.map((rule) => ({ id: rule.id, amountMinor: rule.unitPriceMinor.toString(), currency: rule.currency, minimumQuantity: rule.minimumQuantity.toString(), maximumQuantity: rule.maximumQuantity?.toString(), validFrom: rule.validFrom, validTo: rule.validTo })),
      base: base ? { id: base.id, amountMinor: base.amountMinor.toString(), currency: base.currency, validFrom: base.validFrom, validTo: base.validTo } : null,
    });
  }
}
