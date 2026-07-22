import { BadRequestException, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { compareOffersSchema, searchCatalogSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { SearchProjectionService } from "./search-projection.service";
import { SearchService } from "./search.service";
import { SearchAnalyticsService } from "./search-analytics.service";
import { environment } from "../../platform/config/environment";

@ApiTags("marketplace-search")
@UseGuards(PermissionsGuard)
@Controller("marketplace")
export class SearchController {
  constructor(private readonly searchService: SearchService, private readonly projection: SearchProjectionService, private readonly analytics: SearchAnalyticsService) {}
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

  @Get("search/analytics")
  @RequirePermissions("catalog.product.moderate")
  analyticsReport(@Query("days") days: string) { return this.analytics.report(Number(days || 30)); }
}

@ApiTags("public-catalog")
@Controller("catalog")
export class PublicCatalogController {
  constructor(private readonly searchService: SearchService) {}
  @Get("cities")
  cities() { return this.searchService.publicCities(); }
  private input(query: Record<string, unknown>) { const organizationId = environment().PUBLIC_CATALOG_ORGANIZATION_ID; return { query: { ...query, buyerOrganizationId: organizationId }, context: { actorId: "public-catalog", organizationId } }; }

  @Get("search")
  search(@Query() query: Record<string, unknown>) {
    const input = this.input(query); const parsed = searchCatalogSchema.safeParse(input.query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.searchService.search(parsed.data, input.context);
  }

  @Get("products/:productId/compare")
  compare(@Param("productId") productId: string, @Query() query: Record<string, unknown>) {
    const input = this.input({ ...query, productId }); const parsed = compareOffersSchema.safeParse(input.query); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.searchService.compare(parsed.data, input.context);
  }
}
