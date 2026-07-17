import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { createCostCenterSchema, createPurchaseBudgetSchema, createSavedListSchema, upsertSavedListItemSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { OwnersService } from "./owners.service";

@ApiTags("owner-workspaces")
@UseGuards(PermissionsGuard)
@Controller("owner")
export class OwnersController {
  constructor(private readonly owners: OwnersService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("buyer/dashboard") @RequirePermissions("organization.view")
  buyer(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.owners.buyerDashboard(this.context(actorId, organizationId)); }
  @Get("supplier/dashboard") @RequirePermissions("organization.view")
  supplier(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.owners.supplierDashboard(this.context(actorId, organizationId)); }

  @Get("saved-lists") @RequirePermissions("catalog.product.view")
  lists(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.owners.lists(this.context(actorId, organizationId)); }
  @Post("saved-lists") @RequirePermissions("order.create")
  createList(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createSavedListSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.owners.createList(parsed.data, this.context(actorId, organizationId)); }
  @Post("saved-lists/:listId/items") @RequirePermissions("order.create")
  item(@Param("listId") listId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = upsertSavedListItemSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.owners.upsertListItem(listId, parsed.data, this.context(actorId, organizationId)); }
  @Delete("saved-lists/:listId/items/:itemId") @RequirePermissions("order.create")
  remove(@Param("listId") listId: string, @Param("itemId") itemId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.owners.removeListItem(listId, itemId, this.context(actorId, organizationId)); }

  @Get("cost-centers") @RequirePermissions("budget.view")
  costCenters(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.owners.costCenters(this.context(actorId, organizationId)); }
  @Post("cost-centers") @RequirePermissions("budget.manage")
  createCostCenter(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createCostCenterSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.owners.createCostCenter(parsed.data, this.context(actorId, organizationId)); }
  @Get("budgets") @RequirePermissions("budget.view")
  budgets(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.owners.budgets(this.context(actorId, organizationId)); }
  @Post("budgets") @RequirePermissions("budget.manage")
  createBudget(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createPurchaseBudgetSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.owners.createBudget(parsed.data, this.context(actorId, organizationId)); }
}
