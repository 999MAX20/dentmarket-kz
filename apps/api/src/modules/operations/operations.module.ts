import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { OperationsController } from "./operations.controller";
import { OperationsService } from "./operations.service";

@Module({ imports: [AccessControlModule], controllers: [OperationsController], providers: [OperationsService] })
export class OperationsModule {}
