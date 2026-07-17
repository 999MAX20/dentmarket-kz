import { Module } from "@nestjs/common";
import { SearchController } from "./search.controller";
import { SearchProjectionService } from "./search-projection.service";
import { SearchService } from "./search.service";

@Module({ controllers: [SearchController], providers: [SearchService, SearchProjectionService], exports: [SearchProjectionService] })
export class SearchModule {}
