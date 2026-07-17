import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { IntegrationCryptoService } from "./integration-crypto.service";
import { IntegrationJobsService } from "./integration-jobs.service";
import { asRecord } from "./adapters/integration-adapter";

@Injectable()
export class IntegrationWebhooksService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: IntegrationCryptoService, private readonly jobs: IntegrationJobsService) {}

  async ingest(endpointId: string, body: unknown, rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>) {
    const connection = await this.prisma.integrationConnection.findUnique({ where: { webhookEndpointId: endpointId } });
    if (!connection || connection.status === "REVOKED") throw new NotFoundException("Integration webhook endpoint not found");
    const payload = Array.isArray(body) ? body : asRecord(body);
    const payloadBytes = rawBody ?? Buffer.from(JSON.stringify(payload));
    const configuration = asRecord(connection.configuration);
    const signatureRequired = configuration.webhookSignatureRequired === true;
    const signature = this.header(headers, "x-marketplace-signature");
    const timestamp = this.header(headers, "x-marketplace-timestamp");
    const signatureStatus = signatureRequired ? this.verify(connection.encryptedWebhookSecret, payloadBytes, signature, timestamp) ? "VERIFIED" : "INVALID" : "SKIPPED";
    const externalEventId = this.header(headers, "x-event-id") ?? this.header(headers, "x-request-id") ?? createHash("sha256").update(payloadBytes).digest("hex");
    const eventType = this.header(headers, "x-event-type") ?? this.eventType(payload);
    const safeHeaders = Object.fromEntries(["user-agent", "x-event-id", "x-event-type", "x-request-id", "x-lognex-webhook-id", "x-marketplace-timestamp"].map((name) => [name, this.header(headers, name)]).filter((entry) => entry[1]));

    let event;
    try {
      event = await this.prisma.integrationWebhookEvent.create({
        data: {
          connectionId: connection.id,
          provider: connection.provider,
          externalEventId,
          eventType,
          signatureStatus,
          status: signatureStatus === "INVALID" ? "DEAD_LETTER" : "RECEIVED",
          payload: payload as Prisma.InputJsonValue,
          headers: safeHeaders,
          lastError: signatureStatus === "INVALID" ? "Webhook signature verification failed" : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        event = await this.prisma.integrationWebhookEvent.findUniqueOrThrow({ where: { connectionId_externalEventId: { connectionId: connection.id, externalEventId } } });
      } else {
        throw error;
      }
    }
    if (signatureStatus === "INVALID") throw new UnauthorizedException("Webhook signature is invalid");
    await this.jobs.enqueue(connection.id, { type: "WEBHOOK_PROCESS", idempotencyKey: `webhook:${externalEventId}`, payload: { webhookEventId: event.id, eventType }, maxAttempts: 5 }, "WEBHOOK");
    return { accepted: true, duplicate: event.status !== "RECEIVED", eventId: event.id };
  }

  private verify(encryptedSecret: string | null, payload: Buffer, signature?: string, timestamp?: string) {
    if (!encryptedSecret || !signature || !timestamp || !/^\d{10,13}$/.test(timestamp)) return false;
    const timestampMs = timestamp.length === 10 ? Number(timestamp) * 1_000 : Number(timestamp);
    const toleranceMs = Number(process.env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS ?? 300) * 1_000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > toleranceMs) return false;
    const secret = this.crypto.decrypt(encryptedSecret).secret;
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(timestamp).update(".").update(payload).digest("hex");
    const actual = signature.replace(/^sha256=/i, "").toLowerCase();
    const expectedBuffer = Buffer.from(expected, "hex");
    const actualBuffer = Buffer.from(actual, "hex");
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private eventType(payload: unknown) {
    const record = asRecord(Array.isArray(payload) ? payload[0] : payload);
    return typeof record.action === "string" ? record.action : typeof record.eventType === "string" ? record.eventType : "unknown";
  }

  private header(headers: Record<string, string | string[] | undefined>, name: string) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  }
}
