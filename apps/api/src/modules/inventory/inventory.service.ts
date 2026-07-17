import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateInventoryLotInput, CreateInventoryReservationInput, CreateLotRecallInput, ResolveLotRecallInput, SetInventoryBalanceInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SupplierAccessService, type SupplierActorContext } from "../suppliers/supplier-access.service";
import { DataFreshnessService } from "./data-freshness.service";

function availability(quantity: number) {
  if (quantity <= 0) return "OUT_OF_STOCK" as const;
  if (quantity <= 5) return "LOW_STOCK" as const;
  return "IN_STOCK" as const;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly access: SupplierAccessService, private readonly freshness: DataFreshnessService) {}

  async balances(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    return this.prisma.inventoryBalance.findMany({ where: { supplierOrganizationId }, include: { warehouse: true, productVariant: { include: { product: true } }, offer: { include: { publication: true } }, lots: { orderBy: { expirationDate: { sort: "asc", nulls: "last" } } }, reservations: { where: { status: "ACTIVE" } } }, orderBy: { updatedAt: "desc" } });
  }

  async setBalance(supplierOrganizationId: string, input: SetInventoryBalanceInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    const [warehouse, variant, offer, before] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, supplierOrganizationId } }),
      this.prisma.productVariant.findUnique({ where: { id: input.productVariantId } }),
      input.offerId ? this.prisma.supplierOffer.findFirst({ where: { id: input.offerId, supplierOrganizationId, productVariantId: input.productVariantId } }) : Promise.resolve(null),
      this.prisma.inventoryBalance.findUnique({ where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId, warehouseId: input.warehouseId, productVariantId: input.productVariantId } } }),
    ]);
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    if (!variant) throw new NotFoundException("Product variant not found");
    if (input.offerId && !offer) throw new NotFoundException("Supplier offer not found for this variant");
    const effectiveReserved = before ? Number(before.quantityReserved) : input.quantityReserved;
    if (effectiveReserved + input.safetyStock > input.quantityOnHand) throw new ConflictException("On-hand update cannot invalidate existing reservations and safety stock");
    const quantityAvailable = input.quantityOnHand - effectiveReserved - input.safetyStock;
    const now = new Date();
    const freshnessPolicy = await this.freshness.resolvePolicy(supplierOrganizationId, input.source, "INVENTORY");
    const freshnessExpiresAt = new Date(now.getTime() + freshnessPolicy.staleAfterMinutes * 60_000);
    return this.prisma.$transaction(async (tx) => {
      const balance = await tx.inventoryBalance.upsert({
        where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId, warehouseId: input.warehouseId, productVariantId: input.productVariantId } },
        update: { offerId: input.offerId ?? null, quantityOnHand: input.quantityOnHand, safetyStock: input.safetyStock, quantityAvailable, availabilityStatus: availability(quantityAvailable), freshnessStatus: "FRESH", freshnessExpiresAt, source: input.source, externalUpdatedAt: now, lastSuccessfulSyncAt: now, version: { increment: 1 } },
        create: { supplierOrganizationId, warehouseId: input.warehouseId, productVariantId: input.productVariantId, offerId: input.offerId ?? null, quantityOnHand: input.quantityOnHand, quantityReserved: effectiveReserved, safetyStock: input.safetyStock, quantityAvailable, availabilityStatus: availability(quantityAvailable), freshnessStatus: "FRESH", freshnessExpiresAt, source: input.source, externalUpdatedAt: now, lastSuccessfulSyncAt: now },
      });
      await tx.auditLog.create({ data: { ...context, action: "inventory.balance.set", entityType: "InventoryBalance", entityId: balance.id, before: before ?? Prisma.JsonNull, after: balance } });
      await tx.outboxEvent.create({ data: { aggregateType: "InventoryBalance", aggregateId: balance.id, eventType: "InventoryBalanceChanged", payload: { supplierOrganizationId, balanceId: balance.id, quantityAvailable } } });
      return balance;
    });
  }

  async createLot(supplierOrganizationId: string, input: CreateInventoryLotInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const balance = await this.prisma.inventoryBalance.findFirst({ where: { id: input.inventoryBalanceId, supplierOrganizationId } });
    if (!balance) throw new NotFoundException("Inventory balance not found");
    const allocatedLots = await this.prisma.inventoryLot.aggregate({ where: { inventoryBalanceId: balance.id, status: { notIn: ["DEPLETED", "EXPIRED", "RECALLED"] } }, _sum: { quantityOnHand: true } });
    if (Number(allocatedLots._sum.quantityOnHand ?? 0) + input.quantityOnHand > Number(balance.quantityOnHand)) throw new BadRequestException("Total lot quantity cannot exceed warehouse balance");
    const quantityAvailable = input.quantityOnHand - input.quantityReserved;
    return this.prisma.$transaction(async (tx) => {
      const lot = await tx.inventoryLot.create({ data: {
        inventoryBalanceId: balance.id,
        supplierOrganizationId,
        warehouseId: balance.warehouseId,
        productVariantId: balance.productVariantId,
        offerId: input.offerId ?? balance.offerId,
        lotNumber: input.lotNumber,
        series: input.series ?? null,
        serialNumber: input.serialNumber ?? null,
        manufactureDate: input.manufactureDate ? new Date(input.manufactureDate) : null,
        expirationDate: input.expirationDate ? new Date(input.expirationDate) : null,
        registrationCertificate: input.registrationCertificate ?? null,
        importerOrganizationId: input.importerOrganizationId ?? null,
        originSource: input.originSource ?? null,
        quantityOnHand: input.quantityOnHand,
        quantityReserved: input.quantityReserved,
        quantityAvailable,
        status: input.status,
      } });
      await tx.auditLog.create({ data: { ...context, action: "inventory.lot.created", entityType: "InventoryLot", entityId: lot.id, after: lot } });
      await tx.outboxEvent.create({ data: { aggregateType: "InventoryLot", aggregateId: lot.id, eventType: "InventoryLotCreated", payload: { supplierOrganizationId, lotId: lot.id, balanceId: balance.id } } });
      return lot;
    });
  }

  async reserveForOrder(supplierOrganizationId: string, balanceId: string, input: CreateInventoryReservationInput, supplierOrderItemId: string, context: SupplierActorContext) {
    return this.reserve(supplierOrganizationId, balanceId, input, context, supplierOrderItemId);
  }

  async reserve(supplierOrganizationId: string, balanceId: string, input: CreateInventoryReservationInput, context: SupplierActorContext, supplierOrderItemId?: string) {
    if (supplierOrderItemId) {
      const orderItem = await this.prisma.supplierOrderItem.findFirst({ where: { id: supplierOrderItemId, supplierOrder: { supplierOrganizationId } } });
      if (!orderItem) throw new NotFoundException("Supplier order item not found");
    } else {
      await this.access.assertCanManage(supplierOrganizationId, context);
    }
    const existing = await this.prisma.inventoryReservation.findUnique({ where: { supplierOrganizationId_idempotencyKey: { supplierOrganizationId, idempotencyKey: input.idempotencyKey } } });
    if (existing) {
      if (Number(existing.quantity) !== input.quantity || existing.inventoryBalanceId !== balanceId) throw new ConflictException("Idempotency key was already used with another reservation request");
      if (supplierOrderItemId && existing.supplierOrderItemId && existing.supplierOrderItemId !== supplierOrderItemId) throw new ConflictException("Reservation already belongs to another order item");
      if (supplierOrderItemId && !existing.supplierOrderItemId) return this.prisma.inventoryReservation.update({ where: { id: existing.id }, data: { supplierOrderItemId } });
      return existing;
    }
    const balance = await this.prisma.inventoryBalance.findFirst({ where: { id: balanceId, supplierOrganizationId } });
    if (!balance) throw new NotFoundException("Inventory balance not found");
    let lot = input.inventoryLotId ? await this.prisma.inventoryLot.findFirst({ where: { id: input.inventoryLotId, inventoryBalanceId: balanceId, supplierOrganizationId, status: "ACTIVE", OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }] } }) : null;
    if (input.inventoryLotId && !lot) throw new NotFoundException("Active inventory lot not found");
    if (!lot) {
      lot = await this.prisma.inventoryLot.findFirst({
        where: { inventoryBalanceId: balanceId, supplierOrganizationId, status: "ACTIVE", quantityAvailable: { gte: input.quantity }, OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }] },
        orderBy: { expirationDate: { sort: "asc", nulls: "last" } },
      });
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const balanceUpdate = await tx.inventoryBalance.updateMany({
          where: { id: balanceId, supplierOrganizationId, quantityAvailable: { gte: input.quantity } },
          data: { quantityAvailable: { decrement: input.quantity }, quantityReserved: { increment: input.quantity }, version: { increment: 1 } },
        });
        if (balanceUpdate.count === 0) throw new ConflictException("Insufficient available inventory");
        const reservedBalance = await tx.inventoryBalance.findUniqueOrThrow({ where: { id: balanceId } });
        await tx.inventoryBalance.update({ where: { id: balanceId }, data: { availabilityStatus: availability(Number(reservedBalance.quantityAvailable)) } });
        if (lot) {
          const lotUpdate = await tx.inventoryLot.updateMany({ where: { id: lot.id, status: "ACTIVE", quantityAvailable: { gte: input.quantity } }, data: { quantityAvailable: { decrement: input.quantity }, quantityReserved: { increment: input.quantity }, version: { increment: 1 } } });
          if (lotUpdate.count === 0) throw new ConflictException("Selected lot no longer has sufficient inventory");
        }
        const reservation = await tx.inventoryReservation.create({ data: {
          inventoryBalanceId: balanceId,
          inventoryLotId: lot?.id ?? null,
          supplierOrganizationId,
          warehouseId: balance.warehouseId,
          productVariantId: balance.productVariantId,
          quantity: input.quantity,
          expiresAt: new Date(Date.now() + input.ttlMinutes * 60_000),
          idempotencyKey: input.idempotencyKey,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          supplierOrderItemId: supplierOrderItemId ?? null,
        } });
        await tx.auditLog.create({ data: { ...context, action: "inventory.reserved", entityType: "InventoryReservation", entityId: reservation.id, after: reservation } });
        await tx.outboxEvent.create({ data: { aggregateType: "InventoryReservation", aggregateId: reservation.id, eventType: "InventoryReserved", payload: { supplierOrganizationId, reservationId: reservation.id, balanceId, lotId: lot?.id ?? null, quantity: input.quantity } } });
        return reservation;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.inventoryReservation.findUnique({ where: { supplierOrganizationId_idempotencyKey: { supplierOrganizationId, idempotencyKey: input.idempotencyKey } } });
        if (raced) {
          if (Number(raced.quantity) !== input.quantity || raced.inventoryBalanceId !== balanceId) throw new ConflictException("Idempotency key was already used with another reservation request");
          if (supplierOrderItemId && raced.supplierOrderItemId && raced.supplierOrderItemId !== supplierOrderItemId) throw new ConflictException("Reservation already belongs to another order item");
          if (supplierOrderItemId && !raced.supplierOrderItemId) return this.prisma.inventoryReservation.update({ where: { id: raced.id }, data: { supplierOrderItemId } });
          return raced;
        }
      }
      throw error;
    }
  }

  async releaseReservation(reservationId: string, context: SupplierActorContext, quantity?: number) {
    const reservation = await this.prisma.inventoryReservation.findUnique({ where: { id: reservationId }, include: { inventoryLot: true } });
    if (!reservation) throw new NotFoundException("Inventory reservation not found");
    if (reservation.status !== "ACTIVE") return reservation;
    const reservedQuantity = Number(reservation.quantity);
    const releaseQuantity = quantity ?? reservedQuantity;
    if (releaseQuantity <= 0 || releaseQuantity > reservedQuantity) throw new BadRequestException("Release quantity must be positive and cannot exceed the active reservation");

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.inventoryReservation.findUniqueOrThrow({ where: { id: reservationId }, include: { inventoryLot: true } });
      if (current.status !== "ACTIVE") return current;
      const currentQuantity = Number(current.quantity);
      if (releaseQuantity > currentQuantity) throw new ConflictException("Reservation quantity changed concurrently");
      const shouldRestoreAvailability = !current.inventoryLot || current.inventoryLot.status === "ACTIVE";
      const balance = await tx.inventoryBalance.findUniqueOrThrow({ where: { id: current.inventoryBalanceId } });
      const nextAvailable = Number(balance.quantityAvailable) + (shouldRestoreAvailability ? releaseQuantity : 0);
      await tx.inventoryBalance.update({ where: { id: balance.id }, data: {
        quantityReserved: { decrement: releaseQuantity },
        quantityAvailable: nextAvailable,
        availabilityStatus: availability(nextAvailable),
        version: { increment: 1 },
      } });
      if (current.inventoryLotId) {
        await tx.inventoryLot.update({ where: { id: current.inventoryLotId }, data: {
          quantityReserved: { decrement: releaseQuantity },
          ...(shouldRestoreAvailability ? { quantityAvailable: { increment: releaseQuantity } } : {}),
          version: { increment: 1 },
        } });
      }
      const remaining = currentQuantity - releaseQuantity;
      const released = await tx.inventoryReservation.update({ where: { id: reservationId }, data: remaining === 0 ? { status: "RELEASED" } : { quantity: remaining } });
      await tx.auditLog.create({ data: { ...context, action: remaining === 0 ? "inventory.reservation.released" : "inventory.reservation.reduced", entityType: "InventoryReservation", entityId: reservationId, before: current, after: released } });
      await tx.outboxEvent.create({ data: { aggregateType: "InventoryReservation", aggregateId: reservationId, eventType: remaining === 0 ? "InventoryReservationReleased" : "InventoryReservationReduced", payload: { supplierOrganizationId: current.supplierOrganizationId, reservationId, releasedQuantity: releaseQuantity, remainingQuantity: remaining } } });
      return released;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async recalls(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    return this.prisma.lotRecall.findMany({ where: { supplierOrganizationId }, include: { inventoryLot: { include: { productVariant: { include: { product: true } }, warehouse: true } } }, orderBy: [{ status: "asc" }, { startedAt: "desc" }] });
  }

  async recallLot(supplierOrganizationId: string, input: CreateLotRecallInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const lot = await this.prisma.inventoryLot.findFirst({ where: { id: input.inventoryLotId, supplierOrganizationId }, include: { inventoryBalance: true, reservations: { where: { status: "ACTIVE" } } } });
    if (!lot) throw new NotFoundException("Inventory lot not found");
    if (["RECALLED", "EXPIRED", "DEPLETED"].includes(lot.status)) throw new ConflictException("Inventory lot cannot be recalled from its current status");
    const existing = await this.prisma.lotRecall.findFirst({ where: { inventoryLotId: lot.id, status: "ACTIVE" } });
    if (existing) throw new ConflictException("Inventory lot already has an active recall");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const remainingAvailable = Math.max(0, Number(lot.inventoryBalance.quantityAvailable) - Number(lot.quantityAvailable));
        const balance = await tx.inventoryBalance.update({ where: { id: lot.inventoryBalanceId }, data: { quantityAvailable: remainingAvailable, availabilityStatus: availability(remainingAvailable), version: { increment: 1 } } });
        const recalledLot = await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: "RECALLED", quantityAvailable: 0, version: { increment: 1 } } });
        const affectedReservationIds = lot.reservations.map(({ id }) => id);
        const recall = await tx.lotRecall.create({ data: { inventoryLotId: lot.id, supplierOrganizationId, reason: input.reason, source: input.source, severity: input.severity, comment: input.comment ?? null, affectedReservations: affectedReservationIds, createdById: context.actorId } });
        if (lot.offerId && Number(balance.quantityAvailable) <= 0) await tx.offerPublication.updateMany({ where: { offerId: lot.offerId, status: "PUBLISHED" }, data: { status: "PAUSED", marketplaceVisible: false, blockedReason: `Lot recall ${recall.id}` } });
        await tx.auditLog.create({ data: { ...context, action: "inventory.lot.recalled", entityType: "InventoryLot", entityId: lot.id, before: lot, after: { lot: recalledLot, recall, affectedReservationIds } } });
        await tx.outboxEvent.create({ data: { aggregateType: "InventoryLot", aggregateId: lot.id, eventType: "InventoryLotRecalled", payload: { supplierOrganizationId, lotId: lot.id, recallId: recall.id, severity: input.severity, affectedReservationIds } } });
        return { recall, lot: recalledLot, balance, affectedReservationIds };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Inventory lot already has an active recall");
      throw error;
    }
  }

  async resolveRecall(supplierOrganizationId: string, recallId: string, input: ResolveLotRecallInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const recall = await this.prisma.lotRecall.findFirst({ where: { id: recallId, supplierOrganizationId }, include: { inventoryLot: true } });
    if (!recall) throw new NotFoundException("Lot recall not found");
    if (recall.status !== "ACTIVE") throw new ConflictException("Lot recall is already resolved");
    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.lotRecall.update({ where: { id: recallId }, data: { status: "RESOLVED", comment: input.comment, resolvedAt: new Date() } });
      await tx.inventoryLot.update({ where: { id: recall.inventoryLotId }, data: { status: "UNDER_REVIEW", version: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "inventory.lot_recall.resolved", entityType: "LotRecall", entityId: recallId, before: recall, after: resolved } });
      await tx.outboxEvent.create({ data: { aggregateType: "InventoryLot", aggregateId: recall.inventoryLotId, eventType: "InventoryLotRecallResolved", payload: { supplierOrganizationId, lotId: recall.inventoryLotId, recallId } } });
      return resolved;
    });
  }
}
