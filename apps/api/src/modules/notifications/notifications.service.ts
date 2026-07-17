import { ConflictException, ForbiddenException, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { CreateNotificationInput, NotificationPreferenceInput, NotificationQueryInput } from "@marketplace/schemas";
import { Prisma, type NotificationStatus } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { NotificationAdapterRegistry } from "./notification-adapter-registry.service";
import { BackgroundQueueService } from "../../platform/jobs/background-queue.service";

@Injectable()
export class NotificationsService implements OnModuleInit {
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly registry: NotificationAdapterRegistry, private readonly backgroundQueue: BackgroundQueueService) {}

  onModuleInit() { this.backgroundQueue.register("notifications.tick", async () => this.tick()); }

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertOrganizationAccess(organizationId: string, context: SupplierActorContext) {
    if (organizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Notifications belong to another organization");
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new NotFoundException("Organization not found");
  }

  async preferences(organizationId: string, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    return this.prisma.notificationPreference.findMany({ where: { organizationId }, orderBy: [{ eventType: "asc" }, { channel: "asc" }] });
  }

  async upsertPreference(organizationId: string, input: NotificationPreferenceInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    const scopeKey = input.userId ?? "organization";
    const preference = await this.prisma.notificationPreference.upsert({
      where: { organizationId_scopeKey_eventType_channel: { organizationId, scopeKey, eventType: input.eventType, channel: input.channel } },
      update: { enabled: input.enabled, destination: input.destination, quietHours: input.quietHours == null ? Prisma.JsonNull : input.quietHours },
      create: { organizationId, userId: input.userId, scopeKey, eventType: input.eventType, channel: input.channel, enabled: input.enabled, destination: input.destination, quietHours: input.quietHours == null ? Prisma.JsonNull : input.quietHours },
    });
    await this.prisma.auditLog.create({ data: { ...context, action: "notification.preference.updated", entityType: "NotificationPreference", entityId: preference.id, after: { eventType: preference.eventType, channel: preference.channel, enabled: preference.enabled } } });
    return preference;
  }

  async create(input: CreateNotificationInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(input.recipientOrganizationId, context);
    const notification = await this.prisma.notification.upsert({ where: { idempotencyKey: input.idempotencyKey }, update: {}, create: {
      ...input,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : new Date(),
      payload: input.payload == null ? Prisma.JsonNull : input.payload as Prisma.InputJsonValue,
    } });
    return notification;
  }

  async list(organizationId: string, input: NotificationQueryInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    return this.prisma.notification.findMany({ where: { recipientOrganizationId: organizationId, status: input.status, ...(input.unreadOnly ? { readAt: null } : {}) }, include: { deliveryAttempts: { orderBy: { attempt: "desc" }, take: 3 } }, orderBy: { createdAt: "desc" }, take: input.limit });
  }

  async markRead(notificationId: string, context: SupplierActorContext) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException("Notification not found");
    await this.assertOrganizationAccess(notification.recipientOrganizationId, context);
    return this.prisma.notification.update({ where: { id: notificationId }, data: { readAt: notification.readAt ?? new Date() } });
  }

  async retry(notificationId: string, context: SupplierActorContext) {
    const notification = await this.prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException("Notification not found");
    await this.assertOrganizationAccess(notification.recipientOrganizationId, context);
    if (!(["FAILED", "DEAD"] as NotificationStatus[]).includes(notification.status)) throw new ConflictException("Only failed notifications can be retried");
    return this.prisma.notification.update({ where: { id: notificationId }, data: { status: "PENDING", scheduledAt: new Date(), lastError: null, ...(notification.status === "DEAD" ? { attempts: 0 } : {}) } });
  }

  capabilities() { return this.registry.capabilities(); }

  @Cron("*/5 * * * * *")
  async scheduledTick() {
    const slot = Math.floor(Date.now() / 5_000);
    if (!(await this.backgroundQueue.enqueue("notifications.tick", {}, { jobId: `notifications-${slot}` }))) await this.tick();
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.projectOutboxEvents();
      await this.processPending();
    } finally {
      this.running = false;
    }
  }

  async projectOutboxEvents() {
    const events = await this.prisma.outboxEvent.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000) } }, orderBy: { createdAt: "desc" }, take: 500 });
    let created = 0;
    for (const event of events) {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {};
      const organizationIds = [...new Set(Object.entries(payload).filter(([key, value]) => /OrganizationId$/.test(key) && typeof value === "string").map(([, value]) => value as string))];
      for (const organizationId of organizationIds) {
        if (!(await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) continue;
        const preferences = await this.prisma.notificationPreference.findMany({ where: { organizationId, eventType: { in: [event.eventType, "*"] }, enabled: true } });
        const channels = preferences.length > 0 ? preferences : [{ userId: null, channel: "IN_APP" as const, destination: null }];
        for (const preference of channels) {
          const result = await this.prisma.notification.upsert({ where: { idempotencyKey: `outbox:${event.id}:${organizationId}:${preference.userId ?? "org"}:${preference.channel}` }, update: {}, create: {
            recipientOrganizationId: organizationId,
            recipientUserId: preference.userId,
            eventType: event.eventType,
            channel: preference.channel,
            priority: this.priorityFor(event.eventType),
            subject: this.subjectFor(event.eventType),
            body: this.bodyFor(event.eventType, payload),
            destination: preference.destination,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            idempotencyKey: `outbox:${event.id}:${organizationId}:${preference.userId ?? "org"}:${preference.channel}`,
            payload: payload as Prisma.InputJsonValue,
          }, select: { createdAt: true, updatedAt: true } });
          if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
        }
      }
    }
    return { scanned: events.length, created };
  }

  async processPending() {
    const notifications = await this.prisma.notification.findMany({ where: { status: { in: ["PENDING", "FAILED"] }, scheduledAt: { lte: new Date() }, attempts: { lt: 5 } }, orderBy: [{ priority: "desc" }, { scheduledAt: "asc" }], take: 50 });
    let sent = 0;
    let failed = 0;
    for (const notification of notifications) {
      const claimed = await this.prisma.notification.updateMany({ where: { id: notification.id, status: notification.status, attempts: notification.attempts }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
      if (claimed.count !== 1) continue;
      const attempt = notification.attempts + 1;
      const adapter = this.registry.resolve(notification.channel);
      try {
        const result = await adapter.send({ id: notification.id, channel: notification.channel, destination: notification.destination, subject: notification.subject, body: notification.body, payload: notification.payload });
        await this.prisma.$transaction([
          this.prisma.notification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } }),
          this.prisma.notificationDeliveryAttempt.create({ data: { notificationId: notification.id, attempt, status: "SENT", provider: result.provider, externalMessageId: result.externalMessageId, requestPayload: { channel: notification.channel, destination: notification.destination }, responsePayload: result.response } }),
        ]);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Notification delivery failed";
        const final = attempt >= notification.maxAttempts;
        await this.prisma.$transaction([
          this.prisma.notification.update({ where: { id: notification.id }, data: { status: final ? "DEAD" : "FAILED", lastError: message.slice(0, 4_000), scheduledAt: new Date(Date.now() + Math.min(60 * 60_000, 5_000 * 2 ** attempt)) } }),
          this.prisma.notificationDeliveryAttempt.create({ data: { notificationId: notification.id, attempt, status: final ? "DEAD" : "FAILED", provider: notification.channel.toLowerCase(), requestPayload: { channel: notification.channel, destination: notification.destination }, error: message.slice(0, 4_000) } }),
        ]);
        failed += 1;
      }
    }
    return { processed: notifications.length, sent, failed };
  }

  private priorityFor(eventType: string): "LOW" | "NORMAL" | "HIGH" | "CRITICAL" {
    if (/Blocked|Recall|Expired|Failed|Dead/i.test(eventType)) return /Recall|Blocked/i.test(eventType) ? "CRITICAL" : "HIGH";
    if (/Payment|Shipment|Document/i.test(eventType)) return "HIGH";
    return "NORMAL";
  }

  private subjectFor(eventType: string) {
    const subjects: Record<string, string> = { ComplianceBlocked: "Продажа заблокирована compliance-проверкой", ComplianceReviewRequired: "Требуется ручная compliance-проверка", DocumentSigned: "Документ подписан", ShipmentStatusChanged: "Статус доставки изменён", OrganizationCredentialExpired: "Срок действия документа истёк", RefundCompleted: "Возврат выполнен" };
    return subjects[eventType] ?? `Событие Marketplace: ${eventType}`;
  }

  private bodyFor(eventType: string, payload: Record<string, unknown>) {
    const status = typeof payload.status === "string" ? ` Статус: ${payload.status}.` : "";
    const reasons = Array.isArray(payload.reasons) ? ` Причины: ${payload.reasons.join("; ")}.` : "";
    return `${this.subjectFor(eventType)}.${status}${reasons}`.trim();
  }
}
