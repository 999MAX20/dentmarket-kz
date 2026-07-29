export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "AUTHORIZED"
  | "PAID"
  | "PARTIALLY_PAID"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type PaymentProviderCode = "FREEDOM_PAY" | "KASPI" | "HALYK" | "BCC" | (string & {});

export * from "./commerce-profile.js";

export type Money = {
  amountMinor: string;
  currency: string;
};

export type PaymentSplit = {
  supplierOrderId: string;
  supplierOrganizationId: string;
  amount: Money;
  platformFee: Money;
  netAmount: Money;
  externalMerchantId?: string;
};

export type PaymentIntent = {
  id: string;
  buyerOrderId: string;
  providerCode: PaymentProviderCode;
  total: Money;
  status: PaymentStatus;
  splits: PaymentSplit[];
  idempotencyKey: string;
};

export type PaymentProviderContext = {
  providerId: string;
  providerCode: PaymentProviderCode;
  capabilities: Readonly<Record<string, unknown>>;
};

export type ProviderResult = {
  externalId: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  data: Readonly<Record<string, unknown>>;
};

export type PaymentRequest = {
  paymentIntentId: string;
  amount: Money;
  idempotencyKey: string;
  allocationIds?: string[];
  parentExternalId?: string;
};

export type CheckoutRequest = PaymentRequest & {
  returnUrl?: string;
  splitCount: number;
};

export type WebhookEvent = {
  providerCode: PaymentProviderCode;
  externalEventId: string;
  externalPaymentId?: string;
  status: PaymentStatus;
  idempotencyKey: string;
  payload: Readonly<Record<string, unknown>>;
};

export type CreditApplication = {
  id: string;
  buyerOrganizationId: string;
  amount: Money;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  externalId?: string;
};

export interface PaymentProviderAdapter {
  readonly code: PaymentProviderCode;
  createPayment(context: PaymentProviderContext, input: CheckoutRequest): Promise<ProviderResult & { checkoutUrl?: string }>;
  authorize(context: PaymentProviderContext, input: PaymentRequest): Promise<ProviderResult>;
  capture(context: PaymentProviderContext, input: PaymentRequest): Promise<ProviderResult>;
  cancel(context: PaymentProviderContext, input: PaymentRequest & { reason: string }): Promise<ProviderResult>;
  refund(context: PaymentProviderContext, input: PaymentRequest & { reason: string }): Promise<ProviderResult>;
  createSplit(context: PaymentProviderContext, input: PaymentRequest & { splits: PaymentSplit[] }): Promise<ProviderResult>;
  getStatus(context: PaymentProviderContext, paymentIntentId: string): Promise<ProviderResult>;
  parseWebhook(context: PaymentProviderContext, rawBody: Uint8Array, headers: Readonly<Record<string, string | undefined>>): WebhookEvent;
  createCreditApplication(context: PaymentProviderContext, input: { buyerOrganizationId: string; amount: Money; idempotencyKey: string }): Promise<ProviderResult>;
  getCreditStatus(context: PaymentProviderContext, applicationId: string): Promise<ProviderResult>;
  cancelCreditApplication(context: PaymentProviderContext, applicationId: string, idempotencyKey: string): Promise<ProviderResult>;
}

export function assertIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 16 || key.length > 128) throw new Error("Idempotency key must be 16-128 characters");
  return key;
}

export function calculateSplit(grossAmountMinor: string, feeBasisPoints: number, currency: string, supplierOrderId: string, supplierOrganizationId: string): PaymentSplit {
  const gross = BigInt(grossAmountMinor);
  if (gross <= 0n) throw new Error("Gross amount must be positive");
  if (!Number.isInteger(feeBasisPoints) || feeBasisPoints < 0 || feeBasisPoints > 10_000) throw new Error("Invalid fee basis points");
  const fee = (gross * BigInt(feeBasisPoints)) / 10_000n;
  const money = (amountMinor: bigint): Money => ({ amountMinor: amountMinor.toString(), currency });
  return { supplierOrderId, supplierOrganizationId, amount: money(gross), platformFee: money(fee), netAmount: money(gross - fee) };
}
