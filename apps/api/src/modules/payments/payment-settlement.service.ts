import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AuthorizePaymentInput, CancelPaymentIntentInput, CapturePaymentInput, CreateRefundInput, PaymentOperationsQueryInput, PaymentReconciliationImportInput, ProcessPayoutInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { PaymentAdapterRegistry } from "./adapters/payment-adapter-registry.service";
import { providerCapabilities } from "./adapters/payment-adapter";
import { calculateRefundAllocation } from "./payment-rules";

@Injectable()
export class PaymentSettlementService {
  constructor(private readonly prisma: PrismaService, private readonly registry: PaymentAdapterRegistry) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertBuyerAccess(buyerOrganizationId: string, context: SupplierActorContext) {
    if (buyerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Payment belongs to another buyer");
  }

  private intentInclude() {
    return {
      provider: true,
      sessions: { orderBy: { createdAt: "desc" as const } },
      authorization: true,
      captures: { orderBy: { createdAt: "desc" as const } },
      transactions: { orderBy: { createdAt: "desc" as const } },
      refunds: { orderBy: { createdAt: "desc" as const } },
      allocations: { include: { merchantAccount: true, refunds: true, payouts: true, supplierOrder: { include: { items: { include: { reservation: { include: { externalReservation: true } } } } } } } },
    };
  }

  async get(paymentIntentId: string, context: SupplierActorContext) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: paymentIntentId }, include: this.intentInclude() });
    if (!intent) throw new NotFoundException("Payment intent not found");
    await this.assertBuyerAccess(intent.buyerOrganizationId, context);
    return intent;
  }

  async authorize(paymentIntentId: string, input: AuthorizePaymentInput, context: SupplierActorContext) {
    const intent = await this.get(paymentIntentId, context);
    const replay = intent.transactions.find(({ idempotencyKey, type }) => idempotencyKey === input.idempotencyKey && type === "AUTHORIZATION");
    if (replay) return intent;
    if (intent.status !== "PENDING") throw new ConflictException("Payment intent is not ready for authorization");
    this.requireMerchantAccounts(intent.allocations);
    const { adapter, context: adapterContext } = this.registry.resolve(intent.provider);
    const request = { paymentIntentId: intent.id, amountMinor: intent.totalAmountMinor.toString(), currency: intent.currency, idempotencyKey: input.idempotencyKey };
    const result = await adapter.authorize(adapterContext, request);
    if (result.status === "FAILED") throw new ConflictException("Payment provider declined authorization");
    await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.create({ data: { paymentIntentId: intent.id, providerId: intent.providerId, type: "AUTHORIZATION", status: result.status === "SUCCEEDED" ? "SUCCEEDED" : "PROCESSING", amountMinor: intent.totalAmountMinor, currency: intent.currency, externalTransactionId: result.externalId, idempotencyKey: input.idempotencyKey, requestPayload: request as Prisma.InputJsonValue, responsePayload: result.data as Prisma.InputJsonValue, processedAt: result.status === "SUCCEEDED" ? new Date() : null } });
      await tx.paymentAuthorization.create({ data: { paymentIntentId: intent.id, paymentTransactionId: transaction.id, authorizedAmountMinor: intent.totalAmountMinor, status: result.status === "SUCCEEDED" ? "AUTHORIZED" : "PENDING", expiresAt: intent.expiresAt } });
      await tx.paymentAllocation.updateMany({ where: { paymentIntentId: intent.id, status: "PENDING" }, data: { status: "AUTHORIZED" } });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: result.status === "SUCCEEDED" ? "AUTHORIZED" : "PROCESSING" } });
      await tx.auditLog.create({ data: { ...context, action: "payment.authorized", entityType: "PaymentIntent", entityId: intent.id, after: { amountMinor: intent.totalAmountMinor.toString(), currency: intent.currency, transactionId: transaction.id, providerReference: result.externalId } } });
      await tx.outboxEvent.create({ data: { aggregateType: "PaymentIntent", aggregateId: intent.id, eventType: "PaymentAuthorized", payload: { paymentIntentId: intent.id, amountMinor: intent.totalAmountMinor.toString(), currency: intent.currency } } });
    });
    return this.get(paymentIntentId, context);
  }

  async capture(paymentIntentId: string, input: CapturePaymentInput, context: SupplierActorContext) {
    const intent = await this.get(paymentIntentId, context);
    const replay = intent.transactions.find(({ idempotencyKey, type }) => idempotencyKey === input.idempotencyKey && type === "CAPTURE");
    if (replay) return intent;
    if (!["PENDING", "AUTHORIZED", "PARTIALLY_CAPTURED"].includes(intent.status)) throw new ConflictException("Payment intent is not ready for capture");
    const requestedIds = input.allocationIds ? new Set(input.allocationIds) : null;
    const selected = intent.allocations.filter((allocation) => (!requestedIds || requestedIds.has(allocation.id)) && ["PENDING", "AUTHORIZED"].includes(allocation.status));
    if (selected.length === 0 || (requestedIds && selected.length !== requestedIds.size)) throw new BadRequestException("Capture allocations are missing or already processed");
    const capabilities = providerCapabilities(intent.provider.capabilities);
    if (selected.length !== intent.allocations.filter(({ status }) => ["PENDING", "AUTHORIZED"].includes(status)).length && capabilities.supports_partial_capture !== true) throw new ConflictException("Payment provider does not support partial capture");
    this.requireMerchantAccounts(selected);
    for (const allocation of selected) for (const item of allocation.supplierOrder.items) {
      const reservation = item.reservation;
      if (reservation?.externalReservation && reservation.externalReservation.status !== "ACTIVE") throw new ConflictException("External inventory reservation must be active before payment capture");
    }
    const amount = selected.reduce((sum, allocation) => sum.plus(allocation.grossAmountMinor), new Prisma.Decimal(0));
    const { adapter, context: adapterContext } = this.registry.resolve(intent.provider);
    const request = { paymentIntentId: intent.id, amountMinor: amount.toString(), currency: intent.currency, idempotencyKey: input.idempotencyKey, allocationIds: selected.map(({ id }) => id), parentExternalId: intent.authorization?.paymentTransactionId };
    const result = await adapter.capture(adapterContext, request);
    if (result.status === "FAILED") throw new ConflictException("Payment provider declined capture");

    try {
      await this.prisma.$transaction(async (tx) => {
        const transaction = await tx.paymentTransaction.create({ data: { paymentIntentId: intent.id, providerId: intent.providerId, parentTransactionId: intent.authorization?.paymentTransactionId, type: "CAPTURE", status: result.status === "SUCCEEDED" ? "SUCCEEDED" : "PROCESSING", amountMinor: amount, currency: intent.currency, externalTransactionId: result.externalId, idempotencyKey: input.idempotencyKey, requestPayload: request as Prisma.InputJsonValue, responsePayload: result.data as Prisma.InputJsonValue, processedAt: result.status === "SUCCEEDED" ? new Date() : null } });
        await tx.paymentCapture.create({ data: { paymentIntentId: intent.id, paymentTransactionId: transaction.id, amountMinor: amount } });
        await tx.paymentAttempt.create({ data: { paymentIntentId: intent.id, providerId: intent.providerId, externalAttemptId: result.externalId, status: result.status === "SUCCEEDED" ? "SUCCEEDED" : "PROCESSING", idempotencyKey: input.idempotencyKey, requestPayload: request as Prisma.InputJsonValue, responsePayload: result.data as Prisma.InputJsonValue } });

        for (const allocation of selected) {
          await this.captureAllocation(tx, intent.id, intent.currency, transaction.id, allocation);
        }
        const captured = await tx.paymentAllocation.aggregate({ where: { paymentIntentId: intent.id, status: { in: ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"] } }, _sum: { grossAmountMinor: true } });
        const capturedAmount = captured._sum.grossAmountMinor ?? new Prisma.Decimal(0);
        const fullCapture = capturedAmount.gte(intent.totalAmountMinor);
        await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: fullCapture ? "CAPTURED" : "PARTIALLY_CAPTURED" } });
        await tx.paymentAuthorization.updateMany({ where: { paymentIntentId: intent.id }, data: { capturedAmountMinor: capturedAmount, status: fullCapture ? "CAPTURED" : "PARTIALLY_CAPTURED" } });
        if (fullCapture) await tx.paymentSession.updateMany({ where: { paymentIntentId: intent.id, status: { in: ["PENDING", "ACTIVE"] } }, data: { status: "COMPLETED", completedAt: new Date() } });
        await tx.auditLog.create({ data: { ...context, action: fullCapture ? "payment.captured" : "payment.partially_captured", entityType: "PaymentIntent", entityId: intent.id, after: { amountMinor: amount.toString(), capturedAmountMinor: capturedAmount.toString(), allocationIds: selected.map(({ id }) => id), transactionId: transaction.id } } });
        await tx.outboxEvent.create({ data: { aggregateType: "PaymentIntent", aggregateId: intent.id, eventType: fullCapture ? "PaymentCaptured" : "PaymentPartiallyCaptured", payload: { paymentIntentId: intent.id, amountMinor: amount.toString(), capturedAmountMinor: capturedAmount.toString(), currency: intent.currency, provider: intent.provider.code } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return this.get(paymentIntentId, context);
      throw error;
    }
    return this.get(paymentIntentId, context);
  }

  private async captureAllocation(tx: Prisma.TransactionClient, paymentIntentId: string, currency: string, transactionId: string, allocation: Awaited<ReturnType<PaymentSettlementService["get"]>>["allocations"][number]) {
    if (Number(allocation.netAmountMinor) > 0) await tx.financialLedgerEntry.create({ data: { debitAccount: `cash:provider:${allocation.paymentIntentId}`, creditAccount: `payable:supplier:${allocation.recipientOrganizationId}`, amountMinor: allocation.netAmountMinor, currency, referenceType: "PaymentIntent", referenceId: paymentIntentId, idempotencyKey: `capture:${paymentIntentId}:allocation:${allocation.id}:net`, metadata: { paymentAllocationId: allocation.id, supplierOrderId: allocation.supplierOrderId, paymentTransactionId: transactionId, kind: "supplier_net" } } });
    if (Number(allocation.platformFeeMinor) > 0) await tx.financialLedgerEntry.create({ data: { debitAccount: `cash:provider:${allocation.paymentIntentId}`, creditAccount: "revenue:marketplace", amountMinor: allocation.platformFeeMinor, currency, referenceType: "PaymentIntent", referenceId: paymentIntentId, idempotencyKey: `capture:${paymentIntentId}:allocation:${allocation.id}:fee`, metadata: { paymentAllocationId: allocation.id, supplierOrderId: allocation.supplierOrderId, paymentTransactionId: transactionId, kind: "platform_fee" } } });
    await tx.paymentAllocation.update({ where: { id: allocation.id }, data: { status: "CAPTURED", payoutStatus: allocation.merchantAccount ? "READY" : "ON_HOLD" } });
    await tx.supplierOrder.update({ where: { id: allocation.supplierOrderId }, data: { paymentStatus: "PAID", status: "PAID", version: { increment: 1 } } });
    for (const item of allocation.supplierOrder.items) {
      const reservation = item.reservation;
      if (!reservation || reservation.status !== "ACTIVE" || Number(item.acceptedQuantity) <= 0) continue;
      const quantity = Number(reservation.quantity);
      const consumedBalance = await tx.inventoryBalance.updateMany({ where: { id: reservation.inventoryBalanceId, quantityReserved: { gte: quantity }, quantityOnHand: { gte: quantity } }, data: { quantityReserved: { decrement: quantity }, quantityOnHand: { decrement: quantity }, version: { increment: 1 } } });
      if (consumedBalance.count !== 1) throw new ConflictException("Reserved inventory cannot be consumed safely");
      if (reservation.inventoryLotId) {
        const consumedLot = await tx.inventoryLot.updateMany({ where: { id: reservation.inventoryLotId, quantityReserved: { gte: quantity }, quantityOnHand: { gte: quantity } }, data: { quantityReserved: { decrement: quantity }, quantityOnHand: { decrement: quantity }, version: { increment: 1 } } });
        if (consumedLot.count !== 1) throw new ConflictException("Reserved lot cannot be consumed safely");
        const lot = await tx.inventoryLot.findUniqueOrThrow({ where: { id: reservation.inventoryLotId } });
        if (Number(lot.quantityOnHand) === 0) await tx.inventoryLot.update({ where: { id: lot.id }, data: { status: "DEPLETED", quantityAvailable: 0 } });
      }
      await tx.inventoryReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED" } });
      if (reservation.externalReservation) await tx.externalReservation.update({ where: { id: reservation.externalReservation.id }, data: { status: "CONSUMED" } });
    }
    if (allocation.merchantAccount && Number(allocation.netAmountMinor) > 0) await tx.payout.upsert({ where: { idempotencyKey: `payout:${allocation.id}:capture` }, update: {}, create: { paymentAllocationId: allocation.id, merchantAccountId: allocation.merchantAccount.id, amountMinor: allocation.netAmountMinor, currency, status: allocation.merchantAccount.payoutStatus === "READY" ? "READY" : "ON_HOLD", idempotencyKey: `payout:${allocation.id}:capture` } });
  }

  async cancel(paymentIntentId: string, input: CancelPaymentIntentInput, context: SupplierActorContext) {
    const intent = await this.get(paymentIntentId, context);
    const replay = intent.transactions.find(({ idempotencyKey, type }) => idempotencyKey === input.idempotencyKey && type === "VOID");
    if (replay || intent.status === "CANCELLED") return intent;
    if (["CAPTURED", "PARTIALLY_CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(intent.status)) throw new ConflictException("Captured payment must be corrected through a refund");
    const { adapter, context: adapterContext } = this.registry.resolve(intent.provider);
    const result = await adapter.cancel(adapterContext, { paymentIntentId: intent.id, amountMinor: intent.totalAmountMinor.toString(), currency: intent.currency, idempotencyKey: input.idempotencyKey, reason: input.reason, parentExternalId: intent.authorization?.paymentTransactionId });
    await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.create({ data: { paymentIntentId: intent.id, providerId: intent.providerId, parentTransactionId: intent.authorization?.paymentTransactionId, type: "VOID", status: result.status === "SUCCEEDED" ? "SUCCEEDED" : "PROCESSING", amountMinor: intent.totalAmountMinor, currency: intent.currency, externalTransactionId: result.externalId, idempotencyKey: input.idempotencyKey, responsePayload: result.data as Prisma.InputJsonValue, processedAt: result.status === "SUCCEEDED" ? new Date() : null } });
      await tx.paymentIntent.update({ where: { id: intent.id }, data: { status: "CANCELLED" } });
      await tx.paymentAllocation.updateMany({ where: { paymentIntentId: intent.id, status: { in: ["PENDING", "AUTHORIZED"] } }, data: { status: "CANCELLED" } });
      await tx.paymentAuthorization.updateMany({ where: { paymentIntentId: intent.id }, data: { status: "VOIDED", voidedAmountMinor: intent.totalAmountMinor } });
      await tx.supplierOrder.updateMany({ where: { paymentAllocation: { paymentIntentId: intent.id } }, data: { paymentStatus: "UNPAID", version: { increment: 1 } } });
      await tx.paymentSession.updateMany({ where: { paymentIntentId: intent.id, status: { in: ["PENDING", "ACTIVE"] } }, data: { status: "CANCELLED", completedAt: new Date() } });
      await tx.auditLog.create({ data: { ...context, action: "payment.cancelled", entityType: "PaymentIntent", entityId: intent.id, after: { reason: input.reason, transactionId: transaction.id } } });
      await tx.outboxEvent.create({ data: { aggregateType: "PaymentIntent", aggregateId: intent.id, eventType: "PaymentCancelled", payload: { paymentIntentId: intent.id, reason: input.reason } } });
    });
    return this.get(paymentIntentId, context);
  }

  async refund(allocationId: string, input: CreateRefundInput, context: SupplierActorContext) {
    const allocation = await this.prisma.paymentAllocation.findUnique({ where: { id: allocationId }, include: { paymentIntent: { include: { provider: true } }, supplierOrder: true, refunds: { where: { status: "COMPLETED" } }, payouts: true } });
    if (!allocation) throw new NotFoundException("Payment allocation not found");
    if (allocation.recipientOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Refund belongs to another supplier");
    const replay = await this.prisma.refund.findUnique({ where: { paymentIntentId_idempotencyKey: { paymentIntentId: allocation.paymentIntentId, idempotencyKey: input.idempotencyKey } } });
    if (replay) return replay;
    if (!["CAPTURED", "PARTIALLY_REFUNDED"].includes(allocation.status)) throw new ConflictException("Only a captured allocation can be refunded");
    const gross = BigInt(allocation.grossAmountMinor.toString());
    const alreadyRefunded = BigInt(allocation.refundedAmountMinor.toString());
    const amount = BigInt(input.amountMinor);
    if (amount > gross - alreadyRefunded) throw new ConflictException("Refund exceeds the remaining captured allocation amount");
    if (input.supplierOrderItemId) {
      const item = await this.prisma.supplierOrderItem.findFirst({ where: { id: input.supplierOrderItemId, supplierOrderId: allocation.supplierOrderId } });
      if (!item) throw new NotFoundException("Supplier order item for refund not found");
      if (input.quantity && input.quantity > Number(item.acceptedQuantity)) throw new ConflictException("Refund quantity exceeds accepted quantity");
    }
    const capabilities = providerCapabilities(allocation.paymentIntent.provider.capabilities);
    if (amount !== gross - alreadyRefunded && capabilities.supports_partial_refund !== true) throw new ConflictException("Payment provider does not support partial refunds");
    const previousFeeRefund = allocation.refunds.reduce((sum, refund) => sum + BigInt(refund.platformFeeRefundMinor.toString()), 0n);
    const refundAllocation = calculateRefundAllocation({ grossAmountMinor: gross.toString(), platformFeeMinor: allocation.platformFeeMinor.toString(), alreadyRefundedMinor: alreadyRefunded.toString(), alreadyFeeRefundedMinor: previousFeeRefund.toString(), refundAmountMinor: amount.toString() });
    const cumulative = BigInt(refundAllocation.cumulativeRefundMinor);
    const feeRefund = BigInt(refundAllocation.platformFeeRefundMinor);
    const netRefund = BigInt(refundAllocation.netRefundMinor);
    const { adapter, context: adapterContext } = this.registry.resolve(allocation.paymentIntent.provider);
    const request = { paymentIntentId: allocation.paymentIntentId, paymentAllocationId: allocation.id, amountMinor: amount.toString(), currency: allocation.paymentIntent.currency, idempotencyKey: input.idempotencyKey, reason: input.reason };
    const result = await adapter.refund(adapterContext, request);
    if (result.status === "FAILED") throw new ConflictException("Payment provider declined refund");

    return this.prisma.$transaction(async (tx) => {
      const captureTransaction = await tx.paymentTransaction.findFirst({ where: { paymentIntentId: allocation.paymentIntentId, type: "CAPTURE", status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } });
      const transaction = await tx.paymentTransaction.create({ data: { paymentIntentId: allocation.paymentIntentId, paymentAllocationId: allocation.id, providerId: allocation.paymentIntent.providerId, parentTransactionId: captureTransaction?.id, type: "REFUND", status: "SUCCEEDED", amountMinor: new Prisma.Decimal(amount.toString()), currency: allocation.paymentIntent.currency, externalTransactionId: result.externalId, idempotencyKey: input.idempotencyKey, requestPayload: request as Prisma.InputJsonValue, responsePayload: result.data as Prisma.InputJsonValue, processedAt: new Date() } });
      const refund = await tx.refund.create({ data: { paymentIntentId: allocation.paymentIntentId, paymentAllocationId: allocation.id, supplierOrderId: allocation.supplierOrderId, supplierOrderItemId: input.supplierOrderItemId, paymentTransactionId: transaction.id, amountMinor: new Prisma.Decimal(amount.toString()), platformFeeRefundMinor: new Prisma.Decimal(feeRefund.toString()), netRefundMinor: new Prisma.Decimal(netRefund.toString()), quantity: input.quantity, reason: input.reason, status: "COMPLETED", idempotencyKey: input.idempotencyKey, externalRefundId: result.externalId, completedAt: new Date() } });
      if (netRefund > 0n) await tx.financialLedgerEntry.create({ data: { debitAccount: `payable:supplier:${allocation.recipientOrganizationId}`, creditAccount: `cash:provider:${allocation.paymentIntentId}`, amountMinor: new Prisma.Decimal(netRefund.toString()), currency: allocation.paymentIntent.currency, referenceType: "PaymentIntent", referenceId: allocation.paymentIntentId, idempotencyKey: `refund:${refund.id}:net`, metadata: { refundId: refund.id, paymentAllocationId: allocation.id, paymentTransactionId: transaction.id, kind: "supplier_net_reversal" } } });
      if (feeRefund > 0n) await tx.financialLedgerEntry.create({ data: { debitAccount: "revenue:marketplace", creditAccount: `cash:provider:${allocation.paymentIntentId}`, amountMinor: new Prisma.Decimal(feeRefund.toString()), currency: allocation.paymentIntent.currency, referenceType: "PaymentIntent", referenceId: allocation.paymentIntentId, idempotencyKey: `refund:${refund.id}:fee`, metadata: { refundId: refund.id, paymentAllocationId: allocation.id, paymentTransactionId: transaction.id, kind: "platform_fee_reversal" } } });
      const nextRefunded = new Prisma.Decimal(cumulative.toString());
      const fullAllocationRefund = cumulative === gross;
      await tx.paymentAllocation.update({ where: { id: allocation.id }, data: { refundedAmountMinor: nextRefunded, status: fullAllocationRefund ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      await tx.supplierOrder.update({ where: { id: allocation.supplierOrderId }, data: { paymentStatus: fullAllocationRefund ? "REFUNDED" : "PARTIALLY_REFUNDED", version: { increment: 1 } } });
      const openPayout = allocation.payouts.find(({ status }) => ["READY", "ON_HOLD"].includes(status));
      if (openPayout) await tx.payout.update({ where: { id: openPayout.id }, data: { amountMinor: { decrement: new Prisma.Decimal(netRefund.toString()) }, status: BigInt(openPayout.amountMinor.toString()) === netRefund ? "CANCELLED" : openPayout.status } });
      const totals = await tx.paymentAllocation.aggregate({ where: { paymentIntentId: allocation.paymentIntentId }, _sum: { refundedAmountMinor: true, grossAmountMinor: true } });
      const fullIntentRefund = (totals._sum.refundedAmountMinor ?? new Prisma.Decimal(0)).gte(totals._sum.grossAmountMinor ?? new Prisma.Decimal(0));
      await tx.paymentIntent.update({ where: { id: allocation.paymentIntentId }, data: { status: fullIntentRefund ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      await tx.auditLog.create({ data: { ...context, action: fullAllocationRefund ? "payment.refunded" : "payment.partially_refunded", entityType: "Refund", entityId: refund.id, after: { paymentIntentId: allocation.paymentIntentId, paymentAllocationId: allocation.id, amountMinor: amount.toString(), netRefundMinor: netRefund.toString(), platformFeeRefundMinor: feeRefund.toString(), reason: input.reason } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Refund", aggregateId: refund.id, eventType: "RefundCompleted", payload: { refundId: refund.id, paymentIntentId: allocation.paymentIntentId, supplierOrderId: allocation.supplierOrderId, amountMinor: amount.toString(), currency: allocation.paymentIntent.currency } } });
      return refund;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async payouts(query: PaymentOperationsQueryInput, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.payout.findMany({ where: { ...(query.status ? { status: query.status as never } : {}), ...(operator ? {} : { merchantAccount: { organizationId: context.organizationId } }) }, include: { merchantAccount: { include: { organization: true, provider: true } }, paymentAllocation: { include: { supplierOrder: true } } }, orderBy: { createdAt: "desc" }, take: query.limit });
  }

  async processPayout(payoutId: string, input: ProcessPayoutInput, context: SupplierActorContext) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId }, include: { merchantAccount: { include: { provider: true } }, paymentAllocation: { include: { paymentIntent: true } } } });
    if (!payout) throw new NotFoundException("Payout not found");
    if (payout.merchantAccount.organizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Payout belongs to another supplier");
    if (payout.status === "PAID") return payout;
    if (payout.status !== "READY" || payout.merchantAccount.payoutStatus !== "READY" || !payout.merchantAccount.externalMerchantId) throw new ConflictException("Payout or merchant account is not ready");
    if (Number(payout.amountMinor) === 0) throw new ConflictException("Zero payout cannot be processed");
    const { adapter, context: adapterContext } = this.registry.resolve(payout.merchantAccount.provider);
    const request = { paymentIntentId: payout.paymentAllocation.paymentIntentId, amountMinor: payout.amountMinor.toString(), currency: payout.currency, idempotencyKey: input.idempotencyKey, paymentAllocationId: payout.paymentAllocationId, merchantExternalId: payout.merchantAccount.externalMerchantId };
    const result = await adapter.payout(adapterContext, request);
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.create({ data: { paymentIntentId: payout.paymentAllocation.paymentIntentId, paymentAllocationId: payout.paymentAllocationId, providerId: payout.merchantAccount.providerId, type: "PAYOUT", status: result.status === "SUCCEEDED" ? "SUCCEEDED" : "PROCESSING", amountMinor: payout.amountMinor, currency: payout.currency, externalTransactionId: result.externalId, idempotencyKey: input.idempotencyKey, requestPayload: request as Prisma.InputJsonValue, responsePayload: result.data as Prisma.InputJsonValue, processedAt: result.status === "SUCCEEDED" ? new Date() : null } });
      const paid = await tx.payout.update({ where: { id: payout.id }, data: { paymentTransactionId: transaction.id, status: result.status === "SUCCEEDED" ? "PAID" : "PROCESSING", externalPayoutId: result.externalId, paidAt: result.status === "SUCCEEDED" ? new Date() : null } });
      await tx.paymentAllocation.update({ where: { id: payout.paymentAllocationId }, data: { payoutStatus: paid.status } });
      if (result.status === "SUCCEEDED") await tx.financialLedgerEntry.create({ data: { debitAccount: `payable:supplier:${payout.merchantAccount.organizationId}`, creditAccount: `settlement:provider:${payout.merchantAccount.provider.code}`, amountMinor: payout.amountMinor, currency: payout.currency, referenceType: "PaymentIntent", referenceId: payout.paymentAllocation.paymentIntentId, idempotencyKey: `payout:${payout.id}:settlement`, metadata: { payoutId: payout.id, paymentAllocationId: payout.paymentAllocationId, paymentTransactionId: transaction.id, kind: "supplier_payout" } } });
      await tx.auditLog.create({ data: { ...context, action: "payment.payout.processed", entityType: "Payout", entityId: payout.id, before: payout, after: paid } });
      await tx.outboxEvent.create({ data: { aggregateType: "Payout", aggregateId: payout.id, eventType: result.status === "SUCCEEDED" ? "PayoutPaid" : "PayoutProcessing", payload: { payoutId: payout.id, paymentAllocationId: payout.paymentAllocationId, amountMinor: payout.amountMinor.toString(), currency: payout.currency } } });
      return paid;
    });
  }

  async reconcile(paymentIntentId: string, context: SupplierActorContext) {
    const intent = await this.get(paymentIntentId, context);
    const allocationGross = intent.allocations.reduce((sum, allocation) => sum + BigInt(allocation.grossAmountMinor.toString()), 0n);
    const allocationInvariant = intent.allocations.every((allocation) => BigInt(allocation.grossAmountMinor.toString()) === BigInt(allocation.platformFeeMinor.toString()) + BigInt(allocation.netAmountMinor.toString()));
    const captureTransactions = intent.transactions.filter(({ type, status }) => type === "CAPTURE" && status === "SUCCEEDED").reduce((sum, transaction) => sum + BigInt(transaction.amountMinor.toString()), 0n);
    const captureRecords = intent.captures.reduce((sum, capture) => sum + BigInt(capture.amountMinor.toString()), 0n);
    const refundTransactions = intent.transactions.filter(({ type, status }) => type === "REFUND" && status === "SUCCEEDED").reduce((sum, transaction) => sum + BigInt(transaction.amountMinor.toString()), 0n);
    const refundRecords = intent.refunds.filter(({ status }) => status === "COMPLETED").reduce((sum, refund) => sum + BigInt(refund.amountMinor.toString()), 0n);
    const payoutTransactions = intent.transactions.filter(({ type, status }) => type === "PAYOUT" && status === "SUCCEEDED").reduce((sum, transaction) => sum + BigInt(transaction.amountMinor.toString()), 0n);
    const paidPayouts = intent.allocations.flatMap(({ payouts }) => payouts).filter(({ status }) => status === "PAID").reduce((sum, payout) => sum + BigInt(payout.amountMinor.toString()), 0n);
    const expected = { totalAmountMinor: intent.totalAmountMinor.toString(), allocationGross: allocationGross.toString(), captureTransactions: captureTransactions.toString(), refundTransactions: refundTransactions.toString(), payoutTransactions: payoutTransactions.toString() };
    const actual = { allocationInvariant, captureRecords: captureRecords.toString(), refundRecords: refundRecords.toString(), paidPayouts: paidPayouts.toString() };
    const matched = allocationGross === BigInt(intent.totalAmountMinor.toString()) && allocationInvariant && captureTransactions === captureRecords && refundTransactions === refundRecords && payoutTransactions === paidPayouts;
    const existing = await this.prisma.paymentReconciliationEntry.findFirst({ where: { providerId: intent.providerId, paymentIntentId: intent.id, externalRef: `intent:${intent.id}`, status: { not: "RESOLVED" } }, orderBy: { detectedAt: "desc" } });
    const entry = existing
      ? await this.prisma.paymentReconciliationEntry.update({ where: { id: existing.id }, data: { status: matched ? "MATCHED" : "MISMATCH", expected, actual, detectedAt: new Date(), resolvedAt: matched ? new Date() : null, resolution: matched ? "Automatic financial reconciliation matched" : null } })
      : await this.prisma.paymentReconciliationEntry.create({ data: { providerId: intent.providerId, paymentIntentId: intent.id, externalRef: `intent:${intent.id}`, status: matched ? "MATCHED" : "MISMATCH", expected, actual, resolvedAt: matched ? new Date() : null, resolution: matched ? "Automatic financial reconciliation matched" : null } });
    await this.prisma.auditLog.create({ data: { ...context, action: "payment.reconciled", entityType: "PaymentReconciliationEntry", entityId: entry.id, after: { paymentIntentId: intent.id, status: entry.status, expected, actual } } });
    return entry;
  }

  async importReconciliation(input: PaymentReconciliationImportInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Marketplace operator access is required");
    const provider = await this.prisma.paymentProvider.findUnique({ where: { code: input.providerCode } });
    if (!provider) throw new NotFoundException("Payment provider not found");
    const entries = [];
    for (const record of input.records) {
      const transaction = await this.prisma.paymentTransaction.findFirst({ where: { providerId: provider.id, externalTransactionId: record.externalTransactionId } });
      const matched = Boolean(transaction) && transaction!.type === record.type && transaction!.status === record.status && Number(transaction!.amountMinor) === record.amountMinor && transaction!.currency === record.currency;
      entries.push(await this.prisma.paymentReconciliationEntry.create({ data: { providerId: provider.id, paymentIntentId: transaction?.paymentIntentId, paymentTransactionId: transaction?.id, externalRef: record.externalTransactionId, status: !transaction ? "MISSING_INTERNAL" : matched ? "MATCHED" : "MISMATCH", expected: record as Prisma.InputJsonValue, actual: transaction ? { type: transaction.type, status: transaction.status, amountMinor: transaction.amountMinor.toString(), currency: transaction.currency } : Prisma.JsonNull, resolvedAt: matched ? new Date() : null, resolution: matched ? "Imported provider register matched" : null } }));
    }
    await this.prisma.auditLog.create({ data: { ...context, action: "payment.reconciliation.imported", entityType: "PaymentProvider", entityId: provider.id, after: { recordCount: input.records.length, matched: entries.filter(({ status }) => status === "MATCHED").length } } });
    return entries;
  }

  async reconciliation(query: PaymentOperationsQueryInput, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.paymentReconciliationEntry.findMany({ where: { ...(query.status ? { status: query.status as never } : {}), ...(query.providerCode ? { provider: { code: query.providerCode } } : {}), ...(operator ? {} : { OR: [{ paymentIntent: { buyerOrganizationId: context.organizationId } }, { paymentIntent: { allocations: { some: { recipientOrganizationId: context.organizationId } } } }] }) }, include: { provider: true, paymentIntent: true, paymentTransaction: true }, orderBy: { detectedAt: "desc" }, take: query.limit });
  }

  private requireMerchantAccounts(allocations: Array<{ merchantAccount: { onboardingStatus: string; verificationStatus: string; payoutStatus: string } | null }>) {
    const unavailable = allocations.find(({ merchantAccount }) => !merchantAccount || merchantAccount.onboardingStatus !== "ACTIVE" || merchantAccount.verificationStatus !== "VERIFIED" || merchantAccount.payoutStatus !== "READY");
    if (unavailable) throw new ConflictException("Every supplier must complete payment-provider onboarding before authorization or capture");
  }
}
