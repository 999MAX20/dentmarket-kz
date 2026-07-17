import { BadGatewayException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { PaymentAdapterContext, PaymentAdapterResult, PaymentMoneyRequest, PaymentProviderAdapter, PaymentSessionRequest } from "./payment-adapter";

type GatewayResponse = { externalId?: string; status?: string; checkoutUrl?: string; expiresAt?: string; data?: Record<string, unknown>; [key: string]: unknown };

@Injectable()
export class HttpPaymentAdapter implements PaymentProviderAdapter {
  readonly code = "EXTERNAL";

  private async invoke(operation: string, context: PaymentAdapterContext, input: Record<string, unknown>) {
    const baseUrl = process.env.PAYMENT_GATEWAY_URL;
    const token = process.env.PAYMENT_GATEWAY_TOKEN;
    if (!baseUrl || !token) throw new ServiceUnavailableException("External payment gateway is not configured");
    const idempotencyKey = String(input.idempotencyKey ?? "");
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${operation}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "idempotency-key": idempotencyKey, "x-marketplace-provider": context.providerCode },
      body: JSON.stringify({ providerId: context.providerId, capabilities: context.capabilities, ...input }),
      signal: AbortSignal.timeout(15_000),
    }).catch((cause) => { throw new BadGatewayException(`Payment gateway request failed: ${cause instanceof Error ? cause.message : "network error"}`); });
    const payload = await response.json().catch(() => null) as GatewayResponse | null;
    if (!response.ok || !payload?.externalId) throw new BadGatewayException(`Payment gateway returned HTTP ${response.status}`);
    const status: PaymentAdapterResult["status"] = payload.status === "SUCCEEDED" ? "SUCCEEDED" : payload.status === "FAILED" ? "FAILED" : "PENDING";
    return { externalId: payload.externalId, status, data: payload.data ?? payload, checkoutUrl: typeof payload.checkoutUrl === "string" ? payload.checkoutUrl : undefined, expiresAt: typeof payload.expiresAt === "string" ? new Date(payload.expiresAt) : undefined };
  }

  onboardMerchant(context: PaymentAdapterContext, input: { organizationId: string; returnUrl?: string | null; idempotencyKey: string }) { return this.invoke("merchants/onboard", context, input); }
  createSession(context: PaymentAdapterContext, input: PaymentSessionRequest) { return this.invoke("sessions", context, input); }
  authorize(context: PaymentAdapterContext, input: PaymentMoneyRequest) { return this.invoke("authorize", context, input); }
  capture(context: PaymentAdapterContext, input: PaymentMoneyRequest) { return this.invoke("capture", context, input); }
  cancel(context: PaymentAdapterContext, input: PaymentMoneyRequest & { reason: string }) { return this.invoke("cancel", context, input); }
  refund(context: PaymentAdapterContext, input: PaymentMoneyRequest & { paymentAllocationId: string; reason: string }) { return this.invoke("refund", context, input); }
  payout(context: PaymentAdapterContext, input: PaymentMoneyRequest & { merchantExternalId: string }) { return this.invoke("payout", context, input); }
}
