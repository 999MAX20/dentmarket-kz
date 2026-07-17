import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { PrismaService } from "../../platform/prisma/prisma.service";
import { PaymentWebhooksService } from "./payment-webhooks.service";

describe("payment webhook signatures", () => {
  it("accepts only the matching HMAC-SHA256 signature", () => {
    const service = new PaymentWebhooksService({} as PrismaService);
    const body = Buffer.from(JSON.stringify({ id: "evt-1", type: "capture.succeeded" }));
    const now = Date.UTC(2026, 6, 17, 0, 0, 0);
    const timestamp = String(Math.floor(now / 1_000));
    const signature = createHmac("sha256", "webhook-secret").update(timestamp).update(".").update(body).digest("hex");
    expect(service.verify(body, `sha256=${signature}`, "webhook-secret", timestamp, now)).toBe(true);
    expect(service.verify(body, signature.replace(/^./, signature[0] === "a" ? "b" : "a"), "webhook-secret", timestamp, now)).toBe(false);
    expect(service.verify(body, undefined, "webhook-secret", timestamp, now)).toBe(false);
    expect(service.verify(body, signature, "webhook-secret", String(Math.floor((now - 301_000) / 1_000)), now)).toBe(false);
  });
});
