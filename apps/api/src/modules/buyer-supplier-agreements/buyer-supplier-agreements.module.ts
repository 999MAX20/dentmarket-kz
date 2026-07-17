import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { BuyerSupplierAgreementsController } from "./buyer-supplier-agreements.controller";
import { BuyerSupplierAgreementsService } from "./buyer-supplier-agreements.service";

@Module({ imports: [DocumentsModule], controllers: [BuyerSupplierAgreementsController], providers: [BuyerSupplierAgreementsService], exports: [BuyerSupplierAgreementsService] })
export class BuyerSupplierAgreementsModule {}
