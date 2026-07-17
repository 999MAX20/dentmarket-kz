import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { createDeliveryRuleSchema, createDeliveryZoneSchema, createOfferDeliveryOptionSchema, createShipmentSchema, deliveryQuoteSchema, transitionFulfillmentStepSchema, transitionShipmentSchema, updateDeliveryRuleSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { LogisticsService } from "./logistics.service";

@ApiTags("logistics")
@UseGuards(PermissionsGuard)
@Controller()
export class LogisticsController {
  constructor(private readonly logistics: LogisticsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("suppliers/:supplierOrganizationId/delivery-zones")
  @RequirePermissions("delivery.view")
  zones(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.logistics.zones(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post("suppliers/:supplierOrganizationId/delivery-zones")
  @RequirePermissions("delivery.manage")
  createZone(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createDeliveryZoneSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.createZone(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("suppliers/:supplierOrganizationId/offers/:offerId/delivery-options")
  @RequirePermissions("delivery.view")
  offerOptions(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.logistics.offerOptions(supplierOrganizationId, offerId, this.context(actorId, organizationId));
  }

  @Post("suppliers/:supplierOrganizationId/offers/:offerId/delivery-options")
  @RequirePermissions("delivery.manage")
  createOfferOption(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("offerId") offerId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createOfferDeliveryOptionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.createOfferOption(supplierOrganizationId, offerId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("suppliers/:supplierOrganizationId/delivery-rules")
  @RequirePermissions("delivery.view")
  rules(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.logistics.rules(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post("suppliers/:supplierOrganizationId/delivery-rules")
  @RequirePermissions("delivery.manage")
  createRule(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createDeliveryRuleSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.createRule(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Patch("suppliers/:supplierOrganizationId/delivery-rules/:ruleId")
  @RequirePermissions("delivery.manage")
  updateRule(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("ruleId") ruleId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = updateDeliveryRuleSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.updateRule(supplierOrganizationId, ruleId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("supplier-orders/:orderId/delivery-quotes")
  @RequirePermissions("delivery.view")
  quote(@Param("orderId") orderId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = deliveryQuoteSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.quote(orderId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("supplier-orders/:orderId/shipments")
  @RequirePermissions("delivery.view")
  shipments(@Param("orderId") orderId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.logistics.shipments(orderId, this.context(actorId, organizationId));
  }

  @Post("supplier-orders/:orderId/shipments")
  @RequirePermissions("shipment.manage")
  createShipment(@Param("orderId") orderId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createShipmentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.createShipment(orderId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("shipments/:shipmentId/transitions")
  @RequirePermissions("shipment.manage")
  transitionShipment(@Param("shipmentId") shipmentId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = transitionShipmentSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.transitionShipment(shipmentId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("fulfillment-steps/:stepId/transitions")
  @RequirePermissions("shipment.manage")
  transitionFulfillment(@Param("stepId") stepId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = transitionFulfillmentStepSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.logistics.transitionFulfillmentStep(stepId, parsed.data, this.context(actorId, organizationId));
  }
}
