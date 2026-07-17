import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { IntegrationAdapterRegistry } from "./adapters/adapter-registry.service";
import { asRecord } from "./adapters/integration-adapter";
import { IntegrationJobsService } from "./integration-jobs.service";

@Injectable()
export class ExternalReservationsService {
  constructor(private readonly prisma: PrismaService, private readonly registry: IntegrationAdapterRegistry, private readonly jobs: IntegrationJobsService) {}

  async ensure(inventoryReservationId: string) {
    const reservation = await this.prisma.inventoryReservation.findUnique({
      where: { id: inventoryReservationId },
      include: { inventoryBalance: { include: { offer: true } }, inventoryLot: true, externalReservation: true },
    });
    if (!reservation) throw new NotFoundException("Inventory reservation not found");
    if (reservation.externalReservation?.status === "ACTIVE" || reservation.externalReservation?.status === "PENDING") return reservation.externalReservation;
    const binding = await this.resolveBinding(reservation.supplierOrganizationId, reservation.warehouseId, reservation.inventoryBalance.offerId);
    if (!binding) return null;
    const bindingConfiguration = asRecord(binding.configuration);
    const payload: Record<string, unknown> = {
      inventoryReservationId: reservation.id,
      warehouseId: reservation.warehouseId,
      productVariantId: reservation.productVariantId,
      offerId: reservation.inventoryBalance.offerId,
      externalOfferId: reservation.inventoryBalance.offer?.externalId,
      externalWarehouseId: bindingConfiguration.externalWarehouseId,
      lotId: reservation.inventoryLotId,
      lotNumber: reservation.inventoryLot?.lotNumber,
      quantity: reservation.quantity.toString(),
      expiresAt: reservation.expiresAt.toISOString(),
      referenceType: reservation.referenceType,
      referenceId: reservation.referenceId,
      externalPayload: bindingConfiguration.externalPayload,
    };
    const external = reservation.externalReservation ?? await this.prisma.externalReservation.create({
      data: { inventoryReservationId: reservation.id, connectionId: binding.connectionId, idempotencyKey: `reserve:${reservation.id}`, requestPayload: payload as Prisma.InputJsonValue },
    });
    const jobPayload = { ...payload, externalReservationRecordId: external.id };
    if (binding.connection.provider === "ONE_C") {
      await this.jobs.enqueue(binding.connectionId, { type: "RESERVATION_CREATE", idempotencyKey: `reserve:${reservation.id}`, payload: jobPayload, maxAttempts: 5 }, "OUTBOX");
      return this.prisma.externalReservation.findUniqueOrThrow({ where: { id: external.id } });
    }
    try {
      const { adapter, context } = this.registry.resolve(binding.connection);
      const result = await adapter.createReservation(context, jobPayload);
      return await this.prisma.externalReservation.update({ where: { id: external.id }, data: { status: "ACTIVE", externalReservationId: result.externalId, responsePayload: result.data as Prisma.InputJsonValue, lastAttemptAt: new Date(), lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "External reservation failed";
      await this.recordFailure(external.id, binding.connectionId, reservation.id, message, payload);
      throw new ConflictException(`External reservation failed: ${message}`);
    }
  }

  async release(inventoryReservationId: string, quantity?: number) {
    const reservation = await this.prisma.inventoryReservation.findUnique({ where: { id: inventoryReservationId }, include: { externalReservation: { include: { connection: true } } } });
    if (!reservation) throw new NotFoundException("Inventory reservation not found");
    const external = reservation.externalReservation;
    if (!external || external.status === "RELEASED" || external.status === "FAILED") return external;
    const releaseQuantity = quantity ?? Number(reservation.quantity);
    const remainingQuantity = Number(reservation.quantity) - releaseQuantity;
    const payload = { externalReservationRecordId: external.id, externalReservationId: external.externalReservationId, inventoryReservationId, releaseQuantity, remainingQuantity };
    if (external.status === "PENDING" && !external.externalReservationId) {
      await this.prisma.integrationSyncJob.updateMany({ where: { connectionId: external.connectionId, idempotencyKey: `reserve:${reservation.id}`, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED", completedAt: new Date() } });
      return this.prisma.externalReservation.update({ where: { id: external.id }, data: { status: remainingQuantity <= 0 ? "RELEASED" : "PENDING", requestPayload: { ...asRecord(external.requestPayload), quantity: String(Math.max(0, remainingQuantity)) } } });
    }
    if (external.connection.provider === "ONE_C") {
      await this.jobs.enqueue(external.connectionId, { type: "RESERVATION_RELEASE", idempotencyKey: `release:${reservation.id}:${releaseQuantity}`, payload, maxAttempts: 5 }, "OUTBOX");
      return external;
    }
    try {
      const { adapter, context } = this.registry.resolve(external.connection);
      const result = await adapter.releaseReservation(context, payload);
      return this.prisma.externalReservation.update({ where: { id: external.id }, data: { status: remainingQuantity <= 0 ? "RELEASED" : "ACTIVE", responsePayload: result.data as Prisma.InputJsonValue, lastAttemptAt: new Date(), lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "External reservation release failed";
      await this.recordFailure(external.id, external.connectionId, reservation.id, message, payload, "ACTIVE");
      throw new ConflictException(`External reservation release failed: ${message}`);
    }
  }

  async finalizeAgentJob(jobId: string, result: Record<string, unknown> | null | undefined) {
    const job = await this.prisma.integrationSyncJob.findUnique({ where: { id: jobId } });
    if (!job || (job.type !== "RESERVATION_CREATE" && job.type !== "RESERVATION_RELEASE")) return;
    const payload = asRecord(job.payload);
    const recordId = typeof payload.externalReservationRecordId === "string" ? payload.externalReservationRecordId : undefined;
    if (!recordId) return;
    const data = result ?? {};
    const externalId = typeof data.externalReservationId === "string" ? data.externalReservationId : typeof data.externalId === "string" ? data.externalId : undefined;
    await this.prisma.externalReservation.update({
      where: { id: recordId },
      data: { status: job.type === "RESERVATION_CREATE" ? "ACTIVE" : Number(payload.remainingQuantity ?? 0) > 0 ? "ACTIVE" : "RELEASED", externalReservationId: externalId, responsePayload: data as Prisma.InputJsonValue, lastAttemptAt: new Date(), lastError: null },
    });
  }

  private async resolveBinding(supplierOrganizationId: string, warehouseId: string, offerId: string | null) {
    const bindings = await this.prisma.integrationDataBinding.findMany({
      where: {
        dataType: "RESERVATION",
        status: "ACTIVE",
        connection: { supplierOrganizationId, status: { in: ["PENDING", "ACTIVE", "ERROR"] } },
        OR: [{ warehouseId: null, offerId: null }, { warehouseId }, ...(offerId ? [{ offerId }] : [])],
      },
      include: { connection: true },
    });
    return bindings.sort((left, right) => this.scopeRank(left.offerId, left.warehouseId) - this.scopeRank(right.offerId, right.warehouseId) || left.priority - right.priority)[0] ?? null;
  }

  private scopeRank(offerId: string | null, warehouseId: string | null) { return offerId ? 0 : warehouseId ? 1 : 2; }

  private async recordFailure(externalReservationId: string, connectionId: string, inventoryReservationId: string, message: string, payload: Record<string, unknown>, currentStatus: "FAILED" | "ACTIVE" = "FAILED") {
    await this.prisma.$transaction([
      this.prisma.externalReservation.update({ where: { id: externalReservationId }, data: { status: currentStatus, lastError: message.slice(0, 4_000), lastAttemptAt: new Date() } }),
      this.prisma.integrationReconciliationEntry.create({ data: { connectionId, kind: "RESERVATION", status: "MISMATCH", internalType: "InventoryReservation", internalId: inventoryReservationId, expected: { status: "ACTIVE", request: payload } as Prisma.InputJsonValue, actual: { error: message } } }),
    ]);
  }
}
