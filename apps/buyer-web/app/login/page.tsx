"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";

type Capability = "BUYER" | "SUPPLIER";
type Session = { accessToken: string; activeOrganizationId?: string | null; organizationId?: string; organizationDisplayName?: string; capability: Capability; user: { id: string; displayName: string; email: string } };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
const supplierAppUrl = process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ?? "https://dentmarket-supplier.vercel.app";

export default function LoginPage() {
  const [capability, setCapability] = useState<Capability>("BUYER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const login = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/auth/demo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ capability }), credentials: "include" });
      const session = await response.json() as Session & { message?: string };
      if (!response.ok) throw new Error(session.message ?? "Сервис входа временно недоступен");
      const organizationId = session.activeOrganizationId ?? session.organizationId;
      if (!organizationId) throw new Error("У аккаунта нет активной организации");
      const handoff = encodeURIComponent(JSON.stringify({ actorId: session.user.id, displayName: session.user.displayName, organizationDisplayName: session.organizationDisplayName, organizationId, accessToken: session.accessToken, capability }));
      window.location.assign(`${capability === "SUPPLIER" ? supplierAppUrl : ""}/#session=${handoff}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Вход не выполнен"); }
    finally { setBusy(false); }
  };
  return <main className={styles.page}><section className={styles.intro}><Link className={styles.brand} href="/"><span>DM</span><strong>DentMarket <small>KZ</small></strong></Link><div><p>Личный кабинет</p><h1>Магазин открыт для всех</h1><span>Вход понадобится только для корзины, заказа, документов и персональных условий.</span></div><Link href="/">← Вернуться в магазин</Link></section><section className={styles.panel}><div className={styles.card}><p className={styles.eyebrow}>Вход в DentMarket</p><h2>Выберите роль</h2><div className={styles.roles}><button data-active={capability === "BUYER"} onClick={() => setCapability("BUYER")}><b>Клиника</b><span>Покупки и документы</span></button><button data-active={capability === "SUPPLIER"} onClick={() => setCapability("SUPPLIER")}><b>Поставщик</b><span>Продажи и ассортимент</span></button></div><button className={styles.login} onClick={() => void login()} disabled={busy}>{busy ? "Открываем кабинет…" : capability === "BUYER" ? "Войти в кабинет клиники" : "Войти как поставщик"}</button>{error ? <p className={styles.error}>{error}</p> : null}<p className={styles.hint}>Сейчас доступен пилотный демо-вход. Корпоративные Google/Apple аккаунты подключаются отдельными Client ID.</p><a className={styles.register} href={`https://dentmarket-about.vercel.app/register?role=${capability === "BUYER" ? "buyer" : "supplier"}`}>Нет аккаунта? Зарегистрироваться</a></div></section></main>;
}
