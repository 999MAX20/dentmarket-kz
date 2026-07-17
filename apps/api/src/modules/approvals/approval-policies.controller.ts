import { BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { createApprovalPolicySchema, evaluateApprovalSchema, updateApprovalPolicySchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ApprovalPoliciesService } from "./approval-policies.service";

@ApiTags("approval-policies")
@UseGuards(PermissionsGuard)
@Controller("organizations/:organizationId/approval-policies")
export class ApprovalPoliciesController {
  constructor(private readonly policies: ApprovalPoliciesService) {}

  private context(actorId: string, organizationId: string) {
    return { actorId, organizationId };
  }

  @Get()
  @RequirePermissions("approval.manage")
  list(@Param("organizationId") organizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") activeOrganizationId: string) {
    return this.policies.list(organizationId, this.context(actorId, activeOrganizationId));
  }

  @Post()
  @RequirePermissions("approval.manage")
  create(@Param("organizationId") organizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") activeOrganizationId: string) {
    const parsed = createApprovalPolicySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.policies.create(organizationId, parsed.data, this.context(actorId, activeOrganizationId));
  }

  @Patch(":policyId")
  @RequirePermissions("approval.manage")
  update(@Param("organizationId") organizationId: string, @Param("policyId") policyId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") activeOrganizationId: string) {
    const parsed = updateApprovalPolicySchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.policies.update(organizationId, policyId, parsed.data, this.context(actorId, activeOrganizationId));
  }

  @Post("evaluate")
  @HttpCode(HttpStatus.OK)
  @RequirePermissions("order.approve")
  evaluate(@Param("organizationId") organizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") activeOrganizationId: string) {
    const parsed = evaluateApprovalSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.policies.evaluate(organizationId, parsed.data, this.context(actorId, activeOrganizationId));
  }
}
