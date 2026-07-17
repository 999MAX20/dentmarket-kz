import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { PricingController } from "./pricing.controller";
import { PricingService } from "./pricing.service";

@Module({ imports: [AccessControlModule, SuppliersModule], controllers: [PricingController], providers: [PricingService] })
export class PricingModule {}
