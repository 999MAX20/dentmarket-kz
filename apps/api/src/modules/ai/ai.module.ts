import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { AiSafetyService } from "./ai-safety.service";
import { AiToolsService } from "./ai-tools.service";
import { OpenAiResponsesService } from "./openai-responses.service";

@Module({ imports: [BillingModule], controllers: [AiAssistantController], providers: [AiAssistantService, AiSafetyService, AiToolsService, OpenAiResponsesService] })
export class AiModule {}
