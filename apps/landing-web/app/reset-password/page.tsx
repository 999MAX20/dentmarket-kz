"use client";

import { FormEvent, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";

export default function ResetPasswordPage() {
  const token = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setMessage(""); try { const response = await fetch(`${apiUrl}/auth/password/reset`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) }); const data = await response.json() as { message?: string }; if (!response.ok) throw new Error(data.message ?? "Ссылка недействительна"); setMessage("Пароль изменён. Теперь можно войти."); } catch (error) { setMessage(error instanceof Error ? error.message : "Не удалось изменить пароль"); } finally { setBusy(false); } };
  return <main className="registrationPage"><section className="registrationSuccess"><a className="brand" href="/"><span>DM</span><strong>DentMarket <small>KZ</small></strong></a><p className="eyebrow">Безопасность аккаунта</p><h1>Новый пароль</h1><form onSubmit={submit} className="registrationForm"><label><span>Новый пароль</span><input type="password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="primary registrationPrimary" disabled={busy || !token}>{busy ? "Сохраняем…" : "Изменить пароль"}</button></form>{message ? <p className="formError" role="alert">{message}</p> : null}<a href="/login">Вернуться ко входу</a></section></main>;
}
