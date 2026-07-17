import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { complianceEvaluationSchema, createComplianceRuleSchema, createOrganizationCredentialSchema, reviewComplianceCheckSchema, reviewOrganizationCredentialSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ComplianceService } from "./compliance.service";

@ApiTags("compliance")
@UseGuards(PermissionsGuard)
@Controller("compliance")
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }

  @Get("organizations/:organizationId/credentials")
  @RequirePermissions("compliance.view")
  credentials(@Param("organizationId") organizationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    return this.compliance.credentials(organizationId, this.context(actorId, actorOrganizationId));
  }

  @Post("organizations/:organizationId/credentials")
  @RequirePermissions("compliance.credential.manage")
  createCredential(@Param("organizationId") organizationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") actorOrganizationId: string) {
    const parsed = createOrganizationCredentialSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.compliance.createCredential(organizationId, parsed.data, this.context(actorId, actorOrganizationId));
  }

  @Post("credentials/:credentialId/review")
  @RequirePermissions("compliance.review")
  reviewCredential(@Param("credentialId") credentialId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = reviewOrganizationCredentialSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.compliance.reviewCredential(credentialId, parsed.data, this.context(actorId, organizationId));
  }

  @Get("rules")
  @RequirePermissions("compliance.view")
  rules() { return this.compliance.rules(); }

  @Post("rules")
  @RequirePermissions("compliance.rule.manage")
  createRule(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = createComplianceRuleSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.compliance.createRule(parsed.data, this.context(actorId, organizationId));
  }

  @Post("rules/:ruleId/activate")
  @RequirePermissions("compliance.rule.manage")
  activateRule(@Param("ruleId") ruleId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.compliance.activateRule(ruleId, this.context(actorId, organizationId));
  }

  @Post("rules/:ruleId/recheck")
  @RequirePermissions("compliance.rule.manage")
  recheckRule(@Param("ruleId") ruleId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.compliance.recheckRule(ruleId, this.context(actorId, organizationId));
  }

  @Get("checks")
  @RequirePermissions("compliance.view")
  checks(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.compliance.checks(this.context(actorId, organizationId));
  }

  @Post("checks/evaluate")
  @RequirePermissions("compliance.evaluate")
  evaluate(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = complianceEvaluationSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.compliance.evaluate(parsed.data, this.context(actorId, organizationId));
  }

  @Post("checks/:checkId/review")
  @RequirePermissions("compliance.review")
  reviewCheck(@Param("checkId") checkId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = reviewComplianceCheckSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.compliance.reviewCheck(checkId, parsed.data, this.context(actorId, organizationId));
  }
}
