import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { assignMembershipRoleSchema, createRoleSchema, updateMembershipSchema } from "@marketplace/schemas";
import { PermissionsGuard } from "./permissions.guard";
import { RequirePermissions } from "./require-permissions.decorator";
import { RoleManagementService } from "./role-management.service";

@ApiTags("access-control")
@UseGuards(PermissionsGuard)
@Controller("organizations/:organizationId")
export class RoleManagementController {
  constructor(private readonly roles: RoleManagementService) {}

  private assertActiveOrganization(organizationId: string, activeOrganizationId: string) {
    if (organizationId !== activeOrganizationId) throw new ForbiddenException("Resource must belong to the active organization");
  }

  @Get("roles")
  @RequirePermissions("organization.roles.manage")
  listRoles(@Param("organizationId") organizationId: string, @Headers("x-organization-id") activeOrganizationId: string) {
    this.assertActiveOrganization(organizationId, activeOrganizationId);
    return this.roles.listRoles(organizationId);
  }

  @Post("roles")
  @RequirePermissions("organization.roles.manage")
  createRole(@Param("organizationId") organizationId: string, @Headers("x-organization-id") activeOrganizationId: string, @Headers("x-user-id") actorId: string, @Body() body: unknown) {
    this.assertActiveOrganization(organizationId, activeOrganizationId);
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.roles.createRole(organizationId, actorId, parsed.data);
  }

  @Get("memberships")
  @RequirePermissions("organization.members.manage")
  memberships(@Param("organizationId") organizationId: string, @Headers("x-organization-id") activeOrganizationId: string) {
    this.assertActiveOrganization(organizationId, activeOrganizationId);
    return this.roles.listMemberships(organizationId);
  }

  @Patch("memberships/:membershipId")
  @RequirePermissions("organization.members.manage")
  updateMembership(@Param("organizationId") organizationId: string, @Param("membershipId") membershipId: string, @Headers("x-organization-id") activeOrganizationId: string, @Headers("x-user-id") actorId: string, @Body() body: unknown) {
    this.assertActiveOrganization(organizationId, activeOrganizationId);
    const parsed = updateMembershipSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.roles.updateMembership(organizationId, membershipId, actorId, parsed.data);
  }

  @Post("memberships/:membershipId/roles")
  @RequirePermissions("organization.members.manage", "organization.roles.manage")
  assignRole(@Param("organizationId") organizationId: string, @Param("membershipId") membershipId: string, @Headers("x-organization-id") activeOrganizationId: string, @Headers("x-user-id") actorId: string, @Body() body: unknown) {
    this.assertActiveOrganization(organizationId, activeOrganizationId);
    const parsed = assignMembershipRoleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.roles.assignRole(organizationId, membershipId, parsed.data.roleId, actorId);
  }

  @Delete("memberships/:membershipId/roles/:roleId")
  @RequirePermissions("organization.members.manage", "organization.roles.manage")
  removeRole(@Param("organizationId") organizationId: string, @Param("membershipId") membershipId: string, @Param("roleId") roleId: string, @Headers("x-organization-id") activeOrganizationId: string, @Headers("x-user-id") actorId: string) {
    this.assertActiveOrganization(organizationId, activeOrganizationId);
    return this.roles.removeRole(organizationId, membershipId, roleId, actorId);
  }
}
