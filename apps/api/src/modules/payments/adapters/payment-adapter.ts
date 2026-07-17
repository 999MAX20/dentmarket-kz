export type PaymentAdapterContext = {
  providerId: string;
  providerCode: string;
  capabilities: Record<string, unknown>;
};

export type PaymentAdapterResult = {
  externalId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  data: Record<string, unknown>;
};

export type PaymentSessionRequest = {
  paymentIntentId: string;
  amountMinor: string;
  currency: string;
  allocationCount: number;
  returnUrl?: string | null;
  idempotencyKey: string;
};

export type PaymentMoneyRequest = {
  paymentIntentId: string;
  amountMinor: string;
  currency: string;
  idempotencyKey: string;
  allocationIds?: string[];
  parentExternalId?: string;
};

export interface PaymentProviderAdapter {
  readonly code: string;
  onboardMerchant(context: PaymentAdapterContext, input: { organizationId: string; returnUrl?: string | null; idempotencyKey: string }): Promise<PaymentAdapterResult>;
  createSession(context: PaymentAdapterContext, input: PaymentSessionRequest): Promise<PaymentAdapterResult & { checkoutUrl?: string; expiresAt?: Date }>;
  authorize(context: PaymentAdapterContext, input: PaymentMoneyRequest): Promise<PaymentAdapterResult>;
  capture(context: PaymentAdapterContext, input: PaymentMoneyRequest): Promise<PaymentAdapterResult>;
  cancel(context: PaymentAdapterContext, input: PaymentMoneyRequest & { reason: string }): Promise<PaymentAdapterResult>;
  refund(context: PaymentAdapterContext, input: PaymentMoneyRequest & { paymentAllocationId: string; reason: string }): Promise<PaymentAdapterResult>;
  payout(context: PaymentAdapterContext, input: PaymentMoneyRequest & { merchantExternalId: string }): Promise<PaymentAdapterResult>;
}

export function providerCapabilities(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
