import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { createIntegrationBindingSchema, createIntegrationConnectionSchema, enqueueIntegrationJobSchema, reconciliationQuerySchema, resolveReconciliationSchema, updateIntegrationConnectionSchema, upsertIntegrationMappingSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { IntegrationJobsService } from "./integration-jobs.service";
import { IntegrationsService } from "./integrations.service";

@ApiTags("integrations")
@UseGuards(PermissionsGuard)
@Controller("suppliers/:supplierOrganizationId/integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService, private readonly jobs: IntegrationJobsService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get()
  @RequirePermissions("integration.view")
  list(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.integrations.list(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Get("onboarding/readiness")
  @RequirePermissions("integration.view")
  onboardingReadiness(@Param("supplierOrganizationId") supplierOrganizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.integrations.onboardingReadiness(supplierOrganizationId, this.context(actorId, organizationId));
  }

  @Post()
  @RequirePermissions("integration.manage")
  create(@Param("supplierOrganizationId") supplierOrganizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createIntegrationConnectionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.integrations.create(supplierOrganizationId, parsed.data, this.context(actorId, organizationId));
  }

  @Get(":connectionId")
  @RequirePermissions("integration.view")
  get(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.integrations.get(supplierOrganizationId, connectionId, this.context(actorId, organizationId));
  }

  @Patch(":connectionId")
  @RequirePermissions("integration.manage")
  update(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = updateIntegrationConnectionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.integrations.update(supplierOrganizationId, connectionId, parsed.data, this.context(actorId, organizationId));
  }

  @Post(":connectionId/bindings")
  @RequirePermissions("integration.manage")
  createBinding(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createIntegrationBindingSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.integrations.createBinding(supplierOrganizationId, connectionId, parsed.data, this.context(actorId, organizationId));
  }

  @Delete(":connectionId/bindings/:bindingId")
  @RequirePermissions("integration.manage")
  deleteBinding(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Param("bindingId") bindingId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.integrations.deleteBinding(supplierOrganizationId, connectionId, bindingId, this.context(actorId, organizationId));
  }

  @Post(":connectionId/mappings")
  @RequirePermissions("integration.manage")
  upsertMapping(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = upsertIntegrationMappingSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.integrations.upsertMapping(supplierOrganizationId, connectionId, parsed.data, this.context(actorId, organizationId));
  }

  @Delete(":connectionId/mappings/:mappingId")
  @RequirePermissions("integration.manage")
  deleteMapping(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Param("mappingId") mappingId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.integrations.deleteMapping(supplierOrganizationId, connectionId, mappingId, this.context(actorId, organizationId));
  }

  @Get(":connectionId/jobs")
  @RequirePermissions("integration.view")
  async listJobs(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    await this.integrations.requireConnection(supplierOrganizationId, connectionId, this.context(actorId, organizationId));
    return this.jobs.list(connectionId);
  }

  @Post(":connectionId/jobs")
  @RequirePermissions("integration.manage")
  async enqueueJob(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = enqueueIntegrationJobSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    await this.integrations.requireConnection(supplierOrganizationId, connectionId, this.context(actorId, organizationId));
    return this.jobs.enqueue(connectionId, parsed.data);
  }

  @Post(":connectionId/agent/enrollment")
  @RequirePermissions("integration.manage")
  rotateEnrollment(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.integrations.rotateAgentEnrollment(supplierOrganizationId, connectionId, this.context(actorId, organizationId));
  }

  @Get(":connectionId/reconciliation")
  @RequirePermissions("integration.reconcile")
  reconciliation(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Query() query: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = reconciliationQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.integrations.reconciliation(supplierOrganizationId, connectionId, parsed.data, this.context(actorId, organizationId));
  }

  @Post(":connectionId/reconciliation/:entryId/resolve")
  @RequirePermissions("integration.reconcile")
  resolveReconciliation(@Param("supplierOrganizationId") supplierOrganizationId: string, @Param("connectionId") connectionId: string, @Param("entryId") entryId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = resolveReconciliationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.integrations.resolveReconciliation(supplierOrganizationId, connectionId, entryId, parsed.data, this.context(actorId, organizationId));
  }
}
