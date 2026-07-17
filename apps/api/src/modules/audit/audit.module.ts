import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  imports: [AccessControlModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}
