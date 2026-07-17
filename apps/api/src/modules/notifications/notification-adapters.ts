import { createHmac, randomUUID } from "node:crypto";

export type NotificationMessage = { id: string; channel: "IN_APP" | "EMAIL" | "SMS" | "WEBHOOK"; destination?: string | null; subject: string; body: string; payload?: unknown };
export type NotificationDeliveryResult = { externalMessageId: string; provider: string; response: Record<string, unknown> };
export interface NotificationAdapter { send(message: NotificationMessage): Promise<NotificationDeliveryResult>; }

export class InAppNotificationAdapter implements NotificationAdapter {
  async send(message: NotificationMessage) { return { externalMessageId: message.id, provider: "database", response: { stored: true } }; }
}

export class MockNotificationAdapter implements NotificationAdapter {
  constructor(private readonly provider: string) {}
  async send() { return { externalMessageId: `mock-${randomUUID()}`, provider: this.provider, response: { accepted: true, mock: true } }; }
}

export class HttpNotificationAdapter implements NotificationAdapter {
  constructor(private readonly endpoint: string, private readonly provider: string, private readonly token?: string) {}
  async send(message: NotificationMessage) {
    const response = await fetch(this.endpoint, { method: "POST", headers: { "content-type": "application/json", ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) }, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`${this.provider} returned HTTP ${response.status}`);
    return { externalMessageId: response.headers.get("x-message-id") ?? `${this.provider}-${randomUUID()}`, provider: this.provider, response: { status: response.status } };
  }
}

export class WebhookNotificationAdapter implements NotificationAdapter {
  async send(message: NotificationMessage) {
    if (!message.destination || !/^https?:\/\//.test(message.destination)) throw new Error("Webhook notification destination is missing or invalid");
    const body = JSON.stringify({ id: message.id, subject: message.subject, body: message.body, payload: message.payload });
    const secret = process.env.NOTIFICATION_WEBHOOK_SECRET ?? "local-webhook-secret";
    const signature = createHmac("sha256", secret).update(body).digest("hex");
    const response = await fetch(message.destination, { method: "POST", headers: { "content-type": "application/json", "x-marketplace-signature": signature, "x-marketplace-event-id": message.id }, body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
    return { externalMessageId: response.headers.get("x-request-id") ?? `webhook-${randomUUID()}`, provider: "signed-webhook", response: { status: response.status } };
  }
}
