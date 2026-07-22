import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { NotificationChannel } from "@prisma/client";
import { HttpNotificationAdapter, InAppNotificationAdapter, MockNotificationAdapter, WebhookNotificationAdapter, WebPushNotificationAdapter } from "./notification-adapters";

@Injectable()
export class NotificationAdapterRegistry {
  private readonly inApp = new InAppNotificationAdapter();
  private readonly webhook = new WebhookNotificationAdapter();
  resolve(channel: NotificationChannel) {
    if (channel === "IN_APP") return this.inApp;
    if (channel === "WEBHOOK") return this.webhook;
    if (channel === "WEB_PUSH") {
      const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
      const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
      const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
      if (subject && publicKey && privateKey) return new WebPushNotificationAdapter(subject, publicKey, privateKey);
      if (process.env.NODE_ENV === "production") throw new ServiceUnavailableException("Web push VAPID keys are not configured");
      return new MockNotificationAdapter("mock-web-push");
    }
    const prefix = channel === "EMAIL" ? "EMAIL" : "SMS";
    const endpoint = process.env[`${prefix}_PROVIDER_URL`];
    if (endpoint) return new HttpNotificationAdapter(endpoint, prefix.toLowerCase(), process.env[`${prefix}_PROVIDER_TOKEN`]);
    if (process.env.NODE_ENV === "production") throw new ServiceUnavailableException(`${prefix} provider is not configured`);
    return new MockNotificationAdapter(`mock-${prefix.toLowerCase()}`);
  }

  capabilities() {
    return { channels: ["IN_APP", "EMAIL", "SMS", "WEBHOOK", "WEB_PUSH"], emailProviderConfigured: Boolean(process.env.EMAIL_PROVIDER_URL), smsProviderConfigured: Boolean(process.env.SMS_PROVIDER_URL), webPushConfigured: Boolean(process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY), webPushPublicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY ?? null, webhookSigned: true };
  }
}
