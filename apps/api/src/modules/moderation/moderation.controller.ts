import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { approveProductCandidateSchema, rejectProductCandidateSchema, submitProductCandidateSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ModerationService } from "./moderation.service";

const statusSchema = z.enum(["PENDING", "APPROVED", "REJECTED"]).optional();

@ApiTags("catalog-moderation")
@UseGuards(PermissionsGuard)
@Controller("moderation/product-candidates")
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Post("submissions")
  @RequirePermissions("catalog.offer.edit")
  submit(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = submitProductCandidateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.moderation.submit(parsed.data, this.context(actorId, organizationId));
  }

  @Get()
  @RequirePermissions("catalog.candidate.moderate")
  list(@Query("status") status: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = statusSchema.safeParse(status);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.moderation.list(parsed.data, this.context(actorId, organizationId));
  }

  @Post(":candidateId/approve")
  @RequirePermissions("catalog.candidate.moderate")
  approve(@Param("candidateId") candidateId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = approveProductCandidateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.moderation.approve(candidateId, parsed.data, this.context(actorId, organizationId));
  }

  @Post(":candidateId/reject")
  @RequirePermissions("catalog.candidate.moderate")
  reject(@Param("candidateId") candidateId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = rejectProductCandidateSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.moderation.reject(candidateId, parsed.data, this.context(actorId, organizationId));
  }
}
