import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../platform/prisma/prisma.service";

export type ResolvedEntitlement = { key: string; enabled: boolean; limits: unknown; source: "organization" | "subscription" | "global" | "default" };

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(organizationId: string, key: string): Promise<ResolvedEntitlement> {
    const now = new Date();
    const override = await this.prisma.organizationFeature.findUnique({ where: { organizationId_featureKey: { organizationId, featureKey: key } } });
    if (override && (!override.expiresAt || override.expiresAt > now)) return { key, enabled: override.enabled, limits: override.limits, source: "organization" };
    const subscription = await this.prisma.organizationSubscription.findFirst({ where: { organizationId, status: { in: ["TRIAL", "ACTIVE", "GRACE"] }, OR: [{ currentPeriodEnd: { gt: now } }, { graceEndsAt: { gt: now } }] }, orderBy: { createdAt: "desc" } });
    if (subscription) {
      const entitlement = await this.prisma.planEntitlement.findUnique({ where: { planId_featureKey: { planId: subscription.planId, featureKey: key } } });
      if (entitlement) return { key, enabled: entitlement.enabled, limits: entitlement.limits, source: "subscription" };
    }
    const global = await this.prisma.featureFlag.findUnique({ where: { key } });
    return global ? { key, enabled: global.enabled, limits: global.configuration, source: "global" } : { key, enabled: false, limits: null, source: "default" };
  }

  async all(organizationId: string) {
    const [flags, overrides, subscription] = await Promise.all([
      this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
      this.prisma.organizationFeature.findMany({ where: { organizationId }, orderBy: { featureKey: "asc" } }),
      this.prisma.organizationSubscription.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
    ]);
    const plan = subscription ? await this.prisma.billingPlan.findUnique({ where: { id: subscription.planId } }) : null;
    const planFeatures = subscription ? await this.prisma.planEntitlement.findMany({ where: { planId: subscription.planId } }) : [];
    const keys = [...new Set([...flags.map(({ key }) => key), ...overrides.map(({ featureKey }) => featureKey), ...planFeatures.map(({ featureKey }) => featureKey)])];
    return { subscription: subscription ? { ...subscription, plan } : null, entitlements: await Promise.all(keys.map((key) => this.resolve(organizationId, key))) };
  }
}
