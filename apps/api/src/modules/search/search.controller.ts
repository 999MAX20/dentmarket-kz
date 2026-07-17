import { BadRequestException, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { compareOffersSchema, searchCatalogSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { SearchProjectionService } from "./search-projection.service";
import { SearchService } from "./search.service";

@ApiTags("marketplace-search")
@UseGuards(PermissionsGuard)
@Controller("marketplace")
export class SearchController {
  constructor(private readonly searchService: SearchService, private readonly projection: SearchProjectionService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("search")
  @RequirePermissions("order.create")
  search(@Query() query: Record<string, unknown>, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = searchCatalogSchema.safeParse(query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.searchService.search(parsed.data, this.context(actorId, organizationId));
  }

  @Get("products/:productId/compare")
  @RequirePermissions("order.create")
  compare(@Param("productId") productId: string, @Query() query: Record<string, unknown>, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = compareOffersSchema.safeParse({ ...query, productId }); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.searchService.compare(parsed.data, this.context(actorId, organizationId));
  }

  @Post("search/rebuild")
  @RequirePermissions("catalog.product.moderate")
  rebuild() { return this.projection.rebuildAll(); }
}
