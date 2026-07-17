import { BadRequestException, Body, Controller, ForbiddenException, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { acceptInvitationSchema, createInvitationSchema } from "@marketplace/schemas";
import { InvitationsService } from "./invitations.service";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";

@ApiTags("identity")
@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post("organizations/:organizationId/invitations")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("organization.members.manage")
  @ApiCreatedResponse({ description: "Invitation token is returned only once" })
  create(@Param("organizationId") organizationId: string, @Headers("x-organization-id") activeOrganizationId: string, @Body() body: unknown) {
    if (organizationId !== activeOrganizationId) throw new ForbiddenException("Invitation must target the active organization");
    const parsed = createInvitationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.invitations.create(organizationId, parsed.data);
  }

  @Post("invitations/accept")
  accept(@Body() body: unknown) {
    const parsed = acceptInvitationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.invitations.accept(parsed.data);
  }
}
