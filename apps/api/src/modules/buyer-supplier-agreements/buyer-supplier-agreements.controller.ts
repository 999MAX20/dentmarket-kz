import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { buyerSupplierAgreementDecisionSchema, createBuyerSupplierAgreementSchema, signBuyerSupplierAgreementSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { BuyerSupplierAgreementsService } from "./buyer-supplier-agreements.service";

@ApiTags("buyer-supplier-agreements")
@UseGuards(PermissionsGuard)
@Controller("buyer-supplier-agreements")
export class BuyerSupplierAgreementsController {
  constructor(private readonly agreements: BuyerSupplierAgreementsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("current") @RequirePermissions("document.view") current(@Query("supplierOrganizationId") supplierOrganizationId: string, @Query("buyerOrganizationId") buyerOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.agreements.current(supplierOrganizationId, buyerOrganizationId, this.context(actorId, organizationId)); }
  @Post() @RequirePermissions("document.manage") initiate(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createBuyerSupplierAgreementSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.agreements.initiate(parsed.data, this.context(actorId, organizationId)); }
  @Get(":agreementId") @RequirePermissions("document.view") get(@Param("agreementId") agreementId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.agreements.presentation(agreementId, this.context(actorId, organizationId)); }
  @Post(":agreementId/sign") @RequirePermissions("document.sign") sign(@Param("agreementId") agreementId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = signBuyerSupplierAgreementSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.agreements.sign(agreementId, parsed.data, this.context(actorId, organizationId)); }
  @Post(":agreementId/non-renewal") @RequirePermissions("document.manage") nonRenewal(@Param("agreementId") agreementId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = buyerSupplierAgreementDecisionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.agreements.requestNonRenewal(agreementId, parsed.data.reason, this.context(actorId, organizationId)); }
}
