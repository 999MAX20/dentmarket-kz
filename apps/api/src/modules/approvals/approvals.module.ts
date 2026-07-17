import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { ApprovalPoliciesController } from "./approval-policies.controller";
import { ApprovalPoliciesService } from "./approval-policies.service";

@Module({
  imports: [AccessControlModule],
  controllers: [ApprovalPoliciesController],
  providers: [ApprovalPoliciesService],
})
export class ApprovalsModule {}
