import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateDeliveryRuleInput, CreateDeliveryZoneInput, CreateOfferDeliveryOptionInput, CreateShipmentInput, DeliveryQuoteInput, TransitionFulfillmentStepInput, TransitionShipmentInput, UpdateDeliveryRuleInput } from "@marketplace/schemas";
import { Prisma, type ShipmentStatus } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SupplierAccessService, type SupplierActorContext } from "../suppliers/supplier-access.service";
import { canTransitionFulfillment, canTransitionShipment, orderStatusForShipment } from "./shipment-state";

@Injectable()
export class LogisticsService {
  constructor(private readonly prisma: PrismaService, private readonly supplierAccess: SupplierAccessService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({
      where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } },
    }));
  }

  private async requireOrder(orderId: string, context: SupplierActorContext) {
    const order = await this.prisma.supplierOrder.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { offer: { include: { productVariant: { include: { product: { include: { categories: true } } } } } } } },
        shipments: { include: { items: true, fulfillmentSteps: { orderBy: { sequence: "asc" } } }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) throw new NotFoundException("Supplier order not found");
    if (order.supplierOrganizationId !== context.organizationId && order.buyerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) {
      throw new ForbiddenException("Order belongs to another organization");
    }
    return order;
  }

  async zones(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.supplierAccess.assertCanManage(supplierOrganizationId, context);
    return this.prisma.deliveryZone.findMany({
      where: { supplierOrganizationId },
      include: { cities: { include: { city: { include: { region: true } } } }, rules: { orderBy: { priority: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async createZone(supplierOrganizationId: string, input: CreateDeliveryZoneInput, context: SupplierActorContext) {
    await this.supplierAccess.assertCanManage(supplierOrganizationId, context);
    await this.supplierAccess.requireProfile(supplierOrganizationId);
    const cityIds = [...new Set(input.cityIds)];
    const cityCount = await this.prisma.city.count({ where: { id: { in: cityIds } } });
    if (cityCount !== cityIds.length) throw new BadRequestException("One or more delivery-zone cities do not exist");
    return this.prisma.$transaction(async (tx) => {
      const zone = await tx.deliveryZone.create({
        data: { supplierOrganizationId, name: input.name, cities: { create: cityIds.map((cityId) => ({ cityId })) } },
        include: { cities: { include: { city: true } } },
      });
      await tx.auditLog.create({ data: { ...context, action: "delivery.zone.created", entityType: "DeliveryZone", entityId: zone.id, after: zone } });
      await tx.outboxEvent.create({ data: { aggregateType: "DeliveryZone", aggregateId: zone.id, eventType: "DeliveryZoneCreated", payload: { supplierOrganizationId, deliveryZoneId: zone.id, cityIds } } });
      return zone;
    });
  }

  async offerOptions(supplierOrganizationId: string, offerId: string, context: SupplierActorContext) {
    await this.supplierAccess.assertCanManage(supplierOrganizationId, context);
    await this.requireSupplierOffer(supplierOrganizationId, offerId);
    return this.prisma.offerDeliveryOption.findMany({ where: { offerId }, include: { warehouse: true }, orderBy: [{ method: "asc" }, { createdAt: "asc" }] });
  }

  async createOfferOption(supplierOrganizationId: string, offerId: string, input: CreateOfferDeliveryOptionInput, context: SupplierActorContext) {
    await this.supplierAccess.assertCanManage(supplierOrganizationId, context);
    await this.requireSupplierOffer(supplierOrganizationId, offerId);
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, supplierOrganizationId } });
    if (!warehouse) throw new BadRequestException("Warehouse does not belong to this supplier");
    return this.prisma.$transaction(async (tx) => {
      const option = await tx.offerDeliveryOption.upsert({
        where: { offerId_warehouseId_method: { offerId, warehouseId: input.warehouseId, method: input.method } },
        update: {
          priceType: input.priceType,
          fixedAmountMinor: input.fixedAmountMinor,
          freeFromAmountMinor: input.freeFromAmountMinor,
          currency: input.currency,
          minLeadTimeHours: input.minLeadTimeHours,
          maxLeadTimeHours: input.maxLeadTimeHours,
          pickupInstructions: input.pickupInstructions,
          temperatureControlled: input.temperatureControlled,
          installationRequired: input.installationRequired,
          status: "ACTIVE",
        },
        create: { offerId, ...input },
      });
      await tx.auditLog.create({ data: { ...context, action: "delivery.offer_option.upserted", entityType: "OfferDeliveryOption", entityId: option.id, after: option } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierOffer", aggregateId: offerId, eventType: "OfferDeliveryOptionChanged", payload: { supplierOrganizationId, offerId, deliveryOptionId: option.id } } });
      return option;
    });
  }

  private async requireSupplierOffer(supplierOrganizationId: string, offerId: string) {
    const offer = await this.prisma.supplierOffer.findFirst({ where: { id: offerId, supplierOrganizationId } });
    if (!offer) throw new NotFoundException("Supplier offer not found");
    return offer;
  }

  async rules(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.supplierAccess.assertCanManage(supplierOrganizationId, context);
    return this.prisma.deliveryRule.findMany({ where: { supplierOrganizationId }, include: { warehouse: true, deliveryZone: { include: { cities: { include: { city: true } } } }, category: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  }

  async createRule(supplierOrganizationId: string, input: CreateDeliveryRuleInput, context: SupplierActorContext) {
    await this.supplierAccess.assertCanManage(supplierOrganizationId, context);
    await this.supplierAccess.requireProfile(supplierOrganizationId);
    await this.validateRuleReferences(supplierOrganizationId, input);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.deliveryRule.create({ data: { supplierOrganizationId, ...input, conditions: input.conditions as Prisma.InputJsonValue | undefined } });
      await tx.auditLog.create({ data: { ...context, action: "delivery.rule.created", entityType: "DeliveryRule", entityId: rule.id, after: rule } });
      await tx.outboxEvent.create({ data: { aggregateType: "DeliveryRule", aggregateId: rule.id, eventType: "DeliveryRuleChanged", payload: { supplierOrganizationId, deliveryRuleId: rule.id, version: rule.version } } });
      return rule;
    });
  }

  async updateRule(supplierOrganizationId: string, ruleId: string, input: UpdateDeliveryRuleInput, context: SupplierActorContext) {
    await this.supplierAccess.assertCanManage(supplierOrganizationId, context);
    const current = await this.prisma.deliveryRule.findFirst({ where: { id: ruleId, supplierOrganizationId } });
    if (!current) throw new NotFoundException("Delivery rule not found");
    const { version, conditions, ...changes } = input;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.deliveryRule.updateMany({
        where: { id: ruleId, supplierOrganizationId, version },
        data: { ...changes, conditions: conditions === undefined ? undefined : conditions === null ? Prisma.JsonNull : conditions as Prisma.InputJsonValue, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new ConflictException("Delivery rule was changed by another request");
      const rule = await tx.deliveryRule.findUniqueOrThrow({ where: { id: ruleId } });
      await tx.auditLog.create({ data: { ...context, action: "delivery.rule.updated", entityType: "DeliveryRule", entityId: rule.id, before: current, after: rule } });
      await tx.outboxEvent.create({ data: { aggregateType: "DeliveryRule", aggregateId: rule.id, eventType: "DeliveryRuleChanged", payload: { supplierOrganizationId, deliveryRuleId: rule.id, version: rule.version } } });
      return rule;
    });
  }

  private async validateRuleReferences(supplierOrganizationId: string, input: CreateDeliveryRuleInput) {
    if (input.warehouseId && !(await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, supplierOrganizationId } }))) throw new BadRequestException("Warehouse does not belong to this supplier");
    if (input.deliveryZoneId && !(await this.prisma.deliveryZone.findFirst({ where: { id: input.deliveryZoneId, supplierOrganizationId } }))) throw new BadRequestException("Delivery zone does not belong to this supplier");
    if (input.categoryId && !(await this.prisma.category.findUnique({ where: { id: input.categoryId } }))) throw new BadRequestException("Category does not exist");
  }

  async quote(orderId: string, input: DeliveryQuoteInput, context: SupplierActorContext) {
    const order = await this.requireOrder(orderId, context);
    const rules = await this.prisma.deliveryRule.findMany({
      where: { supplierOrganizationId: order.supplierOrganizationId, status: "ACTIVE" },
      include: { deliveryZone: { include: { cities: true } }, warehouse: true, category: true },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    const warehouseIds = new Set(order.items.map(({ warehouseId }) => warehouseId));
    const categoryIds = new Set(order.items.flatMap(({ offer }) => offer.productVariant.product.categories.map(({ categoryId }) => categoryId)));
    const now = new Date();
    const subtotal = new Prisma.Decimal(order.subtotalAmountMinor);
    const matching = rules.filter((rule) => {
      if (rule.warehouseId && !warehouseIds.has(rule.warehouseId)) return false;
      if (rule.categoryId && !categoryIds.has(rule.categoryId)) return false;
      if (rule.deliveryZoneId && (!input.destinationCityId || !rule.deliveryZone?.cities.some(({ cityId }) => cityId === input.destinationCityId))) return false;
      const conditions = rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions) ? rule.conditions as Record<string, unknown> : {};
      if (typeof conditions.minimumOrderAmountMinor === "number" && subtotal.lt(conditions.minimumOrderAmountMinor)) return false;
      if (typeof conditions.maximumOrderAmountMinor === "number" && subtotal.gt(conditions.maximumOrderAmountMinor)) return false;
      return true;
    });
    return matching.map((rule) => {
      const amount = rule.priceType === "FREE"
        ? new Prisma.Decimal(0)
        : rule.priceType === "FIXED"
          ? rule.fixedAmountMinor
          : rule.priceType === "FREE_FROM_AMOUNT"
            ? (rule.freeFromAmountMinor && subtotal.gte(rule.freeFromAmountMinor) ? new Prisma.Decimal(0) : rule.fixedAmountMinor)
            : null;
      return {
        deliveryRuleId: rule.id,
        name: rule.name,
        method: rule.method,
        priceType: rule.priceType,
        amountMinor: amount?.toString() ?? null,
        currency: rule.currency,
        priceOnRequest: rule.priceType === "PRICE_ON_REQUEST",
        estimatedWindowStart: new Date(now.getTime() + rule.minLeadTimeHours * 3_600_000).toISOString(),
        estimatedWindowEnd: rule.maxLeadTimeHours == null ? null : new Date(now.getTime() + rule.maxLeadTimeHours * 3_600_000).toISOString(),
        priority: rule.priority,
      };
    });
  }

  async shipments(orderId: string, context: SupplierActorContext) {
    const order = await this.requireOrder(orderId, context);
    return order.shipments;
  }

  async createShipment(orderId: string, input: CreateShipmentInput, context: SupplierActorContext) {
    const order = await this.requireOrder(orderId, context);
    if (order.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the supplier or operator can create a shipment");
    if (order.paymentStatus !== "PAID") throw new ConflictException("The supplier order must be paid before shipment planning");
    if (["CANCELLED", "REJECTED", "DELIVERED", "RETURN_DISPUTE"].includes(order.status)) throw new ConflictException("The supplier order cannot be shipped in its current state");
    const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, supplierOrganizationId: order.supplierOrganizationId, status: "ACTIVE" } });
    if (!warehouse) throw new BadRequestException("Active warehouse does not belong to the supplier");
    const orderItems = new Map(order.items.map((item) => [item.id, item]));
    const requested = new Map<string, Prisma.Decimal>();
    for (const line of input.items) requested.set(line.supplierOrderItemId, (requested.get(line.supplierOrderItemId) ?? new Prisma.Decimal(0)).plus(line.quantity));
    for (const [itemId, quantity] of requested) {
      const item = orderItems.get(itemId);
      if (!item || item.warehouseId !== input.warehouseId) throw new BadRequestException("Shipment item does not belong to this order and warehouse");
      const alreadyPlanned = order.shipments
        .filter(({ status }) => !["CANCELLED", "RETURNED"].includes(status))
        .flatMap(({ items }) => items)
        .filter(({ supplierOrderItemId }) => supplierOrderItemId === itemId)
        .reduce((sum, line) => sum.plus(line.quantity), new Prisma.Decimal(0));
      if (alreadyPlanned.plus(quantity).gt(item.acceptedQuantity)) throw new ConflictException("Shipment quantity exceeds the accepted order quantity");
    }
    const number = `SHP-${order.orderNumber}-${Date.now().toString(36).toUpperCase()}`;
    const defaultStep = { type: input.method === "PICKUP" ? "PICKUP" as const : "DELIVERY" as const };
    const steps = input.fulfillmentSteps.length > 0 ? input.fulfillmentSteps : [defaultStep];
    return this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          supplierOrderId: order.id,
          warehouseId: input.warehouseId,
          shipmentNumber: number,
          method: input.method,
          pickup: input.method === "PICKUP",
          recipientName: input.recipientName,
          recipientPhone: input.recipientPhone,
          destinationAddress: input.destinationAddress == null ? Prisma.JsonNull : input.destinationAddress as Prisma.InputJsonValue,
          deliveryWindowStart: input.deliveryWindowStart ? new Date(input.deliveryWindowStart) : null,
          deliveryWindowEnd: input.deliveryWindowEnd ? new Date(input.deliveryWindowEnd) : null,
          trackingNumber: input.trackingNumber,
          carrierName: input.carrierName,
          items: { create: [...requested].map(([supplierOrderItemId, quantity]) => ({ supplierOrderItemId, quantity })) },
          fulfillmentSteps: { create: steps.map((step, index) => ({
            type: step.type,
            sequence: index + 1,
            providerOrganizationId: "providerOrganizationId" in step ? step.providerOrganizationId : null,
            scheduledAt: "scheduledAt" in step && step.scheduledAt ? new Date(step.scheduledAt) : null,
            notes: "notes" in step ? step.notes : null,
          })) },
        },
        include: { items: { include: { supplierOrderItem: true } }, fulfillmentSteps: { orderBy: { sequence: "asc" } }, warehouse: true },
      });
      await tx.auditLog.create({ data: { ...context, action: "shipment.created", entityType: "Shipment", entityId: shipment.id, after: { shipmentNumber: shipment.shipmentNumber, supplierOrderId: order.id, itemCount: shipment.items.length } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Shipment", aggregateId: shipment.id, eventType: "ShipmentCreated", payload: { shipmentId: shipment.id, supplierOrderId: order.id, supplierOrganizationId: order.supplierOrganizationId, buyerOrganizationId: order.buyerOrganizationId } } });
      return shipment;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async transitionShipment(shipmentId: string, input: TransitionShipmentInput, context: SupplierActorContext) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { items: true, supplierOrder: true, fulfillmentSteps: true } });
    if (!shipment) throw new NotFoundException("Shipment not found");
    await this.requireOrder(shipment.supplierOrderId, context);
    if (shipment.supplierOrder.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the supplier or operator can transition a shipment");
    if (!canTransitionShipment(shipment.status, input.status)) throw new ConflictException(`Shipment cannot transition from ${shipment.status} to ${input.status}`);
    const deliveredById = new Map((input.deliveredItems ?? []).map((item) => [item.shipmentItemId, new Prisma.Decimal(item.deliveredQuantity)]));
    for (const [itemId, delivered] of deliveredById) {
      const item = shipment.items.find(({ id }) => id === itemId);
      if (!item) throw new BadRequestException("Delivered item does not belong to this shipment");
      if (delivered.gt(item.quantity)) throw new BadRequestException("Delivered quantity exceeds shipment quantity");
    }
    if (input.status === "PARTIALLY_DELIVERED" && deliveredById.size === 0) throw new BadRequestException("Partial delivery requires delivered item quantities");
    if (input.status === "DELIVERED" && shipment.fulfillmentSteps.some(({ status }) => !["COMPLETED", "CANCELLED"].includes(status))) throw new ConflictException("All fulfillment steps must be completed before delivery closes");
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.shipment.updateMany({
        where: { id: shipmentId, version: input.version, status: shipment.status },
        data: {
          status: input.status,
          trackingNumber: input.trackingNumber,
          carrierName: input.carrierName,
          failureReason: input.failureReason,
          proofOfDelivery: input.proofOfDelivery === undefined ? undefined : input.proofOfDelivery === null ? Prisma.JsonNull : input.proofOfDelivery as Prisma.InputJsonValue,
          dispatchedAt: input.status === "DISPATCHED" ? now : undefined,
          deliveredAt: input.status === "DELIVERED" ? now : undefined,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new ConflictException("Shipment was changed by another request");
      if (input.status === "DELIVERED") {
        for (const item of shipment.items) await tx.shipmentItem.update({ where: { id: item.id }, data: { deliveredQuantity: deliveredById.get(item.id) ?? item.quantity } });
      } else {
        for (const [id, deliveredQuantity] of deliveredById) await tx.shipmentItem.update({ where: { id }, data: { deliveredQuantity } });
      }
      const mappedStatus = orderStatusForShipment(input.status as ShipmentStatus);
      if (mappedStatus) {
        let orderStatus = mappedStatus;
        if (input.status === "DELIVERED") {
          const allShipments = await tx.shipment.findMany({ where: { supplierOrderId: shipment.supplierOrderId, status: { notIn: ["CANCELLED", "RETURNED"] } }, include: { items: true } });
          const allClosed = allShipments.every(({ status }) => status === "DELIVERED");
          orderStatus = allClosed ? "DELIVERED" : "PARTIALLY_FULFILLED";
        }
        await tx.supplierOrder.update({ where: { id: shipment.supplierOrderId }, data: { status: orderStatus, version: { increment: 1 } } });
      }
      const updated = await tx.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { items: { include: { supplierOrderItem: true } }, fulfillmentSteps: { orderBy: { sequence: "asc" } }, warehouse: true } });
      await tx.auditLog.create({ data: { ...context, action: "shipment.status_changed", entityType: "Shipment", entityId: shipment.id, before: { status: shipment.status, version: shipment.version }, after: { status: updated.status, version: updated.version } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Shipment", aggregateId: shipment.id, eventType: "ShipmentStatusChanged", payload: { shipmentId: shipment.id, supplierOrderId: shipment.supplierOrderId, previousStatus: shipment.status, status: updated.status, trackingNumber: updated.trackingNumber } } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async transitionFulfillmentStep(stepId: string, input: TransitionFulfillmentStepInput, context: SupplierActorContext) {
    const step = await this.prisma.fulfillmentStep.findUnique({ where: { id: stepId }, include: { shipment: { include: { supplierOrder: true, fulfillmentSteps: true } } } });
    if (!step) throw new NotFoundException("Fulfillment step not found");
    await this.requireOrder(step.shipment.supplierOrderId, context);
    if (step.shipment.supplierOrder.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the supplier or operator can transition fulfillment");
    if (!canTransitionFulfillment(step.status, input.status)) throw new ConflictException(`Fulfillment step cannot transition from ${step.status} to ${input.status}`);
    if (["IN_PROGRESS", "COMPLETED"].includes(input.status) && step.shipment.fulfillmentSteps.some((candidate) => candidate.sequence < step.sequence && !["COMPLETED", "CANCELLED"].includes(candidate.status))) throw new ConflictException("Previous fulfillment steps must be completed first");
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.fulfillmentStep.update({
        where: { id: stepId },
        data: {
          status: input.status,
          notes: input.notes,
          metadata: input.metadata === undefined ? undefined : input.metadata === null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue,
          scheduledAt: input.status === "SCHEDULED" && !step.scheduledAt ? now : undefined,
          startedAt: input.status === "IN_PROGRESS" ? now : undefined,
          completedAt: input.status === "COMPLETED" ? now : undefined,
        },
      });
      await tx.auditLog.create({ data: { ...context, action: "fulfillment.status_changed", entityType: "FulfillmentStep", entityId: step.id, before: { status: step.status }, after: { status: updated.status } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Shipment", aggregateId: step.shipmentId, eventType: "FulfillmentStepChanged", payload: { shipmentId: step.shipmentId, fulfillmentStepId: step.id, type: step.type, status: updated.status } } });
      return updated;
    });
  }
}
