import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { confirmSupplierItemMatchSchema, createImportBatchSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ImportsService } from "./imports.service";

@ApiTags("supplier-imports")
@UseGuards(PermissionsGuard)
@Controller("suppliers/:supplierOrganizationId")
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("import-batches")
  @RequirePermissions("import.manage")
  batches(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.imports.batches(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post("import-batches")
  @RequirePermissions("import.manage")
  createBatch(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createImportBatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.imports.createBatch(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Post("import-batches/:batchId/process")
  @RequirePermissions("import.manage")
  processBatch(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("batchId") batchId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.imports.processBatch(supplierOrganizationId, batchId, this.context(actorId, organizationId));
  }

  @Post("import-batches/:batchId/enqueue")
  @RequirePermissions("import.manage")
  enqueueBatch(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("batchId") batchId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.imports.enqueueBatch(supplierOrganizationId, batchId, this.context(actorId, organizationId));
  }

  @Get("external-items")
  @RequirePermissions("matching.manage")
  externalItems(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.imports.externalItems(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post("external-items/:externalItemId/match")
  @RequirePermissions("matching.manage")
  confirmMatch(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("externalItemId") externalItemId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = confirmSupplierItemMatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.imports.confirmMatch(supplierOrganizationId, externalItemId, parsed.data, this.context(actorId, organizationId));
  }
}
