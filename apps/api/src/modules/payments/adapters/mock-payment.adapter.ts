import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { PaymentAdapterContext, PaymentAdapterResult, PaymentMoneyRequest, PaymentProviderAdapter, PaymentSessionRequest } from "./payment-adapter";

@Injectable()
export class MockPaymentAdapter implements PaymentProviderAdapter {
  readonly code = "MOCK";

  private result(prefix: string, idempotencyKey: string, data: Record<string, unknown> = {}): PaymentAdapterResult {
    const digest = createHash("sha256").update(`${prefix}:${idempotencyKey}`).digest("hex").slice(0, 24);
    const externalId = `mock_${prefix}_${digest}`;
    return { externalId, status: "SUCCEEDED", data: { ...data, externalId, provider: this.code } };
  }

  async onboardMerchant(_context: PaymentAdapterContext, input: { organizationId: string; returnUrl?: string | null; idempotencyKey: string }) {
    return this.result("merchant", input.idempotencyKey, { organizationId: input.organizationId, onboardingStatus: "ACTIVE", verificationStatus: "VERIFIED" });
  }

  async createSession(_context: PaymentAdapterContext, input: PaymentSessionRequest) {
    const result = this.result("session", input.idempotencyKey, { amountMinor: input.amountMinor, currency: input.currency, allocationCount: input.allocationCount });
    return { ...result, checkoutUrl: `https://mock-pay.local/session/${result.externalId}`, expiresAt: new Date(Date.now() + 30 * 60_000) };
  }

  async authorize(_context: PaymentAdapterContext, input: PaymentMoneyRequest) {
    return this.result("authorization", input.idempotencyKey, { authorized: true, amountMinor: input.amountMinor, currency: input.currency });
  }

  async capture(_context: PaymentAdapterContext, input: PaymentMoneyRequest) {
    return this.result("capture", input.idempotencyKey, { captured: true, amountMinor: input.amountMinor, currency: input.currency, allocationIds: input.allocationIds ?? [] });
  }

  async cancel(_context: PaymentAdapterContext, input: PaymentMoneyRequest & { reason: string }) {
    return this.result("cancel", input.idempotencyKey, { cancelled: true, reason: input.reason });
  }

  async refund(_context: PaymentAdapterContext, input: PaymentMoneyRequest & { paymentAllocationId: string; reason: string }) {
    return this.result("refund", input.idempotencyKey, { refunded: true, amountMinor: input.amountMinor, paymentAllocationId: input.paymentAllocationId, reason: input.reason });
  }

  async payout(_context: PaymentAdapterContext, input: PaymentMoneyRequest & { merchantExternalId: string }) {
    return this.result("payout", input.idempotencyKey, { paid: true, amountMinor: input.amountMinor, merchantExternalId: input.merchantExternalId });
  }
}
