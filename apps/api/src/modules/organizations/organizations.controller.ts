import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { createOrganizationSchema, switchOrganizationIndustrySchema } from "@marketplace/schemas";
import { OrganizationsService } from "./organizations.service";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";

@ApiTags("organizations")
@UseGuards(PermissionsGuard)
@Controller("organizations")
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @RequirePermissions("organization.view")
  list() {
    return this.organizations.list();
  }

  @Post()
  @RequirePermissions("organization.create")
  @ApiCreatedResponse({ description: "Organization and capabilities created atomically" })
  create(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.organizations.create(parsed.data, { actorId, organizationId });
  }

  @Patch(":organizationId/industry")
  @RequirePermissions("catalog.industry.switch")
  switchIndustry(@Param("organizationId") organizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") contextOrganizationId: string) {
    const parsed = switchOrganizationIndustrySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.organizations.switchIndustry(organizationId, parsed.data, { actorId, organizationId: contextOrganizationId });
  }
}
