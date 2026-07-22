"use client";

import Script from "next/script";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Capability = "BUYER" | "SUPPLIER";
type RegistrationResult = { registrationToken: string | null; registration: { email: string; capability: Capability; expiresAt: string } };
type Completion = { actorId?: string; displayName?: string; organizationDisplayName?: string; activeOrganizationId?: string; organizationId?: string; capability: Capability; accessToken?: string; csrfToken?: string; sessionId?: string; handoffCode?: string; user?: { id: string; displayName: string } };

declare global {
  interface Window {
    google?: { accounts: { id: { initialize(input: { client_id: string; callback: (response: { credential: string }) => void }): void; renderButton(element: HTMLElement, options: Record<string, unknown>): void } } };
    AppleID?: { auth: { init(input: Record<string, unknown>): void; signIn(): Promise<{ authorization: { id_token: string } }> } };
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? "";
const appleRedirectUri = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI ?? "";
const buyerAppUrl = process.env.NEXT_PUBLIC_BUYER_APP_URL ?? "http://127.0.0.1:3001";
const supplierAppUrl = process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ?? "http://127.0.0.1:3002";

export default function RegisterPage() {
  const [capability, setCapability] = useState<Capability>("BUYER");
  const [form, setForm] = useState({ ownerDisplayName: "", email: "", legalName: "", organizationDisplayName: "", bin: "", termsAccepted: false, privacyAccepted: false, marketingConsent: false });
  const [registration, setRegistration] = useState<RegistrationResult | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLocalDevelopment, setIsLocalDevelopment] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const role = new URLSearchParams(window.location.search).get("role");
    if (role === "supplier") setCapability("SUPPLIER");
    setIsLocalDevelopment(["127.0.0.1", "localhost", "::1"].includes(window.location.hostname));
  }, []);

  const dashboardUrl = capability === "SUPPLIER" ? supplierAppUrl : buyerAppUrl;
  const dashboardHref = completion ? `${dashboardUrl}/#session=${encodeURIComponent(JSON.stringify({ actorId: completion.user?.id ?? completion.actorId, displayName: completion.user?.displayName ?? completion.displayName, organizationDisplayName: completion.organizationDisplayName, organizationId: completion.activeOrganizationId ?? completion.organizationId, handoffCode: completion.handoffCode, capability }))}` : dashboardUrl;
  const canSubmit = useMemo(() => form.ownerDisplayName.trim().length >= 2 && form.email.includes("@") && form.legalName.trim().length >= 2 && form.organizationDisplayName.trim().length >= 2 && /^\d{12}$/.test(form.bin) && form.termsAccepted && form.privacyAccepted, [form]);

  const message = (cause: unknown) => {
    if (cause instanceof Error) return cause.message;
    return "Не удалось завершить действие. Попробуйте ещё раз.";
  };

  const request = async <T,>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
    const payload = await response.json().catch(() => null) as { message?: string | string[] } | null;
    if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(". ") : payload?.message ?? "Сервис временно недоступен");
    return payload as T;
  };

  const createRegistration = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      const result = await request<RegistrationResult>("/onboarding/registrations", { ...form, capability, consentVersion: "2026-07-17", source: "landing_registration", idempotencyKey: crypto.randomUUID() });
      if (!result.registrationToken) throw new Error("Заявка уже создана. Вернитесь к предыдущей вкладке или начните заново после истечения заявки.");
      setRegistration(result);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const exchange = async (provider: "GOOGLE" | "APPLE", idToken: string) => {
    if (!registration?.registrationToken) return;
    setBusy(true); setError(null);
    try {
      const result = await request<Completion>("/auth/social/exchange", { provider, idToken, registrationToken: registration.registrationToken });
      const organizationId = result.activeOrganizationId ?? result.organizationId;
      if (result.accessToken && organizationId && result.user?.id) {
        const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${result.accessToken}`, "x-user-id": result.user.id, "x-organization-id": organizationId, ...(result.sessionId ? { "x-session-id": result.sessionId } : {}) }, body: JSON.stringify({ capability: result.capability }), credentials: "include" });
        const handoffPayload = await handoffResponse.json() as { handoffCode?: string; message?: string };
        if (!handoffResponse.ok || !handoffPayload.handoffCode) throw new Error(handoffPayload.message ?? "Не удалось создать защищённую сессию перехода");
        result.handoffCode = handoffPayload.handoffCode;
      }
      if (result.accessToken) sessionStorage.setItem("dentmarket_access_token", result.accessToken);
      setCompletion(result);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const renderGoogle = () => {
    if (!registration || !googleClientId || !window.google || !googleButton.current) return;
    googleButton.current.replaceChildren();
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: ({ credential }) => void exchange("GOOGLE", credential) });
    window.google.accounts.id.renderButton(googleButton.current, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: 360, locale: "ru" });
  };

  const signInApple = async () => {
    if (!window.AppleID || !appleClientId || !appleRedirectUri) return setError("Apple Sign In ещё не настроен для этого домена.");
    try {
      window.AppleID.auth.init({ clientId: appleClientId, scope: "name email", redirectURI: appleRedirectUri, usePopup: true });
      const result = await window.AppleID.auth.signIn();
      await exchange("APPLE", result.authorization.id_token);
    } catch (cause) { setError(message(cause)); }
  };

  const completeLocally = async () => {
    if (!registration?.registrationToken) return;
    setBusy(true); setError(null);
    try {
      const result = await request<Completion>("/onboarding/registrations/complete-development", { registrationToken: registration.registrationToken });
      localStorage.setItem("dentmarket_dev_identity", JSON.stringify(result));
      setCompletion(result);
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  if (completion) return <main className="registrationPage"><section className="registrationSuccess"><a className="brand" href="/"><span>DM</span><strong>DentMarket <small>KZ</small></strong></a><p className="eyebrow">Регистрация завершена</p><div className="successMark">✓</div><h1>Организация создана</h1><p>{capability === "SUPPLIER" ? "Теперь заполните профиль поставщика, загрузите реквизиты и подпишите договор ЭЦП. Коммерческие функции откроются только после двух подписей." : "Теперь добавьте сотрудников, настройте роли и приступайте к закупкам."}</p><dl><div><dt>Роль</dt><dd>{capability === "SUPPLIER" ? "Поставщик" : "Клиника / покупатель"}</dd></div><div><dt>Организация</dt><dd>{completion.activeOrganizationId ?? completion.organizationId}</dd></div></dl><a className="primary registrationPrimary" href={dashboardHref}>Перейти в кабинет</a></section></main>;

  return <main className="registrationPage">
    <Script src="https://accounts.google.com/gsi/client?hl=ru" strategy="afterInteractive" onLoad={renderGoogle} />
    <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/ru_RU/appleid.auth.js" strategy="afterInteractive" />
    <aside className="registrationAside"><a className="brand" href="/"><span>DM</span><strong>DentMarket <small>KZ</small></strong></a><div><p className="eyebrow">Регистрация</p><h1>{capability === "SUPPLIER" ? "Начните продавать клиникам Казахстана" : "Управляйте закупками клиники в одном месте"}</h1><p>Регистрация занимает несколько минут. Мы проверим БИН и рабочий email, чтобы не создавать дубликаты.</p></div><ol><li data-active={!registration}>Реквизиты организации</li><li data-active={Boolean(registration)}>Подтверждение личности</li><li>Настройка кабинета</li></ol></aside>
    <section className="registrationCard">
      <a className="backLink" href="/">← На главную</a>
      {!registration ? <><p className="eyebrow">Шаг 1 из 2</p><h2>Создать организацию</h2><p className="formLead">Выберите роль и укажите сведения точно как в регистрационных документах.</p>
        <div className="rolePicker"><button type="button" data-selected={capability === "BUYER"} onClick={() => setCapability("BUYER")}><b>Клиника</b><span>Закупки, бюджеты и документы</span></button><button type="button" data-selected={capability === "SUPPLIER"} onClick={() => setCapability("SUPPLIER")}><b>Поставщик</b><span>Каталог, заказы и договор ЭЦП</span></button></div>
        <form onSubmit={createRegistration} className="registrationForm"><label><span>ФИО владельца</span><input value={form.ownerDisplayName} onChange={(e) => setForm({ ...form, ownerDisplayName: e.target.value })} autoComplete="name" required /></label><label><span>Рабочий email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required /></label><label className="wide"><span>Юридическое наименование</span><input value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} placeholder="ТОО «Стоматология»" required /></label><label><span>Название в кабинете</span><input value={form.organizationDisplayName} onChange={(e) => setForm({ ...form, organizationDisplayName: e.target.value })} required /></label><label><span>БИН</span><input inputMode="numeric" maxLength={12} value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value.replace(/\D/g, "") })} placeholder="12 цифр" required /></label><label className="check wide"><input type="checkbox" checked={form.termsAccepted} onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })} /><span>Принимаю <a href="/legal/terms" target="_blank">условия использования</a></span></label><label className="check wide"><input type="checkbox" checked={form.privacyAccepted} onChange={(e) => setForm({ ...form, privacyAccepted: e.target.checked })} /><span>Согласен с <a href="/legal/privacy" target="_blank">политикой конфиденциальности</a></span></label><label className="check wide mutedCheck"><input type="checkbox" checked={form.marketingConsent} onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })} /><span>Получать новости продукта (необязательно)</span></label>{error ? <p className="formError wide" role="alert">{error}</p> : null}<button className="primary submitButton wide" disabled={!canSubmit || busy}>{busy ? "Проверяем…" : "Продолжить"}</button></form>
      </> : <><p className="eyebrow">Шаг 2 из 2</p><h2>Подтвердите личность</h2><p className="formLead">Войдите с адресом <strong>{registration.registration.email}</strong>. Для завершения регистрации нужен именно этот email.</p><div className="identityButtons"><div ref={googleButton} className="googleButton" />{!googleClientId ? <button type="button" className="identityDisabled" disabled>Вход через Google пока недоступен</button> : null}<button type="button" className="appleButton" onClick={() => void signInApple()} disabled={!appleClientId || !appleRedirectUri || busy}> Продолжить с Apple</button>{isLocalDevelopment ? <><div className="divider"><span>локальная разработка</span></div><button type="button" className="devButton" onClick={() => void completeLocally()} disabled={busy}>{busy ? "Создаём кабинет…" : "Завершить локальную регистрацию"}</button></> : null}</div>{error ? <p className="formError" role="alert">{error}</p> : null}<button className="restart" type="button" onClick={() => { setRegistration(null); setError(null); }}>Изменить реквизиты</button></>}
    </section>
  </main>;
}
