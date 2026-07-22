import { pushSubscriptionSchema } from "@marketplace/schemas";
import { describe, expect, it } from "vitest";
import { NotificationAdapterRegistry } from "./notification-adapter-registry.service";

describe("browser push notification flow", () => {
  it("accepts a browser subscription payload", () => {
    const result = pushSubscriptionSchema.safeParse({
      endpoint: "https://push.example.test/subscriptions/demo",
      keys: { p256dh: "p256dh-key-value-123456", auth: "auth-key-12345678" },
      userAgent: "DentMarket test browser",
    });

    expect(result.success).toBe(true);
  });

  it("rejects malformed or incomplete subscriptions", () => {
    const result = pushSubscriptionSchema.safeParse({
      endpoint: "not-a-url",
      keys: { p256dh: "short", auth: "short" },
    });

    expect(result.success).toBe(false);
  });

  it("exposes WEB_PUSH in notification capabilities", () => {
    const capabilities = new NotificationAdapterRegistry().capabilities();

    expect(capabilities.channels).toContain("WEB_PUSH");
    expect(capabilities).toHaveProperty("webPushConfigured");
  });
});
