import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { SuppliersModule } from "../suppliers/suppliers.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { ComplianceModule } from "../compliance/compliance.module";
import { CommerceController } from "./commerce.controller";
import { CommerceService } from "./commerce.service";
import { MarketplaceAgreementsModule } from "../agreements/marketplace-agreements.module";

@Module({ imports: [InventoryModule, SuppliersModule, IntegrationsModule, ComplianceModule, MarketplaceAgreementsModule], controllers: [CommerceController], providers: [CommerceService], exports: [CommerceService] })
export class CommerceModule {}
