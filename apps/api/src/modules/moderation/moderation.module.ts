import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";
import { ProductCorrectionsController } from "./product-corrections.controller";
import { ProductCorrectionsService } from "./product-corrections.service";

@Module({ imports: [AccessControlModule], controllers: [ModerationController, ProductCorrectionsController], providers: [ModerationService, ProductCorrectionsService] })
export class ModerationModule {}
