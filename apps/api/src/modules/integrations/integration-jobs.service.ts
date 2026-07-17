import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { EnqueueIntegrationJobInput } from "@marketplace/schemas";
import { Prisma, type IntegrationSyncJob } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

@Injectable()
export class IntegrationJobsService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(connectionId: string, input: EnqueueIntegrationJobInput, trigger: "MANUAL" | "SCHEDULE" | "WEBHOOK" | "OUTBOX" | "RETRY" | "AGENT" = "MANUAL") {
    try {
      return await this.prisma.integrationSyncJob.create({
        data: {
          connectionId,
          type: input.type,
          trigger,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload == null ? undefined : input.payload as Prisma.InputJsonValue,
          maxAttempts: input.maxAttempts,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return this.prisma.integrationSyncJob.findUniqueOrThrow({ where: { connectionId_idempotencyKey: { connectionId, idempotencyKey: input.idempotencyKey } } });
      }
      throw error;
    }
  }

  list(connectionId: string) {
    return this.prisma.integrationSyncJob.findMany({ where: { connectionId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
  }

  async claimForAgent(connectionId: string, workerId: string) {
    const rows = await this.prisma.$queryRaw<IntegrationSyncJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT job."id"
        FROM "IntegrationSyncJob" job
        WHERE job."connectionId" = ${connectionId}::uuid
          AND job."status" IN ('PENDING'::"IntegrationJobStatus", 'FAILED'::"IntegrationJobStatus")
          AND job."availableAt" <= NOW()
          AND job."attempt" < job."maxAttempts"
        ORDER BY job."availableAt" ASC, job."createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "IntegrationSyncJob" job
      SET "status" = 'RUNNING'::"IntegrationJobStatus",
          "attempt" = job."attempt" + 1,
          "startedAt" = NOW(),
          "lockedAt" = NOW(),
          "lockedBy" = ${workerId},
          "lastError" = NULL,
          "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `);
    return rows[0] ?? null;
  }

  async claimForServer(workerId: string) {
    const rows = await this.prisma.$queryRaw<IntegrationSyncJob[]>(Prisma.sql`
      WITH candidate AS (
        SELECT job."id"
        FROM "IntegrationSyncJob" job
        INNER JOIN "IntegrationConnection" connection ON connection."id" = job."connectionId"
        WHERE connection."provider" IN ('MOYSKLAD'::"IntegrationProvider", 'CUSTOM_API'::"IntegrationProvider", 'MOCK'::"IntegrationProvider")
          AND connection."status" IN ('PENDING'::"IntegrationConnectionStatus", 'ACTIVE'::"IntegrationConnectionStatus", 'ERROR'::"IntegrationConnectionStatus")
          AND job."status" IN ('PENDING'::"IntegrationJobStatus", 'FAILED'::"IntegrationJobStatus")
          AND job."availableAt" <= NOW()
          AND job."attempt" < job."maxAttempts"
        ORDER BY job."availableAt" ASC, job."createdAt" ASC
        FOR UPDATE OF job SKIP LOCKED
        LIMIT 1
      )
      UPDATE "IntegrationSyncJob" job
      SET "status" = 'RUNNING'::"IntegrationJobStatus",
          "attempt" = job."attempt" + 1,
          "startedAt" = NOW(),
          "lockedAt" = NOW(),
          "lockedBy" = ${workerId},
          "lastError" = NULL,
          "updatedAt" = NOW()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `);
    return rows[0] ?? null;
  }

  async complete(jobId: string, workerId: string, result?: Record<string, unknown> | null, cursor?: Record<string, unknown> | null) {
    const job = await this.requireClaim(jobId, workerId);
    return this.prisma.$transaction(async (tx) => {
      const completed = await tx.integrationSyncJob.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          result: result == null ? undefined : result as Prisma.InputJsonValue,
          cursor: cursor == null ? undefined : cursor as Prisma.InputJsonValue,
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      });
      await tx.integrationConnection.update({ where: { id: job.connectionId }, data: { status: "ACTIVE", lastSuccessAt: new Date(), lastError: null, consecutiveFailures: 0 } });
      return completed;
    });
  }

  async fail(jobId: string, workerId: string, message: string, retryable: boolean, retryAfterMs?: number) {
    const job = await this.requireClaim(jobId, workerId);
    const deadLetter = !retryable || job.attempt >= job.maxAttempts;
    const backoffMs = retryAfterMs ?? Math.min(60 * 60_000, 5_000 * 2 ** Math.max(0, job.attempt - 1));
    return this.prisma.$transaction(async (tx) => {
      const failed = await tx.integrationSyncJob.update({
        where: { id: job.id },
        data: {
          status: deadLetter ? "DEAD_LETTER" : "FAILED",
          lastError: message.slice(0, 4_000),
          availableAt: deadLetter ? job.availableAt : new Date(Date.now() + backoffMs),
          completedAt: deadLetter ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      await tx.integrationConnection.update({
        where: { id: job.connectionId },
        data: { status: "ERROR", lastErrorAt: new Date(), lastError: message.slice(0, 4_000), consecutiveFailures: { increment: 1 } },
      });
      return failed;
    });
  }

  async releaseStaleClaims(staleAfterMinutes = 10) {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "IntegrationSyncJob"
      SET "status" = CASE WHEN "attempt" >= "maxAttempts" THEN 'DEAD_LETTER'::"IntegrationJobStatus" ELSE 'FAILED'::"IntegrationJobStatus" END,
          "availableAt" = NOW(),
          "completedAt" = CASE WHEN "attempt" >= "maxAttempts" THEN NOW() ELSE NULL END,
          "lastError" = 'Worker claim expired',
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "updatedAt" = NOW()
      WHERE "status" = 'RUNNING'::"IntegrationJobStatus"
        AND "lockedAt" < NOW() - (${staleAfterMinutes} * INTERVAL '1 minute')
    `);
  }

  private async requireClaim(jobId: string, workerId: string) {
    const job = await this.prisma.integrationSyncJob.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Integration job not found");
    if (job.status !== "RUNNING" || job.lockedBy !== workerId) throw new ConflictException("Integration job is not claimed by this worker");
    return job;
  }
}
