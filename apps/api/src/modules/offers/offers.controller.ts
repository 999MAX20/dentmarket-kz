import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from "@nestjs/common";
import { assignOfferPackagingSchema, createSupplierOfferSchema, setOfferPriceSchema, setOfferPublicationSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { OffersService } from "./offers.service";

@ApiTags("supplier-offers")
@UseGuards(PermissionsGuard)
@Controller("suppliers/:supplierOrganizationId/offers")
export class OffersController {
  constructor(private readonly offers: OffersService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get()
  @RequirePermissions("catalog.product.view")
  list(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.offers.list(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post()
  @RequirePermissions("catalog.offer.edit")
  create(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createSupplierOfferSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.offers.create(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Put(":offerId/price")
  @RequirePermissions("pricing.manage")
  setPrice(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = setOfferPriceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.offers.setPrice(supplierOrganizationId, offerId, parsed.data, this.context(actorId, organizationId));
  }

  @Put(":offerId/publication")
  @RequirePermissions("catalog.offer.publish")
  setPublication(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = setOfferPublicationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.offers.setPublication(supplierOrganizationId, offerId, parsed.data, this.context(actorId, organizationId));
  }

  @Put(":offerId/packaging")
  @RequirePermissions("catalog.offer.edit")
  assignPackaging(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = assignOfferPackagingSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.offers.assignPackaging(supplierOrganizationId, offerId, parsed.data, this.context(actorId, organizationId));
  }
}
