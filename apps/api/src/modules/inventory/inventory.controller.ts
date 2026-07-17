import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from "@nestjs/common";
import { createDataOverrideSchema, createInventoryLotSchema, createInventoryReservationSchema, createLotRecallSchema, recomputeFreshnessSchema, resolveLotRecallSchema, setInventoryBalanceSchema, upsertFreshnessPolicySchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { InventoryService } from "./inventory.service";
import { InventoryFreshnessService } from "./inventory-freshness.service";
import { DataFreshnessService } from "./data-freshness.service";

@ApiTags("inventory")
@UseGuards(PermissionsGuard)
@Controller("suppliers/:supplierOrganizationId/inventory")
export class InventoryController {
  constructor(private readonly inventory: InventoryService, private readonly freshness: InventoryFreshnessService, private readonly dataFreshness: DataFreshnessService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("balances")
  @RequirePermissions("inventory.view")
  balances(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.inventory.balances(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Put("balances")
  @RequirePermissions("inventory.adjust")
  setBalance(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = setInventoryBalanceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.inventory.setBalance(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("lots")
  @RequirePermissions("inventory.adjust")
  createLot(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createInventoryLotSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.inventory.createLot(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("balances/:balanceId/reservations")
  @RequirePermissions("inventory.reserve")
  reserve(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("balanceId") balanceId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createInventoryReservationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.inventory.reserve(supplierOrganizationId, balanceId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("freshness/recompute")
  @RequirePermissions("inventory.freshness.manage")
  recomputeFreshness(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = recomputeFreshnessSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.freshness.recompute(supplierOrganizationId, parsed.data.staleAfterMinutes, this.context(actorId, organizationId));
  }

  @Get("freshness/policies")
  @RequirePermissions("inventory.view")
  freshnessPolicies(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.dataFreshness.policies(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Put("freshness/policies")
  @RequirePermissions("inventory.freshness.manage")
  upsertFreshnessPolicy(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = upsertFreshnessPolicySchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.dataFreshness.upsertPolicy(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("overrides")
  @RequirePermissions("inventory.view")
  overrides(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.dataFreshness.overrides(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post("overrides")
  @RequirePermissions("inventory.adjust")
  createOverride(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createDataOverrideSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.dataFreshness.createOverride(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("overrides/:overrideId/cancel")
  @RequirePermissions("inventory.adjust")
  cancelOverride(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("overrideId") overrideId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.dataFreshness.cancelOverride(supplierOrganizationId, overrideId, this.context(actorId, organizationId));
  }

  @Get("recalls")
  @RequirePermissions("inventory.view")
  recalls(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.inventory.recalls(supplierOrganizationId, this.context(actorId, organizationId)); }

  @Post("recalls")
  @RequirePermissions("inventory.recall.manage")
  recallLot(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createLotRecallSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.inventory.recallLot(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("recalls/:recallId/resolve")
  @RequirePermissions("inventory.recall.manage")
  resolveRecall(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("recallId") recallId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = resolveLotRecallSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.inventory.resolveRecall(supplierOrganizationId, recallId, parsed.data, this.context(actorId, organizationId));
  }
}
