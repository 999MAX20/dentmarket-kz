import { Controller, Get, Headers, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { OperationsService } from "./operations.service";

@ApiTags("marketplace-operations")
@UseGuards(PermissionsGuard)
@Controller("operations")
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get("work-queue")
  @RequirePermissions("organization.view")
  workQueue(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) {
    return this.operations.workQueue({ actorId, organizationId });
  }
}
