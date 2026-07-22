import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { decideProductCorrectionSchema, submitProductCorrectionSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ProductCorrectionsService } from "./product-corrections.service";

const correctionStatusSchema = z.enum(["PENDING", "APPROVED", "PARTIALLY_APPROVED", "REJECTED"]).optional();

@ApiTags("catalog-moderation")
@UseGuards(PermissionsGuard)
@Controller("moderation/product-corrections")
export class ProductCorrectionsController {
  constructor(private readonly corrections: ProductCorrectionsService) {}

  private context(actorId: string, organizationId: string) {
    return { actorId, organizationId };
  }

  @Post()
  @RequirePermissions("catalog.offer.edit")
  submit(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = submitProductCorrectionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.corrections.submit(parsed.data, this.context(actorId, organizationId));
  }

  @Get()
  @RequirePermissions("catalog.product.view")
  list(@Query("status") status: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = correctionStatusSchema.safeParse(status);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.corrections.list(parsed.data, this.context(actorId, organizationId));
  }

  @Post(":requestId/approve")
  @RequirePermissions("catalog.candidate.moderate")
  approve(@Param("requestId") requestId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = decideProductCorrectionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.corrections.approve(requestId, parsed.data, this.context(actorId, organizationId));
  }

  @Post(":requestId/reject")
  @RequirePermissions("catalog.candidate.moderate")
  reject(@Param("requestId") requestId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = decideProductCorrectionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.corrections.reject(requestId, parsed.data, this.context(actorId, organizationId));
  }
}
