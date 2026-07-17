import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { AccessControlModule } from "./modules/access-control/access-control.module";
import { InvitationsModule } from "./modules/identity/invitations.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { PrismaModule } from "./platform/prisma/prisma.module";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { AuditModule } from "./modules/audit/audit.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { ImportsModule } from "./modules/imports/imports.module";
import { OffersModule } from "./modules/offers/offers.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { ModerationModule } from "./modules/moderation/moderation.module";
import { PricingModule } from "./modules/pricing/pricing.module";
import { ScheduleModule } from "@nestjs/schedule";
import { CommerceModule } from "./modules/commerce/commerce.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { LogisticsModule } from "./modules/logistics/logistics.module";
import { StorageModule } from "./platform/storage/storage.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { SearchModule } from "./modules/search/search.module";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { SentryGlobalFilter } from "@sentry/nestjs/setup";
import { environment } from "./platform/config/environment";
import { BackgroundJobsModule } from "./platform/jobs/background-jobs.module";
import { SecurityModule } from "./platform/security/security.module";
import { MfaModule } from "./modules/identity/mfa.module";
import { AuthSessionsModule } from "./modules/identity/auth-sessions.module";
import { PromotionsModule } from "./modules/promotions/promotions.module";
import { SupportModule } from "./modules/support/support.module";
import { OwnersModule } from "./modules/owners/owners.module";
import { BillingModule } from "./modules/billing/billing.module";
import { AiModule } from "./modules/ai/ai.module";
import { MarketplaceAgreementsModule } from "./modules/agreements/marketplace-agreements.module";
import { TrustCommerceModule } from "./modules/trust-commerce/trust-commerce.module";
import { OnboardingModule } from "./modules/onboarding/onboarding.module";

const config = environment();

@Module({
  imports: [ScheduleModule.forRoot(), ThrottlerModule.forRoot([
    { name: "ip", ttl: config.RATE_LIMIT_TTL_MS, limit: config.RATE_LIMIT_REQUESTS, getTracker: (request) => `ip:${request.ip}` },
    { name: "user", ttl: config.RATE_LIMIT_TTL_MS, limit: config.RATE_LIMIT_REQUESTS * 2, getTracker: (request) => `user:${request.headers["x-user-id"] ?? `anonymous:${request.ip}`}` },
    { name: "tenant", ttl: config.RATE_LIMIT_TTL_MS, limit: config.RATE_LIMIT_REQUESTS * 5, getTracker: (request) => `tenant:${request.headers["x-organization-id"] ?? `anonymous:${request.ip}`}` },
  ]), BackgroundJobsModule, SecurityModule, PrismaModule, StorageModule, AccessControlModule, InvitationsModule, MfaModule, OnboardingModule, AuthSessionsModule, OrganizationsModule, CatalogModule, ApprovalsModule, AuditModule, SuppliersModule, ImportsModule, OffersModule, InventoryModule, ModerationModule, PricingModule, IntegrationsModule, ComplianceModule, CommerceModule, PaymentsModule, LogisticsModule, DocumentsModule, MarketplaceAgreementsModule, NotificationsModule, SearchModule, PromotionsModule, SupportModule, OwnersModule, BillingModule, AiModule, TrustCommerceModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }, { provide: APP_FILTER, useClass: SentryGlobalFilter }],
})
export class AppModule {}
