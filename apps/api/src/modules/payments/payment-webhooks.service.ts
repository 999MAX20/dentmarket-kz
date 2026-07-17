import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

@Injectable()
export class PaymentWebhooksService {
  private running = false;
  constructor(private readonly prisma: PrismaService) {}

  async receive(providerCode: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    const provider = await this.prisma.paymentProvider.findUnique({ where: { code: providerCode.toUpperCase() } });
    if (!provider || provider.status !== "ACTIVE") throw new UnauthorizedException("Unknown payment provider");
    const payload = this.parse(rawBody);
    const signature = this.header(headers, "x-payment-signature");
    const timestamp = this.header(headers, "x-payment-timestamp");
    const secret = process.env[`PAYMENT_WEBHOOK_SECRET_${provider.code}`];
    const verified = secret ? this.verify(rawBody, signature, secret, timestamp) : provider.code === "MOCK" && process.env.NODE_ENV !== "production";
    const externalEventId = this.header(headers, "x-payment-event-id") ?? (typeof payload.id === "string" ? payload.id : createHash("sha256").update(rawBody).digest("hex"));
    const eventType = typeof payload.type === "string" ? payload.type : "unknown";
    const existing = await this.prisma.paymentWebhookEvent.findUnique({ where: { providerId_externalEventId: { providerId: provider.id, externalEventId } } });
    if (existing) return { duplicate: true, eventId: existing.id, status: existing.status };
    const event = await this.prisma.paymentWebhookEvent.create({ data: { providerId: provider.id, externalEventId, eventType, signatureStatus: verified ? "VERIFIED" : "INVALID", status: verified ? "RECEIVED" : "FAILED", payload: payload as Prisma.InputJsonValue, headers: this.safeHeaders(headers) as Prisma.InputJsonValue, lastError: verified ? null : "Invalid webhook signature" } });
    if (!verified) throw new UnauthorizedException("Invalid payment webhook signature");
    await this.process(event.id);
    return { duplicate: false, eventId: event.id, status: "PROCESSED" };
  }

  @Cron("*/10 * * * * *")
  async retryInbox() {
    if (this.running) return;
    this.running = true;
    try {
      const events = await this.prisma.paymentWebhookEvent.findMany({ where: { signatureStatus: "VERIFIED", status: { in: ["RECEIVED", "FAILED"] }, attempt: { lt: 10 } }, orderBy: { createdAt: "asc" }, take: 20 });
      for (const event of events) await this.process(event.id).catch(() => undefined);
    } finally { this.running = false; }
  }

  async process(eventId: string) {
    const event = await this.prisma.paymentWebhookEvent.findUnique({ where: { id: eventId }, include: { provider: true } });
    if (!event || event.status === "PROCESSED") return event;
    const claimed = await this.prisma.paymentWebhookEvent.updateMany({ where: { id: event.id, status: { in: ["RECEIVED", "FAILED"] } }, data: { status: "PROCESSING", attempt: { increment: 1 }, lastError: null } });
    if (claimed.count !== 1) return event;
    try {
      const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload as Record<string, unknown> : {};
      const externalTransactionId = typeof payload.externalTransactionId === "string" ? payload.externalTransactionId : typeof payload.transactionId === "string" ? payload.transactionId : undefined;
      if (externalTransactionId) {
        const transaction = await this.prisma.paymentTransaction.findFirst({ where: { providerId: event.providerId, externalTransactionId } });
        if (transaction) {
          const status = payload.status === "SUCCEEDED" ? "SUCCEEDED" : payload.status === "FAILED" ? "FAILED" : payload.status === "CANCELLED" ? "CANCELLED" : "PROCESSING";
          await this.prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status, responsePayload: payload as Prisma.InputJsonValue, processedAt: status === "SUCCEEDED" ? new Date() : transaction.processedAt, failureReason: status === "FAILED" && typeof payload.error === "string" ? payload.error : null } });
        } else {
          await this.prisma.paymentReconciliationEntry.create({ data: { providerId: event.providerId, externalRef: externalTransactionId, status: "MISSING_INTERNAL", expected: payload as Prisma.InputJsonValue, actual: { webhookEventId: event.id } } });
        }
      }
      return await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: new Date(), lastError: null } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment webhook processing failed";
      const nextStatus = event.attempt + 1 >= 10 ? "DEAD_LETTER" : "FAILED";
      await this.prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { status: nextStatus, lastError: message.slice(0, 4_000) } });
      throw error;
    }
  }

  verify(rawBody: Buffer, signature: string | undefined, secret: string, timestamp?: string, now = Date.now()) {
    if (!signature || !timestamp || !/^\d{10,13}$/.test(timestamp)) return false;
    const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1_000 : Number(timestamp);
    const toleranceMs = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? 300) * 1_000;
    if (!Number.isFinite(timestampMs) || Math.abs(now - timestampMs) > toleranceMs) return false;
    const normalized = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    const expected = createHmac("sha256", secret).update(timestamp).update(".").update(rawBody).digest("hex");
    const actualBuffer = Buffer.from(normalized, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private parse(rawBody: Buffer) {
    try {
      const value: unknown = JSON.parse(rawBody.toString("utf8"));
      return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
    } catch { return {}; }
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private safeHeaders(headers: Record<string, string | string[] | undefined>) {
    return Object.fromEntries(Object.entries(headers).filter(([key]) => ["content-type", "user-agent", "x-payment-event-id", "x-payment-timestamp", "x-request-id"].includes(key)).map(([key, value]) => [key, Array.isArray(value) ? value.join(",") : value ?? ""]));
  }
}
