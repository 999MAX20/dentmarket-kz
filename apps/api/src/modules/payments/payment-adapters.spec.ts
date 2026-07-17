import { describe, expect, it } from "vitest";
import { MockPaymentAdapter } from "./adapters/mock-payment.adapter";
import { HttpPaymentAdapter } from "./adapters/http-payment.adapter";

const context = { providerId: "00000000-0000-4000-8000-000000000050", providerCode: "MOCK", capabilities: {} };

describe("payment provider adapters", () => {
  it("keeps capture and refund provider references idempotent", async () => {
    const adapter = new MockPaymentAdapter();
    const capture = { paymentIntentId: "intent-1", amountMinor: "1000", currency: "KZT", idempotencyKey: "capture-key-1" };
    expect((await adapter.capture(context, capture)).externalId).toBe((await adapter.capture(context, capture)).externalId);
    const refund = { ...capture, paymentAllocationId: "allocation-1", reason: "return", idempotencyKey: "refund-key-1" };
    expect((await adapter.refund(context, refund)).externalId).toBe((await adapter.refund(context, refund)).externalId);
  });

  it("returns a single mock checkout session", async () => {
    const adapter = new MockPaymentAdapter();
    const result = await adapter.createSession(context, { paymentIntentId: "intent-1", amountMinor: "1000", currency: "KZT", allocationCount: 2, idempotencyKey: "session-key-1" });
    expect(result.checkoutUrl).toContain(result.externalId);
    expect(result.status).toBe("SUCCEEDED");
  });

  it("sends external PSP requests with bearer and idempotency headers", async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.PAYMENT_GATEWAY_URL;
    const originalToken = process.env.PAYMENT_GATEWAY_TOKEN;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    process.env.PAYMENT_GATEWAY_URL = "https://pay.example.kz";
    process.env.PAYMENT_GATEWAY_TOKEN = "secret-token";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ externalId: "psp-42", status: "SUCCEEDED", checkoutUrl: "https://pay.example.kz/42" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      const adapter = new HttpPaymentAdapter();
      const result = await adapter.createSession({ ...context, providerCode: "KASPI" }, { paymentIntentId: "intent-42", amountMinor: "2500", currency: "KZT", allocationCount: 1, idempotencyKey: "idem-42" });
      expect(result.externalId).toBe("psp-42");
      expect(calls[0]?.url).toBe("https://pay.example.kz/sessions");
      expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe("Bearer secret-token");
      expect(new Headers(calls[0]?.init.headers).get("idempotency-key")).toBe("idem-42");
      expect(new Headers(calls[0]?.init.headers).get("x-marketplace-provider")).toBe("KASPI");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.PAYMENT_GATEWAY_URL; else process.env.PAYMENT_GATEWAY_URL = originalUrl;
      if (originalToken === undefined) delete process.env.PAYMENT_GATEWAY_TOKEN; else process.env.PAYMENT_GATEWAY_TOKEN = originalToken;
    }
  });
});
