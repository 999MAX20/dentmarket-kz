import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { NotificationChannel } from "@prisma/client";
import { HttpNotificationAdapter, InAppNotificationAdapter, MockNotificationAdapter, WebhookNotificationAdapter } from "./notification-adapters";

@Injectable()
export class NotificationAdapterRegistry {
  private readonly inApp = new InAppNotificationAdapter();
  private readonly webhook = new WebhookNotificationAdapter();
  resolve(channel: NotificationChannel) {
    if (channel === "IN_APP") return this.inApp;
    if (channel === "WEBHOOK") return this.webhook;
    const prefix = channel === "EMAIL" ? "EMAIL" : "SMS";
    const endpoint = process.env[`${prefix}_PROVIDER_URL`];
    if (endpoint) return new HttpNotificationAdapter(endpoint, prefix.toLowerCase(), process.env[`${prefix}_PROVIDER_TOKEN`]);
    if (process.env.NODE_ENV === "production") throw new ServiceUnavailableException(`${prefix} provider is not configured`);
    return new MockNotificationAdapter(`mock-${prefix.toLowerCase()}`);
  }

  capabilities() {
    return { channels: ["IN_APP", "EMAIL", "SMS", "WEBHOOK"], emailProviderConfigured: Boolean(process.env.EMAIL_PROVIDER_URL), smsProviderConfigured: Boolean(process.env.SMS_PROVIDER_URL), webhookSigned: true };
  }
}
