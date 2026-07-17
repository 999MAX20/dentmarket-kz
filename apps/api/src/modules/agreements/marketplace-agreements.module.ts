import { Module } from "@nestjs/common";
import { DocumentsModule } from "../documents/documents.module";
import { MarketplaceAgreementsController } from "./marketplace-agreements.controller";
import { MarketplaceAgreementsService } from "./marketplace-agreements.service";
import { SignatureCallbacksController } from "./signature-callbacks.controller";
import { SignatureCallbacksService } from "./signature-callbacks.service";

@Module({ imports: [DocumentsModule], controllers: [MarketplaceAgreementsController, SignatureCallbacksController], providers: [MarketplaceAgreementsService, SignatureCallbacksService], exports: [MarketplaceAgreementsService] })
export class MarketplaceAgreementsModule {}
