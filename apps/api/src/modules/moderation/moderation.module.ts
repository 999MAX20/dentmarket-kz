import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";

@Module({ imports: [AccessControlModule], controllers: [ModerationController], providers: [ModerationService] })
export class ModerationModule {}
