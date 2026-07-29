import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { normalizeCommerceProfile, validateCommercePaymentMethod } from "@marketplace/schemas";
import type { CaptureMockPaymentInput, CreatePaymentIntentInput, LedgerQueryInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { calculateAllocation } from "../commerce/commerce-rules";
import { PaymentSettlementService } from "./payment-settlement.service";

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService, private readonly settlement: PaymentSettlementService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertBuyerAccess(buyerOrganizationId: string, context: SupplierActorContext) {
    if (buyerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Payment belongs to another buyer");
  }

  private intentInclude() {
    return { provider: true, checkout: true, sessions: { orderBy: { createdAt: "desc" as const } }, authorization: true, captures: { orderBy: { createdAt: "desc" as const } }, transactions: { orderBy: { createdAt: "desc" as const } }, refunds: { orderBy: { createdAt: "desc" as const } }, allocations: { include: { supplierOrder: true, recipient: true, merchantAccount: true, refunds: true, payouts: true, fees: true } }, attempts: { orderBy: { createdAt: "desc" as const } } };
  }

  async createIntent(checkoutId: string, input: CreatePaymentIntentInput, context: SupplierActorContext) {
    const checkout = await this.prisma.checkout.findUnique({ where: { id: checkoutId }, include: { supplierOrders: true, paymentIntent: { include: this.intentInclude() } } });
    if (!checkout) throw new NotFoundException("Checkout not found");
    await this.assertBuyerAccess(checkout.buyerOrganizationId, context);
    const commerceFeature = await this.prisma.organizationFeature.findUnique({ where: { organizationId_featureKey: { organizationId: checkout.buyerOrganizationId, featureKey: "commerce.profile" } } });
    const commerceProfile = normalizeCommerceProfile(commerceFeature?.limits && typeof commerceFeature.limits === "object" && !Array.isArray(commerceFeature.limits) ? commerceFeature.limits as Record<string, unknown> : {});
    const paymentPolicy = validateCommercePaymentMethod(commerceProfile, input.paymentMethod);
    if (!paymentPolicy.allowed) throw new ConflictException(paymentPolicy.reason);
    if (checkout.status !== "COMPLETED") throw new ConflictException("Only a completed checkout can be paid");
    if (checkout.paymentIntent) {
      if (checkout.paymentIntent.idempotencyKey !== input.idempotencyKey || checkout.paymentIntent.provider.code !== input.providerCode || checkout.paymentIntent.paymentMethod !== input.paymentMethod) throw new ConflictException("Checkout already has another payment intent");
      return checkout.paymentIntent;
    }
    if (checkout.supplierOrders.some(({ status }) => status === "AWAITING_CONFIRMATION" || status === "CANCELLED")) throw new ConflictException("Every supplier order must be confirmed or rejected before payment");
    const payableOrders = checkout.supplierOrders.filter(({ status, subtotalAmountMinor }) => (status === "CONFIRMED" || status === "PARTIALLY_CONFIRMED") && Number(subtotalAmountMinor) > 0);
    if (payableOrders.length === 0) throw new BadRequestException("Checkout has no confirmed amount to pay");
    const provider = await this.prisma.paymentProvider.findUnique({ where: { code: input.providerCode } });
    if (!provider || provider.status !== "ACTIVE") throw new NotFoundException("Active payment provider not found");
    const providerMethods = provider.capabilities && typeof provider.capabilities === "object" && !Array.isArray(provider.capabilities) ? (provider.capabilities as Record<string, unknown>).paymentMethods : undefined;
    if (Array.isArray(providerMethods) && !providerMethods.includes(input.paymentMethod)) throw new ConflictException(`Payment provider ${provider.code} does not support ${input.paymentMethod}`);
    const requiresMerchantOnboarding = !["BANK_TRANSFER", "INVOICE"].includes(input.paymentMethod);
    const merchantAccounts = requiresMerchantOnboarding ? await this.prisma.paymentMerchantAccount.findMany({ where: { providerId: provider.id, organizationId: { in: payableOrders.map(({ supplierOrganizationId }) => supplierOrganizationId) }, onboardingStatus: "ACTIVE", verificationStatus: "VERIFIED", payoutStatus: "READY" } }) : [];
    const merchantByOrganization = new Map(merchantAccounts.map((account) => [account.organizationId, account]));
    if (requiresMerchantOnboarding && payableOrders.some(({ supplierOrganizationId }) => !merchantByOrganization.has(supplierOrganizationId))) throw new ConflictException("Every supplier must complete payment-provider onboarding before a payment intent can be created");
    const total = payableOrders.reduce((sum, order) => sum.plus(order.subtotalAmountMinor), new Prisma.Decimal(0));
    try {
      const intent = await this.prisma.$transaction(async (tx) => {
        const created = await tx.paymentIntent.create({ data: { checkoutId, buyerOrganizationId: checkout.buyerOrganizationId, providerId: provider.id, paymentMethod: input.paymentMethod, totalAmountMinor: total, currency: checkout.currency, idempotencyKey: input.idempotencyKey, expiresAt: new Date(Date.now() + 30 * 60_000) } });
        for (const order of payableOrders) {
          const allocation = calculateAllocation(order.subtotalAmountMinor.toString());
          const paymentAllocation = await tx.paymentAllocation.create({ data: { paymentIntentId: created.id, supplierOrderId: order.id, recipientOrganizationId: order.supplierOrganizationId, merchantAccountId: merchantByOrganization.get(order.supplierOrganizationId)?.id, grossAmountMinor: allocation.gross, platformFeeMinor: allocation.fee, netAmountMinor: allocation.net } });
          await tx.paymentFee.create({ data: { paymentIntentId: created.id, paymentAllocationId: paymentAllocation.id, feeType: "MARKETPLACE_PERCENT", payer: "SUPPLIER", amountMinor: allocation.fee, currency: checkout.currency, ruleSnapshot: { rateBasisPoints: 200, rounding: "FLOOR_MINOR_UNIT", grossAmountMinor: allocation.gross.toString() } } });
          await tx.supplierOrder.update({ where: { id: order.id }, data: { paymentStatus: "PROCESSING", version: { increment: 1 } } });
        }
        await tx.auditLog.create({ data: { ...context, action: "payment.intent.created", entityType: "PaymentIntent", entityId: created.id, after: { checkoutId, totalAmountMinor: total.toString(), currency: checkout.currency, providerCode: provider.code, paymentMethod: input.paymentMethod, allocationCount: payableOrders.length } } });
        await tx.outboxEvent.create({ data: { aggregateType: "PaymentIntent", aggregateId: created.id, eventType: "PaymentIntentCreated", payload: { checkoutId, buyerOrganizationId: checkout.buyerOrganizationId, totalAmountMinor: total.toString(), currency: checkout.currency } } });
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.getIntent(intent.id, context);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.paymentIntent.findUnique({ where: { checkoutId }, include: this.intentInclude() });
        if (raced && raced.idempotencyKey === input.idempotencyKey && raced.provider.code === input.providerCode) return raced;
        throw new ConflictException("Payment intent was created concurrently");
      }
      throw error;
    }
  }

  async getIntent(paymentIntentId: string, context: SupplierActorContext) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId }, include: this.intentInclude() });
    if (!intent) throw new NotFoundException("Payment intent not found");
    await this.assertBuyerAccess(intent.buyerOrganizationId, context);
    return intent;
  }

  async buyerIntents(buyerOrganizationId: string, context: SupplierActorContext) {
    await this.assertBuyerAccess(buyerOrganizationId, context);
    return this.prisma.paymentIntent.findMany({
      where: { buyerOrganizationId },
      include: this.intentInclude(),
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async captureMock(paymentIntentId: string, input: CaptureMockPaymentInput, context: SupplierActorContext) {
    const visible = await this.getIntent(paymentIntentId, context);
    if (visible.provider.code !== "MOCK") throw new BadRequestException("Mock capture is only available for the MOCK provider");
    return this.settlement.capture(paymentIntentId, { idempotencyKey: input.idempotencyKey }, context);
  }

  async ledger(query: LedgerQueryInput, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    let permittedIntentIds: string[] | undefined;
    if (!operator) {
      const intents = await this.prisma.paymentIntent.findMany({ where: { OR: [{ buyerOrganizationId: context.organizationId }, { allocations: { some: { recipientOrganizationId: context.organizationId } } }] }, select: { id: true } });
      permittedIntentIds = intents.map(({ id }) => id);
    }
    return this.prisma.financialLedgerEntry.findMany({
      where: {
        ...(query.referenceType ? { referenceType: query.referenceType } : {}),
        ...(query.referenceId ? { referenceId: query.referenceId } : {}),
        ...(permittedIntentIds ? { referenceType: "PaymentIntent", referenceId: { in: permittedIntentIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
  }
}
