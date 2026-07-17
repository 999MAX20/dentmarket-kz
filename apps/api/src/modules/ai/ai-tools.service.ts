import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

export type AiRole = "BUYER" | "SUPPLIER" | "OPERATOR" | "SUPPORT";
export type ToolPlan = { name: string; input: Record<string, unknown>; requiresConfirmation: boolean };

@Injectable()
export class AiToolsService {
  constructor(private readonly prisma: PrismaService) {}

  plan(role: AiRole, content: string): ToolPlan {
    const normalized = content.toLocaleLowerCase("ru");
    if (/(созда|открой).{0,20}(обращ|тикет|заявк)|support ticket/.test(normalized)) return { name: "create_support_ticket", input: { subject: "Обращение из AI-помощника", description: content.slice(0, 2_000), category: "AI_ASSISTED" }, requiresConfirmation: true };
    if (role === "BUYER" && /(заказ|достав|статус)/.test(normalized)) return { name: "list_buyer_orders", input: {}, requiresConfirmation: false };
    if (role === "BUYER" && /(бюджет|расход|аналит)/.test(normalized)) return { name: "buyer_owner_summary", input: {}, requiresConfirmation: false };
    if (role === "BUYER" && /(рекоменд|выгод|сроч|над[её]жн|рейтинг|город|географ)/.test(normalized)) return { name: "buyer_smart_commerce_context", input: {}, requiresConfirmation: false };
    if (role === "SUPPLIER" && /(интеграц|синхрон|1с|мойсклад)/.test(normalized)) return { name: "supplier_integration_health", input: {}, requiresConfirmation: false };
    if (role === "SUPPLIER" && /(заказ|подтверд|продаж)/.test(normalized)) return { name: "list_supplier_orders", input: {}, requiresConfirmation: false };
    if (role === "SUPPLIER" && /(рейтинг|отзыв|довер|географ|склад)/.test(normalized)) return { name: "supplier_trust_context", input: {}, requiresConfirmation: false };
    if ((role === "OPERATOR" || role === "SUPPORT") && /(обращ|тикет|sla|поддерж)/.test(normalized)) return { name: "support_queue", input: {}, requiresConfirmation: false };
    if ((role === "OPERATOR" || role === "SUPPORT") && /(инцидент|апелляц|рейтинг|отзыв|довер|географ)/.test(normalized)) return { name: "trust_operations_queue", input: {}, requiresConfirmation: false };
    const query = content.replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    return { name: "search_catalog", input: { query }, requiresConfirmation: false };
  }

  async execute(plan: ToolPlan, context: { userId: string; organizationId: string; role: AiRole }) {
    switch (plan.name) {
      case "search_catalog": {
        const query = String(plan.input.query ?? "");
        const products = await this.prisma.product.findMany({ where: { status: "ACTIVE", canonicalName: { contains: query, mode: "insensitive" } }, select: { id: true, canonicalName: true, productType: true, regulatoryClass: true, variants: { where: { status: "ACTIVE" }, select: { id: true, sku: true, gtin: true }, take: 5 } }, take: 10 });
        return { query, products };
      }
      case "list_buyer_orders":
        return this.prisma.supplierOrder.findMany({ where: { buyerOrganizationId: context.organizationId }, select: { id: true, orderNumber: true, status: true, paymentStatus: true, subtotalAmountMinor: true, currency: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 10 });
      case "buyer_owner_summary": {
        const [orders, budgets] = await Promise.all([this.prisma.supplierOrder.aggregate({ where: { buyerOrganizationId: context.organizationId }, _count: true, _sum: { subtotalAmountMinor: true } }), this.prisma.purchaseBudget.findMany({ where: { organizationId: context.organizationId, periodEnd: { gte: new Date() } }, select: { name: true, limitMinor: true, committedMinor: true, spentMinor: true, currency: true, periodEnd: true }, take: 20 })]);
        return { orders, budgets };
      }
      case "buyer_smart_commerce_context": {
        const [addresses, recentRecommendations] = await Promise.all([
          this.prisma.address.findMany({ where: { organizationId: context.organizationId }, select: { id: true, line1: true, city: { select: { nameRu: true } }, geoStatus: true }, take: 20 }),
          this.prisma.recommendationDecision.findMany({ where: { buyerOrganizationId: context.organizationId }, select: { productId: true, mode: true, result: true, formulaVersion: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 5 }),
        ]);
        return { addresses, recentRecommendations, guardrails: { medicalAdvice: false, automaticOrder: false, explanationRequired: true } };
      }
      case "supplier_integration_health":
        return this.prisma.integrationConnection.findMany({ where: { supplierOrganizationId: context.organizationId }, select: { provider: true, status: true, lastSuccessAt: true, lastErrorAt: true, lastError: true, consecutiveFailures: true }, take: 20 });
      case "list_supplier_orders":
        return this.prisma.supplierOrder.findMany({ where: { supplierOrganizationId: context.organizationId }, select: { id: true, orderNumber: true, status: true, paymentStatus: true, subtotalAmountMinor: true, currency: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 10 });
      case "supplier_trust_context": {
        const [rating, reviews, warehouses, incidents] = await Promise.all([
          this.prisma.supplierTrustSnapshot.findUnique({ where: { supplierOrganizationId: context.organizationId }, select: { status: true, score: true, confidence: true, eventCount: true, indicators: true, factors: true, recommendations: true, computedAt: true } }),
          this.prisma.verifiedReview.findMany({ where: { supplierOrganizationId: context.organizationId }, select: { overallRating: true, dimensions: true, comment: true, status: true, officialResponse: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }),
          this.prisma.warehouse.findMany({ where: { supplierOrganizationId: context.organizationId }, select: { name: true, city: { select: { nameRu: true } }, geoStatus: true, geoVerifiedAt: true }, take: 50 }),
          this.prisma.productGapIncident.findMany({ where: { impactedOrganizationId: context.organizationId, status: { not: "RESOLVED" } }, select: { type: true, severity: true, actionType: true, explanation: true, remediation: true, restorationCondition: true }, take: 30 }),
        ]);
        return { rating, reviews, warehouses, incidents };
      }
      case "support_queue":
        return this.prisma.supportTicket.findMany({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] } }, select: { number: true, subject: true, status: true, priority: true, category: true, slaDueAt: true, updatedAt: true }, orderBy: [{ priority: "desc" }, { slaDueAt: "asc" }], take: 30 });
      case "trust_operations_queue":
        return this.prisma.productGapIncident.findMany({ where: { status: { in: ["OPEN", "SOFT_ACTION_ACTIVE", "UNDER_APPEAL", "HARD_BLOCKED"] } }, select: { id: true, impactedOrganizationId: true, subjectType: true, subjectId: true, type: true, severity: true, status: true, actionType: true, explanation: true, remediation: true, restorationCondition: true, actionExpiresAt: true, appeals: { select: { id: true, status: true, reason: true, createdAt: true } } }, orderBy: [{ severity: "desc" }, { createdAt: "asc" }], take: 50 });
      case "create_support_ticket": {
        const number = `SUP-AI-${Date.now()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
        return this.prisma.$transaction(async (tx) => {
          const ticket = await tx.supportTicket.create({ data: { number, organizationId: context.organizationId, requesterId: context.userId, subject: String(plan.input.subject), description: String(plan.input.description), category: String(plan.input.category), priority: "NORMAL", slaDueAt: new Date(Date.now() + 24 * 3_600_000) } });
          await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: context.userId, body: ticket.description } });
          await tx.auditLog.create({ data: { actorId: context.userId, organizationId: context.organizationId, action: "support.ticket.ai_created", entityType: "SupportTicket", entityId: ticket.id, after: { number, category: ticket.category } } });
          return { id: ticket.id, number: ticket.number, status: ticket.status };
        });
      }
      default: throw new Error(`AI tool is not allowlisted: ${plan.name}`);
    }
  }

  json(value: unknown) { return JSON.parse(JSON.stringify(value, (_key, current) => typeof current === "bigint" ? current.toString() : current)) as Prisma.InputJsonValue; }
}
