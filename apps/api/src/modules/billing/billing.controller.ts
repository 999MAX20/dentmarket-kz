import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from "@nestjs/common";
import { commerceProfileSchema, createBillingPlanSchema, createSubscriptionSchema, setOrganizationFeatureSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { BillingService } from "./billing.service";

@ApiTags("billing")
@UseGuards(PermissionsGuard)
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }
  @Get("plans") @RequirePermissions("organization.view") plans() { return this.billing.plans(); }
  @Post("plans") @RequirePermissions("billing.manage")
  plan(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createBillingPlanSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.billing.createPlan(parsed.data, this.context(actorId, organizationId)); }
  @Post("subscriptions") @RequirePermissions("billing.manage")
  subscribe(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createSubscriptionSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.billing.subscribe(parsed.data, this.context(actorId, organizationId)); }
  @Get("subscriptions") @RequirePermissions("billing.view") subscriptions(@Headers("x-organization-id") organizationId: string) { return this.billing.subscriptions(organizationId); }
  @Get("invoices") @RequirePermissions("billing.view") invoices(@Headers("x-organization-id") organizationId: string) { return this.billing.invoices(organizationId); }
  @Get("entitlements") @RequirePermissions("organization.view") entitlements(@Headers("x-organization-id") organizationId: string) { return this.billing.entitlementSummary(organizationId); }
  @Get("commerce-profile") @RequirePermissions("organization.view") commerceProfile(@Headers("x-organization-id") organizationId: string) { return this.billing.commerceProfile(organizationId); }
  @Put("commerce-profile") @RequirePermissions("billing.manage")
  updateCommerceProfile(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = commerceProfileSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.billing.setCommerceProfile(organizationId, parsed.data, this.context(actorId, organizationId)); }
  @Put("organizations/:organizationId/features/:featureKey") @RequirePermissions("billing.manage")
  feature(@Param("organizationId") targetOrganizationId: string, @Param("featureKey") featureKey: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = setOrganizationFeatureSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.billing.setFeature(targetOrganizationId, featureKey, parsed.data, this.context(actorId, organizationId)); }
}
