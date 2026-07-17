import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryFreshnessService } from "./inventory-freshness.service";
import { DataFreshnessService } from "./data-freshness.service";

@Module({ imports: [AccessControlModule, SuppliersModule], controllers: [InventoryController], providers: [InventoryService, InventoryFreshnessService, DataFreshnessService], exports: [InventoryService, DataFreshnessService] })
export class InventoryModule {}
