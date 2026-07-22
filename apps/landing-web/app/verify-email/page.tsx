"use client";

import { useEffect, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
const buyerUrl = process.env.NEXT_PUBLIC_BUYER_APP_URL ?? "https://dentmarket-store.vercel.app";

export default function VerifyEmailPage() {
  const [state, setState] = useState("Проверяем ссылку…");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) { setState("Ссылка подтверждения не найдена"); return; }
    void fetch(`${apiUrl}/auth/email/verify`, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ token }) })
      .then(async (response) => { const data = await response.json() as { organizationId?: string; capability?: string; message?: string }; if (!response.ok) throw new Error(data.message ?? "Ссылка недействительна"); window.location.assign(data.capability === "SUPPLIER" ? (process.env.NEXT_PUBLIC_SUPPLIER_APP_URL ?? buyerUrl) : buyerUrl); })
      .catch((error: unknown) => setState(error instanceof Error ? error.message : "Не удалось подтвердить email"));
  }, []);
  return <main className="registrationPage"><section className="registrationSuccess"><a className="brand" href="/"><span>DM</span><strong>DentMarket <small>KZ</small></strong></a><p className="eyebrow">Подтверждение email</p><div className="successMark">{state.startsWith("Проверяем") ? "…" : "!"}</div><h1>{state}</h1><p>Если ссылка истекла, запросите письмо повторно через восстановление доступа.</p><a className="primary registrationPrimary" href="/login">Перейти ко входу</a></section></main>;
}
