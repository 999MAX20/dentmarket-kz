import { Global, Module } from "@nestjs/common";
import { AccessControlController } from "./access-control.controller";
import { AccessControlService } from "./access-control.service";
import { PermissionsGuard } from "./permissions.guard";
import { RoleManagementController } from "./role-management.controller";
import { RoleManagementService } from "./role-management.service";

@Global()
@Module({
  controllers: [AccessControlController, RoleManagementController],
  providers: [AccessControlService, PermissionsGuard, RoleManagementService],
  exports: [AccessControlService, PermissionsGuard],
})
export class AccessControlModule {}
