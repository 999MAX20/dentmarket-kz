import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { createSupplierDataSourceSchema, createSupplierProfileSchema, createWarehouseSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { SuppliersService } from "./suppliers.service";

@ApiTags("suppliers")
@UseGuards(PermissionsGuard)
@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get()
  @RequirePermissions("organization.view")
  list(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.suppliers.list(this.context(actorId, organizationId));
  }

  @Post(":supplierOrganizationId/profile")
  @RequirePermissions("supplier.profile.manage")
  createProfile(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createSupplierProfileSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.suppliers.createProfile(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Get(":supplierOrganizationId/warehouses")
  @RequirePermissions("inventory.view")
  warehouses(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.suppliers.warehouses(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post(":supplierOrganizationId/warehouses")
  @RequirePermissions("supplier.warehouse.manage")
  createWarehouse(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createWarehouseSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.suppliers.createWarehouse(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Get(":supplierOrganizationId/data-sources")
  @RequirePermissions("import.manage")
  dataSources(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.suppliers.dataSources(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post(":supplierOrganizationId/data-sources")
  @RequirePermissions("import.manage")
  createDataSource(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createSupplierDataSourceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.suppliers.createDataSource(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }
}
