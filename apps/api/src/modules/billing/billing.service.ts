import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateBillingPlanInput } from "@marketplace/schemas";
import type { CommerceProfile } from "@marketplace/schemas";
import { normalizeCommerceProfile, buildCommercePolicy } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { EntitlementsService } from "./entitlements.service";

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly entitlements: EntitlementsService) {}

  plans() { return this.prisma.billingPlan.findMany({ where: { status: "ACTIVE" }, orderBy: { monthlyPriceMinor: "asc" } }); }

  async createPlan(input: CreateBillingPlanInput, context: SupplierActorContext) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const plan = await tx.billingPlan.create({ data: { code: input.code, name: input.name, description: input.description, monthlyPriceMinor: input.monthlyPriceMinor, currency: input.currency, trialDays: input.trialDays, graceDays: input.graceDays } });
        if (input.entitlements.length) await tx.planEntitlement.createMany({ data: input.entitlements.map((item) => ({ planId: plan.id, featureKey: item.featureKey, enabled: item.enabled, limits: item.limits as Prisma.InputJsonValue | undefined })) });
        await tx.auditLog.create({ data: { ...context, action: "billing.plan.created", entityType: "BillingPlan", entityId: plan.id, after: JSON.parse(JSON.stringify({ code: plan.code, monthlyPriceMinor: plan.monthlyPriceMinor.toString(), entitlements: input.entitlements })) as Prisma.InputJsonValue } });
        return plan;
      });
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Billing plan code already exists"); throw error; }
  }

  async subscribe(input: { organizationId: string; planId: string; startsAt?: string }, context: SupplierActorContext) {
    const plan = await this.prisma.billingPlan.findFirst({ where: { id: input.planId, status: "ACTIVE" } });
    if (!plan) throw new NotFoundException("Billing plan not found");
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const existing = await this.prisma.organizationSubscription.findFirst({ where: { organizationId: input.organizationId, status: { in: ["TRIAL", "ACTIVE", "GRACE", "PAST_DUE"] } } });
    if (existing) throw new ConflictException("Organization already has an active billing lifecycle");
    const trialEndsAt = plan.trialDays ? new Date(startsAt.getTime() + plan.trialDays * 86_400_000) : null;
    const currentPeriodEnd = new Date(startsAt); currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1);
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.organizationSubscription.create({ data: { organizationId: input.organizationId, planId: plan.id, status: trialEndsAt ? "TRIAL" : "ACTIVE", trialEndsAt, currentPeriodStart: startsAt, currentPeriodEnd } });
      await tx.auditLog.create({ data: { ...context, organizationId: input.organizationId, action: "billing.subscription.created", entityType: "OrganizationSubscription", entityId: subscription.id, after: { planId: plan.id, status: subscription.status, currentPeriodEnd } } });
      return subscription;
    });
  }

  subscriptions(organizationId: string) { return this.prisma.organizationSubscription.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } }); }
  async invoices(organizationId: string) {
    const subscriptions = await this.prisma.organizationSubscription.findMany({ where: { organizationId }, select: { id: true } });
    return this.prisma.billingInvoice.findMany({ where: { subscriptionId: { in: subscriptions.map(({ id }) => id) } }, orderBy: { createdAt: "desc" } });
  }

  async setFeature(organizationId: string, featureKey: string, input: { enabled: boolean; limits?: Record<string, unknown> | null; expiresAt?: string | null }, context: SupplierActorContext) {
    const feature = await this.prisma.featureFlag.findUnique({ where: { key: featureKey } });
    if (!feature) throw new NotFoundException("Feature flag not found");
    const result = await this.prisma.organizationFeature.upsert({ where: { organizationId_featureKey: { organizationId, featureKey } }, update: { enabled: input.enabled, limits: input.limits as Prisma.InputJsonValue | undefined, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, source: "MANUAL" }, create: { organizationId, featureKey, enabled: input.enabled, limits: input.limits as Prisma.InputJsonValue | undefined, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, source: "MANUAL" } });
    await this.prisma.auditLog.create({ data: { ...context, organizationId, action: "feature.organization.updated", entityType: "OrganizationFeature", entityId: result.id, after: { featureKey, ...input } as Prisma.InputJsonValue } });
    return result;
  }

  entitlementSummary(organizationId: string) { return this.entitlements.all(organizationId); }

  async commerceProfile(organizationId: string) {
    const stored = await this.prisma.organizationFeature.findUnique({ where: { organizationId_featureKey: { organizationId, featureKey: "commerce.profile" } } });
    const profile = normalizeCommerceProfile(stored?.limits && typeof stored.limits === "object" && !Array.isArray(stored.limits) ? stored.limits as Partial<CommerceProfile> : {});
    return { profile, policy: buildCommercePolicy(profile), source: stored?.source ?? "default", updatedAt: stored?.updatedAt ?? null };
  }

  async setCommerceProfile(organizationId: string, input: Partial<CommerceProfile>, context: SupplierActorContext) {
    const profile = normalizeCommerceProfile(input);
    const result = await this.prisma.organizationFeature.upsert({
      where: { organizationId_featureKey: { organizationId, featureKey: "commerce.profile" } },
      update: { enabled: true, limits: profile, source: "ORGANIZATION_PROFILE" },
      create: { organizationId, featureKey: "commerce.profile", enabled: true, limits: profile, source: "ORGANIZATION_PROFILE" },
    });
    await this.prisma.auditLog.create({ data: { ...context, organizationId, action: "commerce.profile.updated", entityType: "OrganizationFeature", entityId: result.id, after: profile } });
    return { profile, policy: buildCommercePolicy(profile), source: result.source, updatedAt: result.updatedAt };
  }
}
