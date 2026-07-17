import { Module } from "@nestjs/common";
import { DocumentRendererService } from "./document-renderer.service";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { SignatureAdapterRegistry } from "./signature-adapter-registry.service";

@Module({ controllers: [DocumentsController], providers: [DocumentsService, DocumentRendererService, SignatureAdapterRegistry], exports: [DocumentsService] })
export class DocumentsModule {}
