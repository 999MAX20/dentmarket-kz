import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "./platform/prisma/prisma.service";
import { BackgroundQueueService } from "./platform/jobs/background-queue.service";
import { ObjectStorageService } from "./platform/storage/object-storage.service";
import { environment } from "./platform/config/environment";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly queue: BackgroundQueueService, private readonly storage: ObjectStorageService) {}

  @Get()
  @ApiOkResponse({ schema: { example: { status: "ok" } } })
  health() {
    return { status: "ok", service: "marketplace-api", environment: environment().NODE_ENV, release: process.env.APP_RELEASE ?? "local" };
  }

  @Get("ready")
  async ready() {
    const checks: Record<string, unknown> = {};
    try { await this.prisma.$queryRaw`SELECT 1`; checks.database = { status: "ok" }; } catch (error) { checks.database = { status: "down", error: error instanceof Error ? error.message : "Database unavailable" }; }
    try { checks.queue = await this.queue.health(); } catch (error) { checks.queue = { status: "down", error: error instanceof Error ? error.message : "Queue unavailable" }; }
    try { checks.storage = await this.storage.health(); } catch (error) { checks.storage = { status: "down", error: error instanceof Error ? error.message : "Storage unavailable" }; }
    const requiredQueue = environment().BACKGROUND_QUEUE_ENABLED;
    const ready = (checks.database as { status: string }).status === "ok" && (checks.storage as { status: string }).status === "ok" && (!requiredQueue || (checks.queue as { status: string }).status === "ok");
    if (!ready) throw new ServiceUnavailableException({ status: "not_ready", checks });
    return { status: "ready", checks };
  }
}
