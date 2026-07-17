import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { aiFeedbackSchema, createAiConversationSchema, sendAiMessageSchema } from "@marketplace/schemas";
import { ApiTags } from "@nestjs/swagger";
import { PermissionsGuard } from "../access-control/permissions.guard";
import { RequirePermissions } from "../access-control/require-permissions.decorator";
import { AiAssistantService } from "./ai-assistant.service";

@ApiTags("ai-assistant")
@UseGuards(PermissionsGuard)
@RequirePermissions("ai.use")
@Controller("ai")
export class AiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}
  private context(actorId: string, organizationId: string) { return { actorId, organizationId }; }
  @Post("conversations") create(@Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = createAiConversationSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.assistant.create(parsed.data.role, parsed.data.title, this.context(actorId, organizationId)); }
  @Get("conversations") list(@Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.assistant.list(this.context(actorId, organizationId)); }
  @Get("conversations/:conversationId/messages") messages(@Param("conversationId") conversationId: string, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { return this.assistant.messages(conversationId, this.context(actorId, organizationId)); }
  @Post("conversations/:conversationId/messages") send(@Param("conversationId") conversationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = sendAiMessageSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.assistant.send(conversationId, parsed.data, this.context(actorId, organizationId)); }
  @Post("conversations/:conversationId/feedback") feedback(@Param("conversationId") conversationId: string, @Body() body: unknown, @Headers("x-user-id") actorId: string, @Headers("x-organization-id") organizationId: string) { const parsed = aiFeedbackSchema.safeParse(body); if (!parsed.success) throw new BadRequestException(parsed.error.flatten()); return this.assistant.feedback(conversationId, parsed.data, this.context(actorId, organizationId)); }
}
