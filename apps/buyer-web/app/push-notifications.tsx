"use client";
import { Button } from "@fluentui/react-components";
import { Alert24Regular } from "@fluentui/react-icons";
import { useState } from "react";

function toBytes(value: string) { const padding = "=".repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob((value + padding).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)); }
export function PushNotifications({ apiBase, organizationId, accessToken, actorId }: { apiBase: string; organizationId: string; accessToken?: string; actorId?: string }) {
  const [state, setState] = useState<"idle" | "enabled" | "error">("idle");
  async function enable() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Браузер не поддерживает push");
      const permission = await Notification.requestPermission(); if (permission !== "granted") throw new Error("Разрешение не выдано");
      const registration = await navigator.serviceWorker.register("/push-sw.js");
      const headers = { "content-type": "application/json", authorization: accessToken ? `Bearer ${accessToken}` : "", "x-user-id": actorId || "", "x-organization-id": organizationId };
      const capability = await fetch(`${apiBase}/notifications/capabilities`, { headers }).then((r) => r.json());
      if (!capability.webPushPublicKey) throw new Error("VAPID-ключ не настроен");
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(capability.webPushPublicKey) });
      const response = await fetch(`${apiBase}/notifications/push/subscriptions`, { method: "POST", headers, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error(`Push subscription failed: ${response.status}`);
      setState("enabled");
    } catch { setState("error"); }
  }
  async function disable() {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return setState("idle");
      const headers = { "content-type": "application/json", authorization: accessToken ? `Bearer ${accessToken}` : "", "x-user-id": actorId || "", "x-organization-id": organizationId };
      const response = await fetch(`${apiBase}/notifications/push/subscriptions/remove`, { method: "POST", headers, body: JSON.stringify({ endpoint: subscription.endpoint }) });
      if (!response.ok) throw new Error(`Push unsubscribe failed: ${response.status}`);
      await subscription.unsubscribe(); setState("idle");
    } catch { setState("error"); }
  }
  return state === "enabled" ? (
    <Button
      appearance="subtle"
      icon={<Alert24Regular />}
      onClick={() => void disable()}
    >
      Уведомления включены
    </Button>
  ) : (
    <Button
      appearance="subtle"
      icon={<Alert24Regular />}
      onClick={() => void enable()}
    >
      {state === "error" ? "Повторить подключение" : "Уведомления"}
    </Button>
  );
}
