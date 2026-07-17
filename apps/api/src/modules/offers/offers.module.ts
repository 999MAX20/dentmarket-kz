import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { ComplianceModule } from "../compliance/compliance.module";
import { MarketplaceAgreementsModule } from "../agreements/marketplace-agreements.module";

@Module({ imports: [AccessControlModule, SuppliersModule, ComplianceModule, MarketplaceAgreementsModule], controllers: [OffersController], providers: [OffersService] })
export class OffersModule {}
