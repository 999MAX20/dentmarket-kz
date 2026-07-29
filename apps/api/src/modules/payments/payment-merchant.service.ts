import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePaymentSessionInput, OnboardPaymentMerchantInput, RequestPaymentMerchantChangeInput, ReviewPaymentMerchantChangeInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { PaymentAdapterRegistry } from "./adapters/payment-adapter-registry.service";
import { buildInvoiceDraft } from "./invoice-rules";

@Injectable()
export class PaymentMerchantService {
  constructor(private readonly prisma: PrismaService, private readonly registry: PaymentAdapterRegistry) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertOrganizationAccess(organizationId: string, context: SupplierActorContext) {
    if (organizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Payment merchant account belongs to another organization");
  }

  providers() {
    return this.prisma.paymentProvider.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
  }

  async accounts(organizationId: string, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    return this.prisma.paymentMerchantAccount.findMany({ where: { organizationId }, include: { provider: true, changeRequests: { orderBy: { createdAt: "desc" }, take: 10 } }, orderBy: { createdAt: "desc" } });
  }

  async onboard(organizationId: string, input: OnboardPaymentMerchantInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    const [organization, provider] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: organizationId }, include: { capabilities: true } }),
      this.prisma.paymentProvider.findUnique({ where: { code: input.providerCode } }),
    ]);
    if (!organization || !organization.capabilities.some(({ capability }) => capability === "SUPPLIER")) throw new NotFoundException("Supplier organization not found");
    if (!provider || provider.status !== "ACTIVE") throw new NotFoundException("Active payment provider not found");
    const existing = await this.prisma.paymentMerchantAccount.findUnique({ where: { organizationId_providerId: { organizationId, providerId: provider.id } } });
    if (existing?.onboardingStatus === "ACTIVE" && existing.verificationStatus === "VERIFIED") return existing;
    const { adapter, context: adapterContext } = this.registry.resolve(provider);
    const result = await adapter.onboardMerchant(adapterContext, { organizationId, returnUrl: input.returnUrl, idempotencyKey: input.idempotencyKey });
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.paymentMerchantAccount.upsert({
        where: { organizationId_providerId: { organizationId, providerId: provider.id } },
        update: { externalMerchantId: result.externalId, onboardingStatus: result.status === "SUCCEEDED" ? "ACTIVE" : "PENDING", verificationStatus: result.status === "SUCCEEDED" ? "VERIFIED" : "PENDING", payoutStatus: result.status === "SUCCEEDED" ? "READY" : "NOT_READY", capabilities: provider.capabilities as Prisma.InputJsonValue, onboardingUrl: typeof result.data.onboardingUrl === "string" ? result.data.onboardingUrl : input.returnUrl, lastVerifiedAt: result.status === "SUCCEEDED" ? new Date() : null, version: { increment: 1 } },
        create: { organizationId, providerId: provider.id, externalMerchantId: result.externalId, onboardingStatus: result.status === "SUCCEEDED" ? "ACTIVE" : "PENDING", verificationStatus: result.status === "SUCCEEDED" ? "VERIFIED" : "PENDING", payoutStatus: result.status === "SUCCEEDED" ? "READY" : "NOT_READY", capabilities: provider.capabilities as Prisma.InputJsonValue, onboardingUrl: typeof result.data.onboardingUrl === "string" ? result.data.onboardingUrl : input.returnUrl, lastVerifiedAt: result.status === "SUCCEEDED" ? new Date() : null },
      });
      await tx.auditLog.create({ data: { ...context, action: "payment.merchant.onboarded", entityType: "PaymentMerchantAccount", entityId: account.id, before: existing ?? Prisma.JsonNull, after: { organizationId, providerCode: provider.code, onboardingStatus: account.onboardingStatus, verificationStatus: account.verificationStatus } } });
      return account;
    });
  }

  async requestChange(organizationId: string, accountId: string, input: RequestPaymentMerchantChangeInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    const account = await this.prisma.paymentMerchantAccount.findFirst({ where: { id: accountId, organizationId } });
    if (!account) throw new NotFoundException("Payment merchant account not found");
    if (account.externalMerchantId === input.requestedExternalMerchantId) throw new ConflictException("Requested merchant binding is already active");
    const pending = await this.prisma.paymentMerchantChangeRequest.findFirst({ where: { merchantAccountId: account.id, status: "PENDING" } });
    if (pending) throw new ConflictException("A merchant binding change is already awaiting review");
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.paymentMerchantChangeRequest.create({ data: { merchantAccountId: account.id, requestedExternalMerchantId: input.requestedExternalMerchantId, reason: input.reason, requestedById: context.actorId } });
      await tx.auditLog.create({ data: { ...context, action: "payment.merchant.change_requested", entityType: "PaymentMerchantChangeRequest", entityId: request.id, before: { externalMerchantId: account.externalMerchantId }, after: { requestedExternalMerchantId: input.requestedExternalMerchantId, reason: input.reason } } });
      return request;
    });
  }

  async pendingChanges(context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Marketplace operator access is required");
    return this.prisma.paymentMerchantChangeRequest.findMany({ where: { status: "PENDING" }, include: { merchantAccount: { include: { organization: true, provider: true } } }, orderBy: { createdAt: "asc" } });
  }

  async reviewChange(requestId: string, input: ReviewPaymentMerchantChangeInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Marketplace operator access is required");
    const request = await this.prisma.paymentMerchantChangeRequest.findUnique({ where: { id: requestId }, include: { merchantAccount: true } });
    if (!request) throw new NotFoundException("Payment merchant change request not found");
    if (request.status !== "PENDING") throw new ConflictException("Payment merchant change request was already reviewed");
    return this.prisma.$transaction(async (tx) => {
      if (input.decision === "APPROVED") await tx.paymentMerchantAccount.update({ where: { id: request.merchantAccountId }, data: { externalMerchantId: request.requestedExternalMerchantId, onboardingStatus: "IN_REVIEW", verificationStatus: "PENDING", payoutStatus: "ON_HOLD", lastVerifiedAt: null, version: { increment: 1 } } });
      const reviewed = await tx.paymentMerchantChangeRequest.update({ where: { id: request.id }, data: { status: input.decision, reviewedById: context.actorId, reviewedAt: new Date(), reviewComment: input.comment } });
      await tx.auditLog.create({ data: { ...context, action: "payment.merchant.change_reviewed", entityType: "PaymentMerchantChangeRequest", entityId: request.id, before: request, after: reviewed } });
      return reviewed;
    });
  }

  async createSession(paymentIntentId: string, input: CreatePaymentSessionInput, context: SupplierActorContext) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId }, include: { provider: true, allocations: { include: { supplierOrder: { include: { supplier: { include: { supplierProfile: true } } } } } }, sessions: true } });
    if (!intent) throw new NotFoundException("Payment intent not found");
    await this.assertOrganizationAccess(intent.buyerOrganizationId, context);
    const existing = intent.sessions.find(({ idempotencyKey }) => idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    if (!["PENDING", "AUTHORIZED", "PARTIALLY_CAPTURED"].includes(intent.status)) throw new ConflictException("Payment intent cannot create a payment session in its current state");
    if (["BANK_TRANSFER", "INVOICE"].includes(intent.paymentMethod)) {
      const request = { paymentIntentId: intent.id, paymentMethod: intent.paymentMethod, amountMinor: intent.totalAmountMinor.toString(), currency: intent.currency, allocationCount: intent.allocations.length, idempotencyKey: input.idempotencyKey };
      const invoices = intent.allocations.map((allocation) => {
        const rawDetails = allocation.supplierOrder.supplier.supplierProfile?.regulatoryDetails;
        const details = rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails) ? rawDetails as Record<string, unknown> : {};
        const bankDetails = typeof details.bankName === "string" && typeof details.iban === "string" && typeof details.bik === "string" ? { bankName: details.bankName, iban: details.iban, bik: details.bik, beneficiary: allocation.supplierOrder.supplier.legalName } : undefined;
        return buildInvoiceDraft({ paymentIntentId: intent.id, paymentAllocationId: allocation.id, supplierOrderId: allocation.supplierOrderId, amountMinor: allocation.grossAmountMinor.toString(), currency: intent.currency, bankDetails });
      });
      return this.prisma.$transaction(async (tx) => {
        const responsePayload = { type: "BANK_TRANSFER_INVOICE", paymentMethod: intent.paymentMethod, status: "AWAITING_BANK_TRANSFER", nextAction: "UPLOAD_BANK_CONFIRMATION_OR_RECONCILE", invoices };
        const session = await tx.paymentSession.create({ data: { paymentIntentId: intent.id, externalSessionId: `invoice_${intent.id}`, status: "ACTIVE", idempotencyKey: input.idempotencyKey, requestPayload: request as Prisma.InputJsonValue, responsePayload: responsePayload as Prisma.InputJsonValue } });
        await tx.auditLog.create({ data: { ...context, action: "payment.invoice.created", entityType: "PaymentSession", entityId: session.id, after: { paymentIntentId: intent.id, paymentMethod: intent.paymentMethod, status: session.status } } });
        return session;
      });
    }
    const { adapter, context: adapterContext } = this.registry.resolve(intent.provider);
    const request = { paymentIntentId: intent.id, amountMinor: intent.totalAmountMinor.toString(), currency: intent.currency, allocationCount: intent.allocations.length, returnUrl: input.returnUrl, idempotencyKey: input.idempotencyKey };
    const result = await adapter.createSession(adapterContext, request);
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.paymentSession.create({ data: { paymentIntentId: intent.id, externalSessionId: result.externalId, status: result.status === "SUCCEEDED" ? "ACTIVE" : result.status === "FAILED" ? "FAILED" : "PENDING", checkoutUrl: result.checkoutUrl, idempotencyKey: input.idempotencyKey, requestPayload: request as Prisma.InputJsonValue, responsePayload: result.data as Prisma.InputJsonValue, expiresAt: result.expiresAt } });
      await tx.auditLog.create({ data: { ...context, action: "payment.session.created", entityType: "PaymentSession", entityId: session.id, after: { paymentIntentId: intent.id, providerCode: intent.provider.code, status: session.status, expiresAt: session.expiresAt } } });
      return session;
    });
  }
}
