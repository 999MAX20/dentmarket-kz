import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { AttributeValuesService } from "./attribute-values.service";
import { PackagingService } from "./packaging.service";
import { CatalogMediaController } from "./catalog-media.controller";

@Module({
  controllers: [CatalogController, CatalogMediaController],
  providers: [CatalogService, AttributeValuesService, PackagingService],
  exports: [CatalogService],
})
export class CatalogModule {}
