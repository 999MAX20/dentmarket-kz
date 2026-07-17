import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddCartItemInput, CheckoutCartInput, ConfirmSupplierOrderInput, CreateCartInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { ExternalReservationsService } from "../integrations/external-reservations.service";
import { ComplianceService } from "../compliance/compliance.service";
import { resolvePriceRules } from "../pricing/price-resolver";
import { SupplierAccessService, type SupplierActorContext } from "../suppliers/supplier-access.service";
import { calculateLineTotal, quantityMatchesOffer, resolveSupplierOrderState } from "./commerce-rules";
import { MarketplaceAgreementsService } from "../agreements/marketplace-agreements.service";

@Injectable()
export class CommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly externalReservations: ExternalReservationsService,
    private readonly supplierAccess: SupplierAccessService,
    private readonly compliance: ComplianceService,
    private readonly agreements: MarketplaceAgreementsService,
  ) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({
      where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } },
    }));
  }

  private async assertBuyerAccess(buyerOrganizationId: string, context: SupplierActorContext) {
    if (buyerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Buyer data belongs to another organization");
    const buyer = await this.prisma.organization.findUnique({ where: { id: buyerOrganizationId }, include: { capabilities: true } });
    if (!buyer) throw new NotFoundException("Buyer organization not found");
    if (!buyer.capabilities.some(({ capability }) => capability === "BUYER")) throw new BadRequestException("Organization does not have BUYER capability");
    return buyer;
  }

  private async resolveOffer(buyerOrganizationId: string, offerId: string, quantity: number, context: SupplierActorContext, expectedCurrency?: string) {
    const at = new Date();
    const offer = await this.prisma.supplierOffer.findFirst({
      where: { id: offerId, status: "ACTIVE", publication: { is: { status: { in: ["PUBLISHED", "RESTRICTED"] }, marketplaceVisible: true } } },
      include: {
        publication: true,
        supplier: { include: { organization: true } },
        productVariant: { include: { product: true } },
        prices: { where: { status: "ACTIVE", validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }], AND: [{ OR: [{ freshnessExpiresAt: null }, { freshnessExpiresAt: { gte: at } }] }] }, orderBy: { validFrom: "desc" } },
        priceTiers: { where: { minimumQuantity: { lte: quantity }, validFrom: { lte: at }, OR: [{ maximumQuantity: null }, { maximumQuantity: { gte: quantity } }], AND: [{ OR: [{ validTo: null }, { validTo: { gte: at } }] }] } },
        contractPrices: { where: { buyerOrganizationId, status: "ACTIVE", minimumQuantity: { lte: quantity }, validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gte: at } }] } },
        inventoryBalances: {
          where: { freshnessStatus: "FRESH", quantityAvailable: { gte: quantity } },
          include: { warehouse: true, lots: { where: { status: "ACTIVE", OR: [{ expirationDate: null }, { expirationDate: { gt: at } }] }, orderBy: { expirationDate: { sort: "asc", nulls: "last" } } } },
          orderBy: [{ quantityAvailable: "desc" }, { warehouseId: "asc" }],
        },
      },
    });
    if (!offer) throw new NotFoundException("Published marketplace offer not found");
    await this.agreements.assertActive(offer.supplierOrganizationId);
    if (!quantityMatchesOffer(quantity, offer.minimumOrderQuantity.toString(), offer.orderIncrement.toString())) throw new BadRequestException("Quantity does not match offer minimum and increment");
    const allowedBuyerIds = offer.publication?.allowedBuyerIds;
    if (Array.isArray(allowedBuyerIds) && allowedBuyerIds.length > 0 && !allowedBuyerIds.includes(buyerOrganizationId)) throw new ForbiddenException("Offer is not available to this buyer");

    const decision = resolvePriceRules({
      quantity,
      at,
      contracts: offer.contractPrices.map((rule) => ({ id: rule.id, amountMinor: rule.amountMinor.toString(), currency: rule.currency, minimumQuantity: rule.minimumQuantity.toString(), validFrom: rule.validFrom, validTo: rule.validTo, priority: rule.priority })),
      tiers: offer.priceTiers.map((rule) => ({ id: rule.id, amountMinor: rule.unitPriceMinor.toString(), currency: rule.currency, minimumQuantity: rule.minimumQuantity.toString(), maximumQuantity: rule.maximumQuantity?.toString(), validFrom: rule.validFrom, validTo: rule.validTo })),
      base: offer.prices[0] ? { id: offer.prices[0].id, amountMinor: offer.prices[0].amountMinor.toString(), currency: offer.prices[0].currency, validFrom: offer.prices[0].validFrom, validTo: offer.prices[0].validTo } : null,
    });
    if (decision.source === "UNAVAILABLE" || !decision.amountMinor || !decision.currency) throw new ConflictException("No active price applies to the requested quantity");
    if (expectedCurrency && decision.currency !== expectedCurrency) throw new ConflictException("Offer currency differs from cart currency");
    const balance = offer.inventoryBalances[0];
    if (!balance) throw new ConflictException("No fresh warehouse balance can fulfill this quantity");
    const lot = balance.lots.find(({ quantityAvailable }) => Number(quantityAvailable) >= quantity) ?? null;
    if (balance.lots.length > 0 && !lot) throw new ConflictException("No single active FEFO lot can fulfill this quantity");
    await this.compliance.assertOfferAllowed(buyerOrganizationId, offer.id, balance.warehouseId, lot?.id ?? null, context);
    const total = calculateLineTotal(decision.amountMinor, quantity);
    const pricingSnapshot = {
      resolvedAt: at.toISOString(),
      offerVersion: offer.version,
      source: decision.source,
      ruleId: decision.ruleId,
      unitPriceMinor: decision.amountMinor,
      quantity: String(quantity),
      totalPriceMinor: total.toString(),
      currency: decision.currency,
      minimumOrderQuantity: offer.minimumOrderQuantity.toString(),
      orderIncrement: offer.orderIncrement.toString(),
    };
    return { offer, decision, balance, lot, total, pricingSnapshot };
  }

  async marketplaceOffers(buyerOrganizationId: string, context: SupplierActorContext) {
    await this.assertBuyerAccess(buyerOrganizationId, context);
    const activeSupplierIds = await this.agreements.activeSupplierIds();
    const offers = await this.prisma.supplierOffer.findMany({
      where: { supplierOrganizationId: { in: activeSupplierIds }, supplier: { organization: { status: "ACTIVE", capabilities: { some: { capability: "SUPPLIER" } } } }, status: "ACTIVE", publication: { is: { status: { in: ["PUBLISHED", "RESTRICTED"] }, marketplaceVisible: true } }, inventoryBalances: { some: { freshnessStatus: "FRESH", quantityAvailable: { gt: 0 } } } },
      include: { publication: true, supplier: { include: { organization: true } }, productVariant: { include: { product: true } }, prices: { where: { status: "ACTIVE" }, orderBy: { validFrom: "desc" }, take: 1 }, inventoryBalances: { where: { freshnessStatus: "FRESH", quantityAvailable: { gt: 0 } }, include: { warehouse: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return offers.filter((offer) => !Array.isArray(offer.publication?.allowedBuyerIds) || offer.publication.allowedBuyerIds.length === 0 || offer.publication.allowedBuyerIds.includes(buyerOrganizationId));
  }

  async carts(buyerOrganizationId: string, context: SupplierActorContext) {
    await this.assertBuyerAccess(buyerOrganizationId, context);
    return this.prisma.cart.findMany({ where: { buyerOrganizationId }, include: { items: { include: { offer: { include: { supplier: { include: { organization: true } }, productVariant: { include: { product: true } } } } } }, checkout: true }, orderBy: { createdAt: "desc" } });
  }

  async createCart(buyerOrganizationId: string, input: CreateCartInput, context: SupplierActorContext) {
    await this.assertBuyerAccess(buyerOrganizationId, context);
    const existing = await this.prisma.cart.findFirst({ where: { buyerOrganizationId, status: "ACTIVE" }, include: { items: true } });
    if (existing) {
      if (existing.currency !== input.currency) throw new ConflictException("Active cart already uses another currency");
      return existing;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cart = await tx.cart.create({ data: { buyerOrganizationId, currency: input.currency, createdById: context.actorId } });
        await tx.auditLog.create({ data: { ...context, action: "cart.created", entityType: "Cart", entityId: cart.id, after: cart } });
        return cart;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return this.prisma.cart.findFirstOrThrow({ where: { buyerOrganizationId, status: "ACTIVE" } });
      throw error;
    }
  }

  private async requireCart(cartId: string, context: SupplierActorContext) {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, include: { items: { include: { offer: true } }, checkout: true } });
    if (!cart) throw new NotFoundException("Cart not found");
    await this.assertBuyerAccess(cart.buyerOrganizationId, context);
    return cart;
  }

  async addItem(cartId: string, input: AddCartItemInput, context: SupplierActorContext) {
    const cart = await this.requireCart(cartId, context);
    if (cart.status !== "ACTIVE") throw new ConflictException("Only an active cart can be changed");
    const resolved = await this.resolveOffer(cart.buyerOrganizationId, input.offerId, input.quantity, context, cart.currency);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.cartItem.upsert({
        where: { cartId_offerId: { cartId, offerId: input.offerId } },
        update: { quantity: input.quantity, unitPriceMinor: resolved.decision.amountMinor!, totalPriceMinor: resolved.total, currency: resolved.decision.currency!, priceSource: resolved.decision.source, priceRuleId: resolved.decision.ruleId, pricingSnapshot: resolved.pricingSnapshot },
        create: { cartId, offerId: input.offerId, quantity: input.quantity, unitPriceMinor: resolved.decision.amountMinor!, totalPriceMinor: resolved.total, currency: resolved.decision.currency!, priceSource: resolved.decision.source, priceRuleId: resolved.decision.ruleId, pricingSnapshot: resolved.pricingSnapshot },
      });
      await tx.cart.update({ where: { id: cartId }, data: { version: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "cart.item.priced", entityType: "Cart", entityId: cartId, after: { item, pricingSnapshot: resolved.pricingSnapshot } } });
      return item;
    });
  }

  async reprice(cartId: string, context: SupplierActorContext) {
    const cart = await this.requireCart(cartId, context);
    if (cart.status !== "ACTIVE") throw new ConflictException("Only an active cart can be repriced");
    const resolved = await Promise.all(cart.items.map(async (item) => ({ item, result: await this.resolveOffer(cart.buyerOrganizationId, item.offerId, Number(item.quantity), context, cart.currency) })));
    await this.prisma.$transaction(async (tx) => {
      for (const line of resolved) await tx.cartItem.update({ where: { id: line.item.id }, data: { unitPriceMinor: line.result.decision.amountMinor!, totalPriceMinor: line.result.total, currency: line.result.decision.currency!, priceSource: line.result.decision.source, priceRuleId: line.result.decision.ruleId, pricingSnapshot: line.result.pricingSnapshot } });
      await tx.cart.update({ where: { id: cartId }, data: { version: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "cart.repriced", entityType: "Cart", entityId: cartId, after: { itemCount: resolved.length } } });
    });
    return this.requireCart(cartId, context);
  }

  async checkout(cartId: string, input: CheckoutCartInput, context: SupplierActorContext) {
    const cart = await this.requireCart(cartId, context);
    if (cart.checkout) {
      if (cart.checkout.idempotencyKey !== input.idempotencyKey) throw new ConflictException("Cart was already checked out with another idempotency key");
      return this.getCheckout(cart.checkout.id, context);
    }
    if (cart.status !== "ACTIVE") throw new ConflictException("Cart is not active");
    if (cart.items.length === 0) throw new BadRequestException("Cart is empty");
    const lines = await Promise.all(cart.items.map(async (item) => ({ item, result: await this.resolveOffer(cart.buyerOrganizationId, item.offerId, Number(item.quantity), context, cart.currency) })));
    const total = lines.reduce((sum, line) => sum.plus(line.result.total), new Prisma.Decimal(0));
    const groups = new Map<string, typeof lines>();
    for (const line of lines) groups.set(line.result.offer.supplierOrganizationId, [...(groups.get(line.result.offer.supplierOrganizationId) ?? []), line]);

    let created: { checkoutId: string; reservations: Array<{ supplierOrganizationId: string; balanceId: string; lotId: string | null; quantity: number; itemId: string }> };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const checkout = await tx.checkout.create({ data: {
          cartId,
          buyerOrganizationId: cart.buyerOrganizationId,
          totalAmountMinor: total,
          currency: cart.currency,
          idempotencyKey: input.idempotencyKey,
          pricingSnapshot: lines.map(({ item, result }) => ({ cartItemId: item.id, ...result.pricingSnapshot })),
        } });
        const reservations: Array<{ supplierOrganizationId: string; balanceId: string; lotId: string | null; quantity: number; itemId: string }> = [];
        let sequence = 0;
        for (const [supplierOrganizationId, supplierLines] of groups) {
          sequence += 1;
          const subtotal = supplierLines.reduce((sum, line) => sum.plus(line.result.total), new Prisma.Decimal(0));
          const framework = await tx.buyerSupplierAgreement.findFirst({ where: { supplierOrganizationId, buyerOrganizationId: cart.buyerOrganizationId, status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } }, orderBy: { endsAt: "desc" } });
          const order = await tx.supplierOrder.create({ data: { checkoutId: checkout.id, supplierOrganizationId, buyerOrganizationId: cart.buyerOrganizationId, buyerSupplierAgreementId: framework?.id ?? null, transactionMode: framework ? "FRAMEWORK_AGREEMENT" : "ONE_TIME", orderNumber: `SO-${checkout.id.replaceAll("-", "").slice(0, 12).toUpperCase()}-${String(sequence).padStart(2, "0")}`, subtotalAmountMinor: subtotal, currency: cart.currency } });
          for (const { item, result } of supplierLines) {
            const orderItem = await tx.supplierOrderItem.create({ data: {
              supplierOrderId: order.id,
              cartItemId: item.id,
              offerId: item.offerId,
              productVariantId: result.offer.productVariantId,
              warehouseId: result.balance.warehouseId,
              inventoryLotId: result.lot?.id ?? null,
              quantity: item.quantity,
              unitPriceMinor: result.decision.amountMinor!,
              totalPriceMinor: result.total,
              currency: cart.currency,
              offerSnapshot: { offerId: result.offer.id, offerVersion: result.offer.version, supplierOrganizationId, confirmationMode: result.offer.confirmationMode, pricing: result.pricingSnapshot },
              inventorySnapshot: { balanceId: result.balance.id, balanceVersion: result.balance.version, warehouseId: result.balance.warehouseId, quantityAvailable: result.balance.quantityAvailable.toString(), freshnessStatus: result.balance.freshnessStatus, lotId: result.lot?.id ?? null, lotNumber: result.lot?.lotNumber ?? null },
            } });
            reservations.push({ supplierOrganizationId, balanceId: result.balance.id, lotId: result.lot?.id ?? null, quantity: Number(item.quantity), itemId: orderItem.id });
          }
        }
        await tx.auditLog.create({ data: { ...context, action: "checkout.started", entityType: "Checkout", entityId: checkout.id, after: { totalAmountMinor: total.toString(), supplierCount: groups.size } } });
        return { checkoutId: checkout.id, reservations };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.checkout.findUnique({ where: { cartId } });
        if (raced && raced.idempotencyKey === input.idempotencyKey) return this.getCheckout(raced.id, context);
        if (raced) throw new ConflictException("Cart was checked out concurrently");
      }
      throw error;
    }

    const reservedIds: string[] = [];
    try {
      for (const request of created.reservations) {
        const reservation = await this.inventory.reserveForOrder(request.supplierOrganizationId, request.balanceId, { quantity: request.quantity, idempotencyKey: `checkout:${created.checkoutId}:${request.itemId}`, ttlMinutes: 30, inventoryLotId: request.lotId, referenceType: "SupplierOrderItem", referenceId: request.itemId }, request.itemId, context);
        reservedIds.push(reservation.id);
        await this.externalReservations.ensure(reservation.id);
      }
    } catch (error) {
      await Promise.allSettled(reservedIds.map(async (id) => {
        try { await this.externalReservations.release(id); } finally { await this.inventory.releaseReservation(id, context); }
      }));
      const reason = error instanceof Error ? error.message : "Inventory reservation failed";
      await this.prisma.$transaction([
        this.prisma.supplierOrderItem.updateMany({ where: { supplierOrder: { checkoutId: created.checkoutId } }, data: { status: "CANCELLED" } }),
        this.prisma.supplierOrder.updateMany({ where: { checkoutId: created.checkoutId }, data: { status: "CANCELLED" } }),
        this.prisma.checkout.update({ where: { id: created.checkoutId }, data: { status: "FAILED", failureReason: reason } }),
        this.prisma.cart.update({ where: { id: cartId }, data: { status: "ABANDONED", version: { increment: 1 } } }),
      ]);
      throw new ConflictException(`Checkout failed: ${reason}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.checkout.update({ where: { id: created.checkoutId }, data: { status: "COMPLETED" } });
      await tx.cart.update({ where: { id: cartId }, data: { status: "CHECKED_OUT", version: { increment: 1 } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Checkout", aggregateId: created.checkoutId, eventType: "CheckoutCompleted", payload: { buyerOrganizationId: cart.buyerOrganizationId, cartId, checkoutId: created.checkoutId, supplierOrderCount: groups.size } } });
    });
    return this.getCheckout(created.checkoutId, context);
  }

  async getCheckout(checkoutId: string, context: SupplierActorContext) {
    const checkout = await this.prisma.checkout.findUnique({ where: { id: checkoutId }, include: { cart: { include: { items: true } }, supplierOrders: { include: { supplier: true, buyerSupplierAgreement: true, items: { include: { reservation: { include: { externalReservation: true } }, offer: { include: { productVariant: { include: { product: true } } } } } }, paymentAllocation: true } }, paymentIntent: { include: { provider: true, allocations: { include: { recipient: true } }, attempts: true } } } });
    if (!checkout) throw new NotFoundException("Checkout not found");
    await this.assertBuyerAccess(checkout.buyerOrganizationId, context);
    return checkout;
  }

  async supplierOrders(context: SupplierActorContext, checkoutId?: string) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.supplierOrder.findMany({
      where: { ...(checkoutId ? { checkoutId } : {}), ...(operator ? {} : { OR: [{ supplierOrganizationId: context.organizationId }, { buyerOrganizationId: context.organizationId }] }) },
      include: { supplier: true, buyer: true, buyerSupplierAgreement: true, items: { include: { reservation: { include: { externalReservation: true } }, offer: { include: { productVariant: { include: { product: true } } } } } }, paymentAllocation: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async buyerOrders(buyerOrganizationId: string, context: SupplierActorContext) {
    await this.assertBuyerAccess(buyerOrganizationId, context);
    return this.prisma.supplierOrder.findMany({
      where: { buyerOrganizationId },
      include: { supplier: true, buyer: true, items: { include: { reservation: { include: { externalReservation: true } }, offer: { include: { productVariant: { include: { product: true } } } } } }, paymentAllocation: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async confirmSupplierOrder(orderId: string, input: ConfirmSupplierOrderInput, context: SupplierActorContext) {
    const order = await this.prisma.supplierOrder.findUnique({ where: { id: orderId }, include: { items: { include: { reservation: { include: { externalReservation: true } } } } } });
    if (!order) throw new NotFoundException("Supplier order not found");
    await this.supplierAccess.assertCanManage(order.supplierOrganizationId, context);
    await this.agreements.assertActive(order.supplierOrganizationId);
    const decisions = new Map(input.decisions.map((decision) => [decision.itemId, decision.acceptedQuantity]));
    if (decisions.size !== order.items.length || order.items.some((item) => !decisions.has(item.id))) throw new BadRequestException("A decision is required for every supplier order item");
    const normalized = order.items.map((item) => ({ item, acceptedQuantity: decisions.get(item.id)! }));
    const status = resolveSupplierOrderState(normalized.map(({ item, acceptedQuantity }) => ({ quantity: item.quantity.toString(), acceptedQuantity })));
    if (order.status !== "AWAITING_CONFIRMATION") {
      if (order.status === status && normalized.every(({ item, acceptedQuantity }) => Number(item.acceptedQuantity) === acceptedQuantity)) return order;
      throw new ConflictException("Supplier order was already confirmed with another decision");
    }
    for (const { item, acceptedQuantity } of normalized) {
      if (acceptedQuantity > 0 && item.reservation?.externalReservation && item.reservation.externalReservation.status !== "ACTIVE") throw new ConflictException("External inventory reservation must be active before supplier confirmation");
    }
    for (const { item, acceptedQuantity } of normalized) {
      const releaseQuantity = Number(item.quantity) - acceptedQuantity;
      if (releaseQuantity > 0 && item.reservation) {
        await this.externalReservations.release(item.reservation.id, releaseQuantity);
        await this.inventory.releaseReservation(item.reservation.id, context, releaseQuantity);
      }
    }
    const subtotal = normalized.reduce((sum, { item, acceptedQuantity }) => sum.plus(calculateLineTotal(item.unitPriceMinor.toString(), acceptedQuantity)), new Prisma.Decimal(0));
    await this.prisma.$transaction(async (tx) => {
      for (const { item, acceptedQuantity } of normalized) await tx.supplierOrderItem.update({ where: { id: item.id }, data: { acceptedQuantity, totalPriceMinor: calculateLineTotal(item.unitPriceMinor.toString(), acceptedQuantity), status: acceptedQuantity > 0 ? "CONFIRMED" : "REJECTED" } });
      await tx.supplierOrder.update({ where: { id: order.id }, data: { status, subtotalAmountMinor: subtotal, version: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "supplier_order.confirmed", entityType: "SupplierOrder", entityId: order.id, before: order, after: { status, subtotalAmountMinor: subtotal.toString(), decisions: input.decisions } } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierOrder", aggregateId: order.id, eventType: "SupplierOrderConfirmed", payload: { supplierOrganizationId: order.supplierOrganizationId, buyerOrganizationId: order.buyerOrganizationId, status, subtotalAmountMinor: subtotal.toString() } } });
    });
    return this.prisma.supplierOrder.findUniqueOrThrow({ where: { id: order.id }, include: { items: { include: { reservation: { include: { externalReservation: true } } } } } });
  }
}
