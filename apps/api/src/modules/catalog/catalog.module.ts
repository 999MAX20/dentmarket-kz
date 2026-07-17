import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { AttributeValuesService } from "./attribute-values.service";
import { PackagingService } from "./packaging.service";

@Module({ controllers: [CatalogController], providers: [CatalogService, AttributeValuesService, PackagingService] })
export class CatalogModule {}
