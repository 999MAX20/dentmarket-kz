import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { IntegrationJobsService } from "./integration-jobs.service";

@Injectable()
export class IntegrationOutboxService {
  constructor(private readonly prisma: PrismaService, private readonly jobs: IntegrationJobsService) {}

  async dispatchPaymentCaptured() {
    const events = await this.prisma.outboxEvent.findMany({ where: { eventType: "PaymentCaptured", status: { in: ["PENDING", "FAILED"] }, availableAt: { lte: new Date() }, attempts: { lt: 10 } }, orderBy: { createdAt: "asc" }, take: 10 });
    for (const event of events) {
      const claimed = await this.prisma.outboxEvent.updateMany({ where: { id: event.id, status: event.status }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
      if (claimed.count !== 1) continue;
      try {
        const intent = await this.prisma.paymentIntent.findUnique({ where: { id: event.aggregateId }, include: { allocations: { include: { supplierOrder: { include: { items: true } } } } } });
        if (intent) {
          for (const allocation of intent.allocations) {
            const order = allocation.supplierOrder;
            const warehouseIds = order.items.map(({ warehouseId }) => warehouseId);
            const offerIds = order.items.map(({ offerId }) => offerId);
            const bindings = await this.prisma.integrationDataBinding.findMany({
              where: {
                dataType: "ORDER",
                status: "ACTIVE",
                connection: { supplierOrganizationId: order.supplierOrganizationId, status: { in: ["PENDING", "ACTIVE", "ERROR"] } },
                OR: [{ warehouseId: null, offerId: null }, { warehouseId: { in: warehouseIds } }, { offerId: { in: offerIds } }],
              },
              select: { connectionId: true },
              orderBy: { priority: "asc" },
            });
            for (const connectionId of [...new Set(bindings.map(({ connectionId }) => connectionId))]) {
              await this.jobs.enqueue(connectionId, { type: "ORDER_EXPORT", idempotencyKey: `order-export:${order.id}:payment:${intent.id}`, payload: { supplierOrderId: order.id, paymentIntentId: intent.id, paymentCapturedAt: event.createdAt.toISOString() }, maxAttempts: 5 }, "OUTBOX");
            }
          }
        }
        await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { status: "PUBLISHED", publishedAt: new Date(), lastError: null } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Integration outbox dispatch failed";
        await this.prisma.outboxEvent.update({ where: { id: event.id }, data: { status: "FAILED", lastError: message.slice(0, 4_000), availableAt: new Date(Date.now() + Math.min(60 * 60_000, 5_000 * 2 ** event.attempts)) } });
      }
    }
  }
}
