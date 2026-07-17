import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { createPromotionSchema, evaluatePromotionSchema, redeemPromotionSchema, setPromotionPlacementSchema, updatePromotionStatusSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { PromotionsService } from "./promotions.service";

@ApiTags("promotions")
@UseGuards(PermissionsGuard)
@Controller("promotions")
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Post() @RequirePermissions("promotion.manage")
  create(@Body() body: unknown, @Query("supplierOrganizationId") supplierOrganizationId: string | undefined, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createPromotionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.promotions.create(parsed.data, this.context(actorId, organizationId), supplierOrganizationId); }

  @Get() @RequirePermissions("promotion.view")
  list(@Query("active") active: string | undefined, @Query("supplierOrganizationId") supplierOrganizationId: string | undefined, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.promotions.list(this.context(actorId, organizationId), active === "true", supplierOrganizationId); }

  @Patch(":promotionId/status") @RequirePermissions("promotion.manage")
  status(@Param("promotionId") promotionId: string, @Body() body: unknown, @Query("supplierOrganizationId") supplierOrganizationId: string | undefined, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = updatePromotionStatusSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.promotions.updateStatus(promotionId, parsed.data.status, parsed.data.version, this.context(actorId, organizationId), supplierOrganizationId); }

  @Patch(":promotionId/placement") @RequirePermissions("promotion.placement.manage")
  placement(@Param("promotionId") promotionId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = setPromotionPlacementSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.promotions.setPlacement(promotionId, parsed.data, this.context(actorId, organizationId)); }

  @Post("evaluate") @RequirePermissions("catalog.product.view")
  evaluate(@Body() body: unknown) { const parsed = evaluatePromotionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.promotions.evaluate(parsed.data); }

  @Post("redeem") @RequirePermissions("order.create")
  redeem(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = redeemPromotionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.promotions.redeem(parsed.data, this.context(actorId, organizationId)); }

  @Get("analytics/summary") @RequirePermissions("promotion.view")
  analytics(@Query("supplierOrganizationId") supplierOrganizationId: string | undefined, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.promotions.analytics(this.context(actorId, organizationId), supplierOrganizationId); }
}
