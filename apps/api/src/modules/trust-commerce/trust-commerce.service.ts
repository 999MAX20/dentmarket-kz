import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProductGapInput, CreateTrustAppealInput, CreateVerifiedReviewInput, DecideTrustAppealInput, RecordTrustMetricInput, UpdateProductGapInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { calculateSupplierTrust } from "./trust-score.engine";

const json = (value: unknown) => value == null ? Prisma.JsonNull : value as Prisma.InputJsonValue;
const reviewEligibleStatuses = ["DELIVERED", "PARTIALLY_FULFILLED", "RETURN_DISPUTE", "REJECTED", "CANCELLED"] as const;

@Injectable()
export class TrustCommerceService {
  constructor(private readonly prisma: PrismaService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async requireOrderParticipant(orderId: string, context: SupplierActorContext) {
    const order = await this.prisma.supplierOrder.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException("Supplier order not found");
    if (order.buyerOrganizationId !== context.organizationId && order.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new NotFoundException("Supplier order not found");
    return order;
  }

  async listIncidents(context: SupplierActorContext, status?: string) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.productGapIncident.findMany({
      where: { ...(operator ? {} : { OR: [{ impactedOrganizationId: context.organizationId }, { ownerOrganizationId: context.organizationId }] }), ...(status ? { status: status as never } : {}) },
      include: { appeals: { orderBy: { createdAt: "desc" } } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }], take: 300,
    });
  }

  async createIncident(input: CreateProductGapInput, context: SupplierActorContext) {
    if (input.actionType === "HARD_BLOCK" && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator may apply a hard block");
    const existing = await this.prisma.productGapIncident.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const status = input.actionType === "HARD_BLOCK" ? "HARD_BLOCKED" : input.actionType === "NONE" ? "OPEN" : "SOFT_ACTION_ACTIVE";
    return this.prisma.$transaction(async (tx) => {
      const incident = await tx.productGapIncident.create({ data: { ...input, ownerOrganizationId: context.organizationId, impactedOrganizationId: input.impactedOrganizationId, actionExpiresAt: input.actionExpiresAt ? new Date(input.actionExpiresAt) : null, status, createdById: context.actorId } });
      await tx.auditLog.create({ data: { ...context, action: "trust.incident.created", entityType: "ProductGapIncident", entityId: incident.id, after: { type: incident.type, severity: incident.severity, actionType: incident.actionType, explanation: incident.explanation, remediation: incident.remediation, restorationCondition: incident.restorationCondition } } });
      return incident;
    });
  }

  async updateIncident(id: string, input: UpdateProductGapInput, context: SupplierActorContext) {
    const incident = await this.prisma.productGapIncident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException("Product incident not found");
    if (!(await this.isOperator(context.organizationId)) && incident.ownerOrganizationId !== context.organizationId) throw new NotFoundException("Product incident not found");
    if ((input.actionType === "HARD_BLOCK" || input.status === "HARD_BLOCKED") && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator may apply a hard block");
    if (input.status === "RESOLVED" && !input.resolution) throw new ConflictException("Resolution is required before restoring the affected flow");
    const changed = await this.prisma.productGapIncident.updateMany({ where: { id, version: input.version }, data: { status: input.status, actionType: input.actionType, actionExpiresAt: input.actionExpiresAt === undefined ? undefined : input.actionExpiresAt ? new Date(input.actionExpiresAt) : null, resolution: input.resolution, explanation: input.explanation, remediation: input.remediation, restorationCondition: input.restorationCondition, resolvedAt: input.status === "RESOLVED" ? new Date() : null, resolvedById: input.status === "RESOLVED" ? context.actorId : null, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Incident changed; reload before updating");
    const updated = await this.prisma.productGapIncident.findUniqueOrThrow({ where: { id } });
    await this.prisma.auditLog.create({ data: { ...context, action: "trust.incident.updated", entityType: "ProductGapIncident", entityId: id, before: { status: incident.status, actionType: incident.actionType, version: incident.version }, after: { status: updated.status, actionType: updated.actionType, version: updated.version, resolution: updated.resolution } } });
    return updated;
  }

  async appealIncident(id: string, input: CreateTrustAppealInput, context: SupplierActorContext) {
    const incident = await this.prisma.productGapIncident.findUnique({ where: { id } });
    if (!incident || (incident.impactedOrganizationId !== context.organizationId && incident.ownerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId)))) throw new NotFoundException("Product incident not found");
    const existing = await this.prisma.productGapAppeal.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const appeal = await tx.productGapAppeal.create({ data: { incidentId: id, appellantOrganizationId: context.organizationId, appellantUserId: context.actorId, reason: input.reason, evidence: json(input.evidence), idempotencyKey: input.idempotencyKey } });
      await tx.productGapIncident.update({ where: { id }, data: { status: "UNDER_APPEAL", version: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "trust.incident.appealed", entityType: "ProductGapAppeal", entityId: appeal.id, after: { incidentId: id, reason: input.reason } } });
      return appeal;
    });
  }

  async decideIncidentAppeal(appealId: string, input: DecideTrustAppealInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator may decide an appeal");
    const appeal = await this.prisma.productGapAppeal.findUnique({ where: { id: appealId }, include: { incident: true } });
    if (!appeal) throw new NotFoundException("Appeal not found");
    const changed = await this.prisma.productGapAppeal.updateMany({ where: { id: appealId, version: input.version, status: { in: ["OPEN", "UNDER_REVIEW"] } }, data: { status: input.status, decision: input.decision, decidedById: context.actorId, decidedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Appeal changed; reload before deciding");
    const incidentStatus = input.status === "UPHELD" ? "RESOLVED" : appeal.incident.actionType === "HARD_BLOCK" ? "HARD_BLOCKED" : "SOFT_ACTION_ACTIVE";
    await this.prisma.$transaction([
      this.prisma.productGapIncident.update({ where: { id: appeal.incidentId }, data: { status: incidentStatus, resolution: input.status === "UPHELD" ? input.decision : appeal.incident.resolution, resolvedAt: input.status === "UPHELD" ? new Date() : appeal.incident.resolvedAt, resolvedById: input.status === "UPHELD" ? context.actorId : appeal.incident.resolvedById, version: { increment: 1 } } }),
      this.prisma.auditLog.create({ data: { ...context, action: "trust.incident.appeal_decided", entityType: "ProductGapAppeal", entityId: appealId, after: { status: input.status, decision: input.decision } } }),
    ]);
    return this.prisma.productGapAppeal.findUniqueOrThrow({ where: { id: appealId } });
  }

  async orderComments(orderId: string, context: SupplierActorContext) {
    await this.requireOrderParticipant(orderId, context);
    return this.prisma.orderPrivateComment.findMany({ where: { supplierOrderId: orderId }, orderBy: { createdAt: "asc" } });
  }

  async createOrderComment(orderId: string, input: { body: string; idempotencyKey: string }, context: SupplierActorContext) {
    await this.requireOrderParticipant(orderId, context);
    const existing = await this.prisma.orderPrivateComment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    const comment = await this.prisma.orderPrivateComment.create({ data: { supplierOrderId: orderId, authorOrganizationId: context.organizationId, authorUserId: context.actorId, body: input.body, idempotencyKey: input.idempotencyKey } });
    await this.prisma.auditLog.create({ data: { ...context, action: "trust.order_comment.created", entityType: "OrderPrivateComment", entityId: comment.id, after: { supplierOrderId: orderId } } });
    return comment;
  }

  async updateOrderComment(commentId: string, input: { body: string; version: number }, context: SupplierActorContext) {
    const comment = await this.prisma.orderPrivateComment.findFirst({ where: { id: commentId, authorOrganizationId: context.organizationId, authorUserId: context.actorId } });
    if (!comment) throw new NotFoundException("Order comment not found");
    const changed = await this.prisma.orderPrivateComment.updateMany({ where: { id: commentId, version: input.version }, data: { body: input.body, editedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Comment changed; reload before updating");
    return this.prisma.orderPrivateComment.findUniqueOrThrow({ where: { id: commentId } });
  }

  private reviewAnomalies(comment: string | null | undefined, recentCount: number) {
    const flags: string[] = [];
    if (comment && /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:\+?7|8)[\s()-]*\d{3}[\s()-]*\d{3}[\s-]*\d{2}[\s-]*\d{2})/.test(comment)) flags.push("possible_personal_data");
    if (recentCount >= 5) flags.push("review_burst");
    return flags;
  }

  async createReview(orderId: string, input: CreateVerifiedReviewInput, context: SupplierActorContext) {
    const order = await this.requireOrderParticipant(orderId, context);
    if (order.buyerOrganizationId !== context.organizationId) throw new ForbiddenException("Only the buyer organization may review an order");
    if (!(reviewEligibleStatuses as readonly string[]).includes(order.status)) throw new ConflictException("Review becomes available only after a completed, cancelled or disputed order");
    if (input.productVariantId && !order.items.some(({ productVariantId }) => productVariantId === input.productVariantId)) throw new NotFoundException("Purchased product variant not found in this order");
    const targetKey = input.productVariantId ? `PRODUCT:${input.productVariantId}` : "SUPPLIER";
    const existing = await this.prisma.verifiedReview.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    if (await this.prisma.verifiedReview.findUnique({ where: { supplierOrderId_reviewerOrganizationId_targetKey: { supplierOrderId: order.id, reviewerOrganizationId: context.organizationId, targetKey } } })) throw new ConflictException("This organization already reviewed this order execution");
    const recentCount = await this.prisma.verifiedReview.count({ where: { reviewerOrganizationId: context.organizationId, supplierOrganizationId: order.supplierOrganizationId, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
    const anomalyFlags = this.reviewAnomalies(input.comment, recentCount);
    return this.prisma.$transaction(async (tx) => {
      const review = await tx.verifiedReview.create({ data: { supplierOrderId: order.id, reviewerOrganizationId: context.organizationId, reviewerUserId: context.actorId, supplierOrganizationId: order.supplierOrganizationId, productVariantId: input.productVariantId, targetKey, overallRating: input.overallRating, dimensions: input.dimensions, comment: input.comment, status: anomalyFlags.length ? "PENDING" : "PUBLISHED", anomalyFlags, editDeadline: new Date(Date.now() + 14 * 86_400_000), idempotencyKey: input.idempotencyKey } });
      await tx.verifiedReviewRevision.create({ data: { reviewId: review.id, version: 1, snapshot: { overallRating: review.overallRating, dimensions: review.dimensions, comment: review.comment, status: review.status }, changedById: context.actorId, reason: "initial_verified_review" } });
      await tx.auditLog.create({ data: { ...context, action: "trust.review.created", entityType: "VerifiedReview", entityId: review.id, after: { supplierOrderId: order.id, supplierOrganizationId: order.supplierOrganizationId, targetKey, status: review.status, anomalyFlags } } });
      return review;
    });
  }

  async supplierReviews(supplierOrganizationId: string, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    const ownSupplier = context.organizationId === supplierOrganizationId;
    return this.prisma.verifiedReview.findMany({ where: { supplierOrganizationId, ...(operator || ownSupplier ? {} : { status: "PUBLISHED" }) }, include: { revisions: { orderBy: { version: "desc" }, take: operator ? 20 : 0 } }, orderBy: { createdAt: "desc" }, take: 200 });
  }

  async updateReview(reviewId: string, input: { overallRating: number; dimensions: Record<string, number>; comment?: string | null; version: number; reason?: string }, context: SupplierActorContext) {
    const review = await this.prisma.verifiedReview.findFirst({ where: { id: reviewId, reviewerOrganizationId: context.organizationId } });
    if (!review) throw new NotFoundException("Verified review not found");
    if (review.editDeadline <= new Date()) throw new ConflictException("Review edit window has closed");
    const flags = this.reviewAnomalies(input.comment, 0);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.verifiedReview.updateMany({ where: { id: reviewId, version: input.version }, data: { overallRating: input.overallRating, dimensions: input.dimensions, comment: input.comment, status: flags.length ? "PENDING" : review.status, anomalyFlags: flags, version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Review changed; reload before updating");
      const updated = await tx.verifiedReview.findUniqueOrThrow({ where: { id: reviewId } });
      await tx.verifiedReviewRevision.create({ data: { reviewId, version: updated.version, snapshot: { overallRating: updated.overallRating, dimensions: updated.dimensions, comment: updated.comment, status: updated.status }, changedById: context.actorId, reason: input.reason ?? "reviewer_edit" } });
      await tx.auditLog.create({ data: { ...context, action: "trust.review.updated", entityType: "VerifiedReview", entityId: reviewId, before: { version: review.version }, after: { version: updated.version, status: updated.status } } });
      return updated;
    });
  }

  async respondReview(reviewId: string, input: { response: string; version: number }, context: SupplierActorContext) {
    const review = await this.prisma.verifiedReview.findFirst({ where: { id: reviewId, supplierOrganizationId: context.organizationId } });
    if (!review) throw new NotFoundException("Verified review not found");
    const changed = await this.prisma.verifiedReview.updateMany({ where: { id: reviewId, version: input.version }, data: { officialResponse: input.response, respondedById: context.actorId, respondedAt: new Date(), version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Review changed; reload before responding");
    await this.prisma.auditLog.create({ data: { ...context, action: "trust.review.responded", entityType: "VerifiedReview", entityId: reviewId, after: { supplierOrganizationId: context.organizationId } } });
    return this.prisma.verifiedReview.findUniqueOrThrow({ where: { id: reviewId } });
  }

  async appealReview(reviewId: string, input: CreateTrustAppealInput, context: SupplierActorContext) {
    const review = await this.prisma.verifiedReview.findFirst({ where: { id: reviewId, supplierOrganizationId: context.organizationId } });
    if (!review) throw new NotFoundException("Verified review not found");
    const existing = await this.prisma.productGapAppeal.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const incident = await tx.productGapIncident.create({ data: { ownerOrganizationId: context.organizationId, impactedOrganizationId: context.organizationId, subjectType: "VerifiedReview", subjectId: review.id, type: "FAKE_REVIEW", severity: "MEDIUM", status: "UNDER_APPEAL", reasonCode: "supplier_review_dispute", explanation: "Поставщик оспаривает достоверность подтверждённого отзыва.", actionType: "HOLD_FOR_REVIEW", remediation: "Оператор проверяет заказ, историю изменений и представленные доказательства.", restorationCondition: "Решение апелляции с сохранением или корректировкой статуса отзыва.", sourceEntityType: "VerifiedReview", sourceEntityId: review.id, createdById: context.actorId, idempotencyKey: `review-incident:${input.idempotencyKey}` } });
      const appeal = await tx.productGapAppeal.create({ data: { incidentId: incident.id, appellantOrganizationId: context.organizationId, appellantUserId: context.actorId, reason: input.reason, evidence: json(input.evidence), idempotencyKey: input.idempotencyKey } });
      await tx.verifiedReview.update({ where: { id: review.id }, data: { status: "DISPUTED", version: { increment: 1 } } });
      await tx.auditLog.create({ data: { ...context, action: "trust.review.appealed", entityType: "ProductGapAppeal", entityId: appeal.id, after: { reviewId: review.id, incidentId: incident.id, reason: input.reason } } });
      return appeal;
    });
  }

  async moderateReview(reviewId: string, input: { status: "PUBLISHED" | "HIDDEN"; reason: string; version: number }, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator may moderate reviews");
    const review = await this.prisma.verifiedReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException("Verified review not found");
    const changed = await this.prisma.verifiedReview.updateMany({ where: { id: reviewId, version: input.version }, data: { status: input.status, moderationReason: input.reason, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Review changed; reload before moderating");
    await this.prisma.auditLog.create({ data: { ...context, action: "trust.review.moderated", entityType: "VerifiedReview", entityId: reviewId, before: { status: review.status }, after: { status: input.status, reason: input.reason } } });
    return this.prisma.verifiedReview.findUniqueOrThrow({ where: { id: reviewId } });
  }

  async recordMetric(input: RecordTrustMetricInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only trusted platform workflows may record rating events");
    const event = await this.prisma.supplierTrustMetricEvent.upsert({
      where: { supplierOrganizationId_metricCode_sourceEntityType_sourceEntityId: { supplierOrganizationId: input.supplierOrganizationId, metricCode: input.metricCode, sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId } },
      update: { value: input.value, weight: input.weight, categoryId: input.categoryId, cityId: input.cityId, fulfillmentType: input.fulfillmentType, occurredAt: new Date(input.occurredAt), metadata: json(input.metadata), version: { increment: 1 } },
      create: { ...input, occurredAt: new Date(input.occurredAt), metadata: json(input.metadata) },
    });
    await this.prisma.auditLog.create({ data: { ...context, action: "trust.metric.recorded", entityType: "SupplierTrustMetricEvent", entityId: event.id, after: { supplierOrganizationId: input.supplierOrganizationId, metricCode: input.metricCode, value: input.value, sourceEntityType: input.sourceEntityType, sourceEntityId: input.sourceEntityId } } });
    return event;
  }

  async recomputeRating(supplierOrganizationId: string, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    if (!operator && context.organizationId !== supplierOrganizationId) throw new NotFoundException("Supplier rating not found");
    const [events, reviewCount] = await Promise.all([
      this.prisma.supplierTrustMetricEvent.findMany({ where: { supplierOrganizationId, occurredAt: { gte: new Date(Date.now() - 180 * 86_400_000) } } }),
      this.prisma.verifiedReview.count({ where: { supplierOrganizationId, status: "PUBLISHED" } }),
    ]);
    const result = calculateSupplierTrust(events.map((event) => ({ metricCode: event.metricCode, value: Number(event.value), weight: Number(event.weight), occurredAt: event.occurredAt, disputed: event.disputed, excludedAt: event.excludedAt })));
    const snapshot = await this.prisma.supplierTrustSnapshot.upsert({ where: { supplierOrganizationId }, update: { ...result, indicators: result.indicators, factors: result.factors, recommendations: result.recommendations, reviewCount, computedAt: new Date(), version: { increment: 1 } }, create: { supplierOrganizationId, ...result, indicators: result.indicators, factors: result.factors, recommendations: result.recommendations, reviewCount } });
    await this.prisma.auditLog.create({ data: { ...context, action: "trust.rating.recomputed", entityType: "SupplierTrustSnapshot", entityId: snapshot.id, after: { supplierOrganizationId, status: snapshot.status, score: snapshot.score?.toString() ?? null, eventCount: snapshot.eventCount, formulaVersion: snapshot.formulaVersion } } });
    return snapshot;
  }

  async rating(supplierOrganizationId: string) {
    const snapshot = await this.prisma.supplierTrustSnapshot.findUnique({
      where: { supplierOrganizationId },
      include: { appeals: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
    return snapshot ?? {
      supplierOrganizationId,
      status: "INSUFFICIENT_DATA",
      score: null,
      eventCount: 0,
      reviewCount: 0,
      indicators: [],
      factors: {},
      recommendations: [],
      explanation: "Недостаточно подтверждённых исполнений",
      appeals: [],
    };
  }

  async appealRating(supplierOrganizationId: string, input: CreateTrustAppealInput, context: SupplierActorContext) {
    if (context.organizationId !== supplierOrganizationId) throw new ForbiddenException("Only the rated supplier may appeal rating events");
    const snapshot = await this.prisma.supplierTrustSnapshot.findUnique({ where: { supplierOrganizationId } });
    if (!snapshot) throw new NotFoundException("Supplier rating has not been calculated yet");
    const existing = await this.prisma.supplierTrustAppeal.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const appeal = await tx.supplierTrustAppeal.create({ data: { snapshotId: snapshot.id, supplierOrganizationId, appellantUserId: context.actorId, eventIds: input.eventIds, reason: input.reason, evidence: json(input.evidence), idempotencyKey: input.idempotencyKey } });
      await tx.supplierTrustSnapshot.update({ where: { id: snapshot.id }, data: { status: "UNDER_REVIEW", version: { increment: 1 } } });
      await tx.supplierTrustMetricEvent.updateMany({ where: { id: { in: input.eventIds }, supplierOrganizationId }, data: { disputed: true } });
      await tx.auditLog.create({ data: { ...context, action: "trust.rating.appealed", entityType: "SupplierTrustAppeal", entityId: appeal.id, after: { supplierOrganizationId, eventIds: input.eventIds, reason: input.reason } } });
      return appeal;
    });
  }

  async decideRatingAppeal(appealId: string, input: DecideTrustAppealInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator may decide rating appeals");
    const appeal = await this.prisma.supplierTrustAppeal.findUnique({ where: { id: appealId } });
    if (!appeal) throw new NotFoundException("Rating appeal not found");
    const decided = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.supplierTrustAppeal.updateMany({ where: { id: appealId, version: input.version, status: { in: ["OPEN", "UNDER_REVIEW"] } }, data: { status: input.status, decision: input.decision, decidedById: context.actorId, decidedAt: new Date(), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException("Rating appeal changed; reload before deciding");
      if (input.excludeEventIds.length) await tx.supplierTrustMetricEvent.updateMany({ where: { id: { in: input.excludeEventIds }, supplierOrganizationId: appeal.supplierOrganizationId }, data: { excludedAt: new Date(), exclusionReason: `appeal:${appealId}`, disputed: false } });
      await tx.supplierTrustMetricEvent.updateMany({ where: { id: { in: appeal.eventIds }, supplierOrganizationId: appeal.supplierOrganizationId, excludedAt: null }, data: { disputed: false } });
      await tx.auditLog.create({ data: { ...context, action: "trust.rating.appeal_decided", entityType: "SupplierTrustAppeal", entityId: appealId, after: { status: input.status, decision: input.decision, excludeEventIds: input.excludeEventIds } } });
      return tx.supplierTrustAppeal.findUniqueOrThrow({ where: { id: appealId } });
    });
    await this.recomputeRating(appeal.supplierOrganizationId, context);
    return decided;
  }
}
