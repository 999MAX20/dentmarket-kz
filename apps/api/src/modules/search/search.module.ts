import { Module } from "@nestjs/common";
import { PublicCatalogController, SearchController } from "./search.controller";
import { SearchProjectionService } from "./search-projection.service";
import { SearchService } from "./search.service";

@Module({ controllers: [SearchController, PublicCatalogController], providers: [SearchService, SearchProjectionService], exports: [SearchProjectionService] })
export class SearchModule {}
