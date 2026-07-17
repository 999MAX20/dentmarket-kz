import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AddSupportMessageInput, CreateSupportTicketInput, UpdateSupportTicketInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

const slaHours = { LOW: 72, NORMAL: 24, HIGH: 8, URGENT: 2 } as const;

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async requireTicket(ticketId: string, context: SupplierActorContext) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || (ticket.organizationId !== context.organizationId && !(await this.isOperator(context.organizationId)))) throw new NotFoundException("Support ticket not found");
    return ticket;
  }

  async create(input: CreateSupportTicketInput, context: SupplierActorContext) {
    const number = `SUP-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.create({ data: { number, organizationId: context.organizationId, requesterId: context.actorId, subject: input.subject, description: input.description, category: input.category, priority: input.priority, slaDueAt: new Date(Date.now() + slaHours[input.priority] * 3_600_000) } });
      if (input.links.length) await tx.supportLink.createMany({ data: input.links.map((link) => ({ ticketId: ticket.id, ...link })) });
      await tx.supportMessage.create({ data: { ticketId: ticket.id, authorId: context.actorId, body: input.description } });
      await tx.auditLog.create({ data: { ...context, action: "support.ticket.created", entityType: "SupportTicket", entityId: ticket.id, after: { number, priority: input.priority, category: input.category, links: input.links } } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupportTicket", aggregateId: ticket.id, eventType: "SupportTicketCreated", payload: { ticketId: ticket.id, number, organizationId: context.organizationId, priority: input.priority } } });
      return ticket;
    });
  }

  async list(context: SupplierActorContext, status?: string) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.supportTicket.findMany({ where: { organizationId: operator ? undefined : context.organizationId, status: status as never }, orderBy: [{ priority: "desc" }, { slaDueAt: "asc" }, { updatedAt: "desc" }], take: 200 });
  }

  async get(ticketId: string, context: SupplierActorContext) {
    const ticket = await this.requireTicket(ticketId, context);
    const operator = await this.isOperator(context.organizationId);
    const [messages, links] = await Promise.all([this.prisma.supportMessage.findMany({ where: { ticketId, isInternal: operator ? undefined : false }, orderBy: { createdAt: "asc" } }), this.prisma.supportLink.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } })]);
    return { ...ticket, messages, links };
  }

  async addMessage(ticketId: string, input: AddSupportMessageInput, context: SupplierActorContext) {
    const ticket = await this.requireTicket(ticketId, context);
    const operator = await this.isOperator(context.organizationId);
    if (input.isInternal && !operator) throw new ForbiddenException("Internal notes are available only to support operators");
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.supportMessage.create({ data: { ticketId, authorId: context.actorId, body: input.body, isInternal: input.isInternal, attachments: input.attachments as Prisma.InputJsonValue } });
      const patch = operator && !ticket.firstResponseAt ? { firstResponseAt: new Date(), status: "IN_PROGRESS" as const } : !operator && ticket.status === "WAITING_CUSTOMER" ? { status: "IN_PROGRESS" as const } : {};
      await tx.supportTicket.update({ where: { id: ticketId }, data: patch });
      await tx.auditLog.create({ data: { ...context, action: input.isInternal ? "support.note.added" : "support.message.added", entityType: "SupportTicket", entityId: ticketId, after: { messageId: message.id, attachmentCount: input.attachments.length } } });
      return message;
    });
  }

  async update(ticketId: string, input: UpdateSupportTicketInput, context: SupplierActorContext) {
    const ticket = await this.requireTicket(ticketId, context);
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only support operators can manage ticket workflow");
    const now = new Date();
    const updated = await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { ...input, resolvedAt: input.status === "RESOLVED" ? now : ticket.resolvedAt, closedAt: input.status === "CLOSED" ? now : ticket.closedAt } });
    await this.prisma.auditLog.create({ data: { ...context, action: "support.ticket.updated", entityType: "SupportTicket", entityId: ticketId, before: { status: ticket.status, priority: ticket.priority, assigneeId: ticket.assigneeId }, after: input as Prisma.InputJsonValue } });
    return updated;
  }

  async startImpersonation(input: { targetUserId: string; targetOrganizationId: string; ticketId?: string | null; reason: string; durationMinutes: number }, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only support operators can start impersonation");
    const membership = await this.prisma.organizationMembership.findUnique({ where: { userId_organizationId: { userId: input.targetUserId, organizationId: input.targetOrganizationId } } });
    if (membership?.status !== "ACTIVE") throw new NotFoundException("Active target membership not found");
    if (input.ticketId) await this.requireTicket(input.ticketId, context);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.supportImpersonationSession.create({ data: { operatorId: context.actorId, targetUserId: input.targetUserId, targetOrganizationId: input.targetOrganizationId, ticketId: input.ticketId, reason: input.reason, expiresAt: new Date(Date.now() + input.durationMinutes * 60_000) } });
      await tx.auditLog.create({ data: { ...context, action: "support.impersonation.started", entityType: "SupportImpersonationSession", entityId: session.id, after: { targetUserId: input.targetUserId, targetOrganizationId: input.targetOrganizationId, ticketId: input.ticketId, reason: input.reason, expiresAt: session.expiresAt } } });
      await tx.securityEvent.create({ data: { severity: "HIGH", type: "support.impersonation.started", actorId: context.actorId, organizationId: input.targetOrganizationId, sessionId: session.id, metadata: { ticketId: input.ticketId, reason: input.reason } } });
      return session;
    });
  }

  async endImpersonation(sessionId: string, context: SupplierActorContext) {
    const session = await this.prisma.supportImpersonationSession.findFirst({ where: { id: sessionId, operatorId: context.actorId, endedAt: null } });
    if (!session) throw new NotFoundException("Active impersonation session not found");
    const ended = await this.prisma.supportImpersonationSession.update({ where: { id: sessionId }, data: { endedAt: new Date() } });
    await this.prisma.auditLog.create({ data: { ...context, action: "support.impersonation.ended", entityType: "SupportImpersonationSession", entityId: sessionId, before: { targetOrganizationId: session.targetOrganizationId }, after: { endedAt: ended.endedAt } } });
    return ended;
  }

  knowledge(audience?: string, query?: string) {
    return this.prisma.knowledgeArticle.findMany({ where: { status: "ACTIVE", publishedAt: { lte: new Date() }, audience: audience ? { has: audience } : undefined, OR: query ? [{ title: { contains: query, mode: "insensitive" } }, { summary: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } }] : undefined }, select: { id: true, slug: true, title: true, summary: true, audience: true, tags: true, publishedAt: true }, orderBy: { publishedAt: "desc" }, take: 30 });
  }
}
