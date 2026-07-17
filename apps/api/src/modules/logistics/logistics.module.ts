import { Module } from "@nestjs/common";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { LogisticsController } from "./logistics.controller";
import { LogisticsService } from "./logistics.service";

@Module({ imports: [SuppliersModule], controllers: [LogisticsController], providers: [LogisticsService], exports: [LogisticsService] })
export class LogisticsModule {}
