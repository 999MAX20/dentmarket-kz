import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { createContractPriceSchema, createOfferPriceTierSchema, resolveOfferPriceSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { PricingService } from "./pricing.service";

@ApiTags("pricing")
@UseGuards(PermissionsGuard)
@Controller("suppliers/:supplierOrganizationId/offers/:offerId")
export class PricingController {
  constructor(private readonly pricing: PricingService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("price-tiers")
  @RequirePermissions("catalog.product.view")
  tiers(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.pricing.tiers(supplierOrganizationId, offerId, this.context(actorId, organizationId)); }

  @Post("price-tiers")
  @RequirePermissions("pricing.manage")
  createTier(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createOfferPriceTierSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.pricing.createTier(supplierOrganizationId, offerId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("contract-prices")
  @RequirePermissions("pricing.contract.manage")
  contracts(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.pricing.contracts(supplierOrganizationId, offerId, this.context(actorId, organizationId)); }

  @Post("contract-prices")
  @RequirePermissions("pricing.contract.manage")
  createContract(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createContractPriceSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.pricing.createContract(supplierOrganizationId, offerId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("resolve-price")
  @RequirePermissions("catalog.product.view")
  resolve(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = resolveOfferPriceSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.pricing.resolve(supplierOrganizationId, offerId, parsed.data, this.context(actorId, organizationId));
  }
}
