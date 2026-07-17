import { Global, Module } from "@nestjs/common";
import { BackgroundQueueService } from "./background-queue.service";

@Global()
@Module({ providers: [BackgroundQueueService], exports: [BackgroundQueueService] })
export class BackgroundJobsModule {}
