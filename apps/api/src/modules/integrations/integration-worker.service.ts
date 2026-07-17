import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { IntegrationExecutionService } from "./integration-execution.service";
import { PermanentIntegrationError, RetryableIntegrationError } from "./adapters/integration-adapter";
import { IntegrationJobsService } from "./integration-jobs.service";
import { IntegrationOutboxService } from "./integration-outbox.service";
import { BackgroundQueueService } from "../../platform/jobs/background-queue.service";

@Injectable()
export class IntegrationWorkerService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationWorkerService.name);
  private readonly workerId = `server:${process.pid}`;
  private running = false;

  constructor(private readonly jobs: IntegrationJobsService, private readonly execution: IntegrationExecutionService, private readonly outbox: IntegrationOutboxService, private readonly backgroundQueue: BackgroundQueueService) {}

  onModuleInit() { this.backgroundQueue.register("integrations.tick", async () => this.tick()); }

  @Cron("*/3 * * * * *")
  async scheduledTick() {
    const slot = Math.floor(Date.now() / 3_000);
    if (!(await this.backgroundQueue.enqueue("integrations.tick", {}, { jobId: `integrations-${slot}` }))) await this.tick();
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.jobs.releaseStaleClaims();
      await this.outbox.dispatchPaymentCaptured();
      for (let index = 0; index < 5; index += 1) {
        const job = await this.jobs.claimForServer(this.workerId);
        if (!job) break;
        try {
          const result = await this.execution.execute(job);
          await this.jobs.complete(job.id, this.workerId, result);
        } catch (error) {
          const retryable = !(error instanceof PermanentIntegrationError);
          const retryAfterMs = error instanceof RetryableIntegrationError ? error.retryAfterMs : undefined;
          const message = error instanceof Error ? error.message : "Unknown integration job failure";
          await this.jobs.fail(job.id, this.workerId, message, retryable, retryAfterMs);
          this.logger.warn(`Integration job ${job.id} failed: ${message}`);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
