import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { OffersController } from "./offers.controller";
import { OffersService } from "./offers.service";
import { MarketplaceAgreementsModule } from "../agreements/marketplace-agreements.module";

@Module({ imports: [AccessControlModule, SuppliersModule, MarketplaceAgreementsModule], controllers: [OffersController], providers: [OffersService] })
export class OffersModule {}
