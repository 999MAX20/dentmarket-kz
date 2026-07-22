import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { SupplierAccessService } from "./supplier-access.service";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { IntegrationCryptoService } from "../integrations/integration-crypto.service";

@Module({
  imports: [AccessControlModule],
  controllers: [SuppliersController],
  providers: [SupplierAccessService, SuppliersService, IntegrationCryptoService],
  exports: [SupplierAccessService],
})
export class SuppliersModule {}
