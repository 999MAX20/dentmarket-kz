"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import styles from "./page.module.css";

type Capability = "BUYER" | "SUPPLIER";
type Session = {
  accessToken: string;
  sessionId?: string;
  activeOrganizationId?: string | null;
  organizationId?: string;
  organizationDisplayName?: string;
  capability: Capability;
  user: { id: string; displayName: string; email: string };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
const supplierAppUrl = process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ?? "https://dentmarket-supplier.vercel.app";
const landingAppUrl = process.env.NEXT_PUBLIC_LANDING_APP_URL ?? "https://dentmarket-kz.vercel.app";
const demoLoginEnabled = process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED === "true";

export default function LoginPage() {
  const [capability, setCapability] = useState<Capability>("BUYER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    const code = typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("error");
    if (code === "service") return "Сервис входа временно недоступен. Попробуйте ещё раз.";
    if (code === "organization") return "У аккаунта не найдена активная организация.";
    if (code === "handoff") return "Не удалось открыть кабинет. Повторите вход.";
    return "";
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const routeSession = async (session: Session) => {
    const organizationId = session.activeOrganizationId ?? session.organizationId;
    if (!organizationId) throw new Error("У аккаунта нет активной организации");
    const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.accessToken}`,
        "x-user-id": session.user.id,
        "x-organization-id": organizationId,
        ...(session.sessionId ? { "x-session-id": session.sessionId } : {}),
      },
      body: JSON.stringify({ capability }),
      credentials: "include",
    });
    const payload = await handoffResponse.json() as { handoffCode?: string; organizationDisplayName?: string; message?: string };
    if (!handoffResponse.ok || !payload.handoffCode) throw new Error(payload.message ?? "Не удалось создать безопасный переход в кабинет");
    const handoff = encodeURIComponent(JSON.stringify({ displayName: session.user.displayName, organizationDisplayName: payload.organizationDisplayName ?? session.organizationDisplayName, organizationId, handoffCode: payload.handoffCode, capability }));
    window.location.assign(`${capability === "SUPPLIER" ? supplierAppUrl : window.location.origin}/#session=${handoff}`);
  };

  const loginWithEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }), credentials: "include" });
      const session = await response.json() as Session & { message?: string };
      if (!response.ok) throw new Error(session.message ?? "Вход не выполнен");
      await routeSession(session);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Вход не выполнен"); }
    finally { setBusy(false); }
  };

  const login = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/demo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capability }),
        credentials: "include",
      });
      const session = (await response.json()) as Session & { message?: string };
      if (!response.ok) throw new Error(session.message ?? "Сервис входа временно недоступен");
      const organizationId = session.activeOrganizationId ?? session.organizationId;
      if (!organizationId) throw new Error("У аккаунта нет активной организации");
      const handoffResponse = await fetch(`${apiUrl}/auth/handoff`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.accessToken}`,
          "x-user-id": session.user.id,
          "x-organization-id": organizationId,
          ...(session.sessionId ? { "x-session-id": session.sessionId } : {}),
        },
        body: JSON.stringify({ capability }),
      });
      const handoffPayload = (await handoffResponse.json()) as {
        handoffCode?: string;
        organizationId?: string;
        organizationDisplayName?: string;
        message?: string;
      };
      if (!handoffResponse.ok || !handoffPayload.handoffCode) {
        throw new Error(handoffPayload.message ?? "Не удалось создать безопасный переход в кабинет");
      }
      const handoff = encodeURIComponent(JSON.stringify({
        displayName: session.user.displayName,
        organizationDisplayName: handoffPayload.organizationDisplayName ?? session.organizationDisplayName,
        organizationId: handoffPayload.organizationId ?? organizationId,
        handoffCode: handoffPayload.handoffCode,
        capability,
      }));
      window.location.assign(`${capability === "SUPPLIER" ? supplierAppUrl : window.location.origin}/#session=${handoff}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Вход не выполнен");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <Link className={styles.brand} href="/">
          <span>DM</span>
          <strong>DentMarket <small>KZ</small></strong>
        </Link>
        <div>
          <p>Личный кабинет</p>
          <h1>Магазин открыт для всех</h1>
          <span>Вход понадобится только для корзины, заказа, документов и персональных условий.</span>
        </div>
        <Link href="/">← Вернуться в магазин</Link>
      </section>
      <section className={styles.panel}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Вход в DentMarket</p>
          <h2>Выберите роль</h2>
          <div className={styles.roles}>
            <button type="button" data-active={capability === "BUYER"} onClick={() => setCapability("BUYER")}>
              <b>Клиника</b><span>Покупки и документы</span>
            </button>
            <button type="button" data-active={capability === "SUPPLIER"} onClick={() => setCapability("SUPPLIER")}>
              <b>Поставщик</b><span>Продажи и ассортимент</span>
            </button>
          </div>
          <form onSubmit={loginWithEmail} className={styles.loginForm}>
            <input type="email" placeholder="Рабочий email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            <input type="password" placeholder="Пароль" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <button className={styles.login} type="submit" disabled={busy}>{busy ? "Входим…" : "Войти по email"}</button>
          </form>
          {demoLoginEnabled ? <button className={styles.demo} type="button" onClick={() => void login()} disabled={busy}>{busy ? "Открываем демо…" : "Открыть демо без регистрации"}</button> : null}
          {error ? <p className={styles.error}>{error}</p> : null}
          <p className={styles.hint}>Для доступа к кабинету нужны рабочий email и пароль. Если аккаунта нет, зарегистрируйте организацию.</p>
          <a className={styles.register} href={`${landingAppUrl}/register?role=${capability === "BUYER" ? "buyer" : "supplier"}`}>
            Нет аккаунта? Зарегистрироваться
          </a>
        </div>
      </section>
    </main>
  );
}
