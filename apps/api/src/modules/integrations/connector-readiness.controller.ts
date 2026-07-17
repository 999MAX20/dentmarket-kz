import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, UseGuards } from "@nestjs/common";
import { updateConnectorReadinessSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { ConnectorReadinessService } from "./connector-readiness.service";

@ApiTags("integration-readiness")
@UseGuards(PermissionsGuard)
@Controller("integrations/readiness")
export class ConnectorReadinessController {
  constructor(private readonly readiness: ConnectorReadinessService) {}

  @Get()
  @RequirePermissions("integration.view")
  list() { return this.readiness.list(); }

  @Patch(":providerCode")
  @RequirePermissions("integration.manage")
  update(@Param("providerCode") providerCode: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    const parsed = updateConnectorReadinessSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.readiness.update(providerCode, parsed.data, { actorId, organizationId });
  }
}
