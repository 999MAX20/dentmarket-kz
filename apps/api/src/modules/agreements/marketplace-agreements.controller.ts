import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { initiateMarketplaceAgreementSchema, marketplaceAgreementDecisionSchema, signMarketplaceAgreementSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { MarketplaceAgreementsService } from "./marketplace-agreements.service";

@ApiTags("marketplace-agreements")
@UseGuards(PermissionsGuard)
@Controller("marketplace-agreements")
export class MarketplaceAgreementsController {
  constructor(private readonly agreements: MarketplaceAgreementsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }
  @Get("current") @RequirePermissions("document.view") current(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.agreements.current(this.context(actorId, organizationId)); }
  @Get("suppliers/:supplierOrganizationId/current") @RequirePermissions("document.view") currentForSupplier(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.agreements.currentForSupplier(supplierOrganizationId, this.context(actorId, organizationId)); }
  @Get("operator/pending") @RequirePermissions("document.view") pending(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.agreements.pendingForOperator(this.context(actorId, organizationId)); }
  @Post() @RequirePermissions("document.manage") initiate(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = initiateMarketplaceAgreementSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.agreements.initiate(parsed.data, this.context(actorId, organizationId)); }
  @Get(":agreementId") @RequirePermissions("document.view") get(@Param("agreementId") agreementId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.agreements.presentation(agreementId, this.context(actorId, organizationId)); }
  @Post(":agreementId/sign") @RequirePermissions("document.sign") sign(@Param("agreementId") agreementId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = signMarketplaceAgreementSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.agreements.sign(agreementId, parsed.data, this.context(actorId, organizationId)); }
  @Post(":agreementId/non-renewal") @RequirePermissions("document.manage") nonRenewal(@Param("agreementId") agreementId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = marketplaceAgreementDecisionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.agreements.requestNonRenewal(agreementId, parsed.data.reason, this.context(actorId, organizationId)); }
  @Post(":agreementId/terminate") @RequirePermissions("document.manage") terminate(@Param("agreementId") agreementId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = marketplaceAgreementDecisionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.agreements.terminate(agreementId, parsed.data.reason, this.context(actorId, organizationId)); }
}
