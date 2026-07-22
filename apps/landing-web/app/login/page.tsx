"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Capability = "BUYER" | "SUPPLIER";
type Session = {
  accessToken: string;
  sessionId?: string;
  activeOrganizationId?: string | null;
  organizationId?: string;
  organizationDisplayName?: string;
  capability?: Capability;
  user: { id: string; displayName: string; email: string };
};

declare global {
  interface Window {
    google?: { accounts: { id: { initialize(input: { client_id: string; callback: (response: { credential: string }) => void }): void; renderButton(element: HTMLElement, options: Record<string, unknown>): void } } };
    AppleID?: { auth: { init(input: Record<string, unknown>): void; signIn(): Promise<{ authorization: { id_token: string } }> } };
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
const buyerAppUrl = process.env.NEXT_PUBLIC_BUYER_APP_URL ?? "https://dentmarket-shop.vercel.app";
const supplierAppUrl = process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ?? "https://dentmarket-supplier.vercel.app";
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const appleRedirectUri = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";

export default function LoginPage() {
  const [capability, setCapability] = useState<Capability>("BUYER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const googleButton = useRef<HTMLDivElement>(null);

  const request = async <T,>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
    const payload = await response.json().catch(() => null) as T & { message?: string | string[] };
    if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(". ") : payload?.message ?? `HTTP ${response.status}`);
    return payload;
  };

  const routeSession = async (session: Session) => {
    const organizationId = session.activeOrganizationId ?? session.organizationId;
    if (!organizationId) throw new Error("У аккаунта нет активной организации");
    let resolvedCapability = session.capability;
    let organizationDisplayName = session.organizationDisplayName;
    if (!resolvedCapability) {
      const response = await fetch(`${apiUrl}/organizations/${organizationId}`, { headers: { authorization: `Bearer ${session.accessToken}` }, cache: "no-store" });
      const organization = await response.json() as { displayName?: string; capabilities?: Array<{ capability: string }>; message?: string };
      if (!response.ok) throw new Error(organization.message ?? "Не удалось определить организацию");
      organizationDisplayName = organization.displayName;
      resolvedCapability = organization.capabilities?.some(({ capability: item }) => item === "SUPPLIER") ? "SUPPLIER" : organization.capabilities?.some(({ capability: item }) => item === "BUYER") ? "BUYER" : undefined;
    }
    if (!resolvedCapability) throw new Error("Для аккаунта не найден кабинет клиники или поставщика");
    const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}`, "x-user-id": session.user.id, "x-organization-id": organizationId, ...(session.sessionId ? { "x-session-id": session.sessionId } : {}) }, body: JSON.stringify({ capability: resolvedCapability }), credentials: "include" });
    const handoffPayload = await handoffResponse.json() as { handoffCode?: string; organizationDisplayName?: string; message?: string };
    if (!handoffResponse.ok || !handoffPayload.handoffCode) throw new Error(handoffPayload.message ?? "Не удалось создать защищённую сессию перехода");
    const handoff = encodeURIComponent(JSON.stringify({ displayName: session.user.displayName, organizationDisplayName: handoffPayload.organizationDisplayName ?? organizationDisplayName, organizationId, handoffCode: handoffPayload.handoffCode, capability: resolvedCapability }));
    window.location.assign(`${resolvedCapability === "SUPPLIER" ? supplierAppUrl : buyerAppUrl}/#session=${handoff}`);
  };

  const exchange = async (provider: "GOOGLE" | "APPLE", idToken: string) => {
    setBusy(true); setError("");
    try { await routeSession(await request<Session>("/auth/social/exchange", { provider, idToken })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Вход не выполнен"); }
    finally { setBusy(false); }
  };

  const demo = async () => {
    setBusy(true); setError("");
    try { await routeSession(await request<Session>("/auth/demo", { capability })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Демо-вход не выполнен"); }
    finally { setBusy(false); }
  };

  const renderGoogle = () => {
    if (!googleClientId || !window.google || !googleButton.current) return;
    googleButton.current.replaceChildren();
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: ({ credential }) => void exchange("GOOGLE", credential) });
    window.google.accounts.id.renderButton(googleButton.current, { theme: "outline", size: "large", width: 360, locale: "ru" });
  };
  useEffect(() => { renderGoogle(); }, []);

  const apple = async () => {
    if (!window.AppleID || !appleClientId || !appleRedirectUri) return setError("Apple Sign In ещё не настроен для этого домена");
    try { window.AppleID.auth.init({ clientId: appleClientId, scope: "name email", redirectURI: appleRedirectUri, usePopup: true }); const result = await window.AppleID.auth.signIn(); await exchange("APPLE", result.authorization.id_token); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Apple Sign In не выполнен"); }
  };

  return <main className="loginPage">
    <Script src="https://accounts.google.com/gsi/client?hl=ru" strategy="afterInteractive" onLoad={renderGoogle} />
    <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ru_RU/appleid.auth.js" strategy="afterInteractive" />
    <section className="loginIntro"><a className="brand" href="/"><span>DM</span><strong>DentMarket <small>KZ</small></strong></a><div><p className="eyebrow">Вход в DentMarket</p><h1>Продолжите работу в своём кабинете</h1><p>Клиника управляет закупками. Поставщик управляет ассортиментом, заказами и документами.</p></div><a className="backLink" href="/">← На главную</a></section>
    <section className="loginPanel"><div className="loginCard"><p className="eyebrow">Вход</p><h2>Выберите кабинет</h2><div className="rolePicker"><button type="button" data-selected={capability === "BUYER"} onClick={() => setCapability("BUYER")}><b>Клиника</b><span>Магазин и закупки</span></button><button type="button" data-selected={capability === "SUPPLIER"} onClick={() => setCapability("SUPPLIER")}><b>Поставщик</b><span>Продажи и ассортимент</span></button></div><div className="identityButtons"><div ref={googleButton} className="googleButton" />{!googleClientId ? <div className="identityDisabled">Вход через Google пока недоступен</div> : null}<button type="button" className="appleButton" onClick={() => void apple()} disabled={!appleClientId || !appleRedirectUri || busy}> Продолжить с Apple</button><div className="divider"><span>демонстрационный доступ</span></div><button type="button" className="demoLogin" onClick={() => void demo()} disabled={busy}>{busy ? "Открываем кабинет…" : capability === "BUYER" ? "Открыть демо-магазин" : "Открыть демо поставщика"}</button></div>{error ? <p className="formError" role="alert">{error}</p> : null}<p className="loginSignup">Нет аккаунта? <a href={`/register?role=${capability === "BUYER" ? "buyer" : "supplier"}`}>Зарегистрироваться</a></p></div></section>
  </main>;
}
