import { Controller, Get, Headers, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AccessControlService } from "./access-control.service";

@ApiTags("access-control")
@Controller("access-control")
export class AccessControlController {
  constructor(private readonly access: AccessControlService) {}

  @Get("permissions")
  permissions(@Headers("x-user-id") userId?: string, @Headers("x-organization-id") organizationId?: string) {
    if (!userId || !organizationId) throw new UnauthorizedException("Active user and organization context are required");
    return this.access.permissionsFor(userId, organizationId);
  }
}
