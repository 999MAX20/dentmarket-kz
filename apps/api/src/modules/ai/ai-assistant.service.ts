import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { SendAiMessageInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { EntitlementsService } from "../billing/entitlements.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { AiSafetyService } from "./ai-safety.service";
import { AiToolsService, type AiRole } from "./ai-tools.service";
import { OpenAiResponsesService } from "./openai-responses.service";

@Injectable()
export class AiAssistantService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService, private readonly safety: AiSafetyService, private readonly tools: AiToolsService, private readonly openai: OpenAiResponsesService) {}

  private async enabled(organizationId: string) {
    const entitlement = await this.entitlements.resolve(organizationId, "ai.assistant");
    if (!entitlement.enabled) throw new ForbiddenException("AI assistant is disabled for this organization");
  }

  async create(role: AiRole, title: string | null | undefined, context: SupplierActorContext) {
    await this.enabled(context.organizationId);
    return this.prisma.aiConversation.create({ data: { organizationId: context.organizationId, userId: context.actorId, role, title } });
  }

  async list(context: SupplierActorContext) { await this.enabled(context.organizationId); return this.prisma.aiConversation.findMany({ where: { organizationId: context.organizationId, userId: context.actorId }, orderBy: { updatedAt: "desc" }, take: 50 }); }

  private async conversation(id: string, context: SupplierActorContext) {
    const conversation = await this.prisma.aiConversation.findFirst({ where: { id, organizationId: context.organizationId, userId: context.actorId } });
    if (!conversation) throw new NotFoundException("AI conversation not found");
    if (conversation.status !== "ACTIVE") throw new ConflictException("AI conversation is not active");
    return conversation;
  }

  async messages(id: string, context: SupplierActorContext) { await this.conversation(id, context); return this.prisma.aiMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" }, take: 200 }); }

  async send(id: string, input: SendAiMessageInput, context: SupplierActorContext) {
    await this.enabled(context.organizationId);
    const conversation = await this.conversation(id, context);
    const inspection = this.safety.inspect(input.content);
    const userMessage = await this.prisma.aiMessage.create({ data: { conversationId: id, role: "user", content: this.safety.redact(input.content), safety: inspection } });
    if (!inspection.allowed) {
      await this.prisma.$transaction([this.prisma.aiConversation.update({ where: { id }, data: { status: "BLOCKED" } }), this.prisma.securityEvent.create({ data: { severity: "HIGH", type: "ai.prompt_injection.blocked", actorId: context.actorId, organizationId: context.organizationId, metadata: { conversationId: id, reasons: inspection.reasons } } })]);
      const blocked = await this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content: "Запрос заблокирован политикой безопасности. Помощник работает только с разрешёнными данными и не выполняет инструкции по обходу доступа.", safety: { blocked: true } } });
      return { message: blocked, blocked: true };
    }
    if (inspection.medicalAdviceRequested || inspection.criticalCommerceActionRequested) {
      const content = inspection.medicalAdviceRequested ? "Я могу помочь сравнить коммерческие условия и характеристики из каталога, но не даю медицинские рекомендации и не выбираю лечение вместо специалиста." : "Я могу объяснить данные и подготовить вариант действия, но публикация, блокировка, изменение цены, подтверждение заказа и платёж требуют отдельного полномочия и явного подтверждения человека.";
      const message = await this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content, safety: { refusedMedicalAdvice: inspection.medicalAdviceRequested, refusedCriticalCommerceAction: inspection.criticalCommerceActionRequested } } });
      return { message, blocked: false, refused: true };
    }

    if (input.confirmedToolExecutionId) return this.confirm(id, input.confirmedToolExecutionId, userMessage.id, conversation.role as AiRole, context);
    const plan = this.tools.plan(conversation.role as AiRole, input.content);
    const execution = await this.prisma.aiToolExecution.create({ data: { conversationId: id, messageId: userMessage.id, organizationId: context.organizationId, userId: context.actorId, toolName: plan.name, input: plan.input as Prisma.InputJsonValue, status: plan.requiresConfirmation ? "AWAITING_CONFIRMATION" : "RUNNING", requiresConfirmation: plan.requiresConfirmation } });
    if (plan.requiresConfirmation) {
      const message = await this.prisma.aiMessage.create({ data: { conversationId: id, role: "assistant", content: "Для создания обращения требуется подтверждение. Проверьте текст и подтвердите действие.", safety: { toolExecutionId: execution.id, requiresConfirmation: true, toolName: plan.name } } });
      return { message, toolExecution: execution, requiresConfirmation: true };
    }
    return this.run(id, execution.id, plan, input.content, conversation.role as AiRole, context);
  }

  private async confirm(conversationId: string, executionId: string, messageId: string, role: AiRole, context: SupplierActorContext) {
    const execution = await this.prisma.aiToolExecution.findFirst({ where: { id: executionId, conversationId, organizationId: context.organizationId, userId: context.actorId, status: "AWAITING_CONFIRMATION", requiresConfirmation: true } });
    if (!execution) throw new NotFoundException("Pending AI action not found");
    await this.prisma.aiToolExecution.update({ where: { id: execution.id }, data: { status: "RUNNING", confirmedAt: new Date(), messageId } });
    return this.run(conversationId, execution.id, { name: execution.toolName, input: execution.input as Record<string, unknown>, requiresConfirmation: true }, "Подтверждаю действие", role, context);
  }

  private async run(conversationId: string, executionId: string, plan: { name: string; input: Record<string, unknown>; requiresConfirmation: boolean }, question: string, role: AiRole, context: SupplierActorContext) {
    const startedAt = Date.now();
    try {
      const result = await this.tools.execute(plan, { userId: context.actorId, organizationId: context.organizationId, role });
      const model = await this.openai.summarize({ role, question, toolName: plan.name, toolOutput: result }).catch(() => null);
      const content = model?.text ?? this.localSummary(plan.name, result);
      const message = await this.prisma.$transaction(async (tx) => {
        const created = await tx.aiMessage.create({ data: { conversationId, role: "assistant", content, model: model?.model ?? "deterministic-tool-summary", tokenUsage: model?.usage as Prisma.InputJsonValue | undefined, safety: { authorizedTool: plan.name, responseId: model?.responseId } } });
        await tx.aiToolExecution.update({ where: { id: executionId }, data: { status: "SUCCEEDED", outputSummary: this.tools.json(result), durationMs: Date.now() - startedAt } });
        await tx.aiConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        return created;
      });
      return { message, tool: { id: executionId, name: plan.name, result }, requiresConfirmation: false };
    } catch (error) {
      await this.prisma.aiToolExecution.update({ where: { id: executionId }, data: { status: "FAILED", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message.slice(0, 500) : "Unknown tool error" } });
      throw error;
    }
  }

  private localSummary(toolName: string, result: unknown) {
    const rows = Array.isArray(result) ? result.length : typeof result === "object" && result ? Object.keys(result).length : 0;
    if (toolName === "create_support_ticket" && result && typeof result === "object" && "number" in result) return `Обращение ${(result as { number: string }).number} создано и передано в поддержку.`;
    if (rows === 0) return "По разрешённому источнику данных ничего не найдено.";
    return `Проверил разрешённый источник «${toolName}». Получено записей: ${rows}. Подробности доступны в структурированном результате.`;
  }

  async feedback(conversationId: string, input: { messageId?: string | null; rating: number; comment?: string | null }, context: SupplierActorContext) {
    await this.conversation(conversationId, context);
    if (input.messageId && !await this.prisma.aiMessage.findFirst({ where: { id: input.messageId, conversationId } })) throw new NotFoundException("AI message not found");
    return this.prisma.aiFeedback.create({ data: { conversationId, messageId: input.messageId, userId: context.actorId, rating: input.rating, comment: input.comment } });
  }
}
