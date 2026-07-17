"use client";

import { Button, Field, Input, ProgressBar, Select, Spinner } from "@fluentui/react-components";
import { CheckmarkCircle20Regular, Circle20Regular } from "@fluentui/react-icons";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./onboarding-progress.module.css";

type Progress = { status: string; readyForCommercialActivation?: boolean; completedSteps: number; totalSteps: number; progressPercent: number; nextStep: { id: string; label: string; action: string } | null; steps: Array<{ id: string; label: string; complete: boolean; action: string }> };

export function OnboardingProgress({ apiContext, supplierId, onNavigate }: { apiContext: ApiContext; supplierId: string; onNavigate: (section: string) => void }) {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext), [apiContext]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [warehouse, setWarehouse] = useState({ code: "MAIN", name: "Основной склад", addressLine: "" });
  const [source, setSource] = useState({ type: "MANUAL", name: "Ручное управление" });
  const load = useCallback(() => { void api.get<Progress>(`/suppliers/${supplierId}/onboarding-readiness`).then((value) => { setProgress({ ...value, status: value.readyForCommercialActivation ? "READY" : "IN_PROGRESS", nextStep: value.steps.find((step) => !step.complete) ?? null }); setError(null); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось загрузить onboarding")); }, [api, supplierId]);
  const complete = async (step: "profile" | "warehouse" | "data_source") => {
    setBusy(step); setError(null);
    try {
      if (step === "profile") await api.post(`/suppliers/${supplierId}/profile`, { regulatoryDetails: { onboardingSource: "supplier_cabinet", detailsPending: true } });
      if (step === "warehouse") await api.post(`/suppliers/${supplierId}/warehouses`, { code: warehouse.code, name: warehouse.name, addressLine: warehouse.addressLine || null, timezone: "Asia/Almaty" });
      if (step === "data_source") await api.post(`/suppliers/${supplierId}/data-sources`, { name: source.name, type: source.type, configuration: { onboardingMode: true } });
      window.dispatchEvent(new Event("dentmarket:onboarding-changed")); load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить шаг"); }
    finally { setBusy(null); }
  };
  useEffect(() => { load(); window.addEventListener("dentmarket:onboarding-changed", load); return () => window.removeEventListener("dentmarket:onboarding-changed", load); }, [load]);
  if (error) return <div className={styles.error}>Прогресс настройки временно недоступен: {error}</div>;
  if (!progress) return <div className={styles.loading}><Spinner size="tiny" /><span>Проверяем готовность организации</span></div>;
  if (progress.status === "READY") return null;
  const pending = new Set(progress.steps.filter((step) => !step.complete).map((step) => step.id));
  return <section className={styles.panel}><header><div><p>Подготовка к продажам</p><h2>{progress.completedSteps} из {progress.totalSteps} шагов завершено</h2></div><strong>{progress.progressPercent}%</strong></header><ProgressBar value={progress.progressPercent / 100} /><div className={styles.steps}>{progress.steps.map((step) => <div key={step.id} data-complete={step.complete}><span>{step.complete ? <CheckmarkCircle20Regular /> : <Circle20Regular />}</span><div><strong>{step.label}</strong><small>{step.complete ? "Готово" : step.action}</small></div>{!step.complete && step.id === "credentials" ? <Button size="small" onClick={() => onNavigate("compliance")}>Добавить</Button> : null}{!step.complete && step.id === "catalog" ? <Button size="small" onClick={() => onNavigate("offers")}>Добавить</Button> : null}</div>)}</div>
    {pending.has("profile") ? <div className={styles.action}><div><strong>1. Активируйте профиль поставщика</strong><small>Создаём профиль организации; лицензии и реквизиты добавляются следующим шагом.</small></div><Button appearance="primary" disabled={Boolean(busy)} onClick={() => void complete("profile")}>{busy === "profile" ? <Spinner size="tiny" /> : "Создать профиль"}</Button></div> : null}
    {!pending.has("profile") && pending.has("warehouse") ? <div className={styles.formAction}><div><strong>2. Добавьте первый склад</strong><small>Адрес и точную геопозицию можно уточнить в разделе «Доверие и география».</small></div><div className={styles.fields}><Field label="Код склада"><Input value={warehouse.code} onChange={(_, data) => setWarehouse((value) => ({ ...value, code: data.value.toUpperCase() }))} /></Field><Field label="Название склада"><Input value={warehouse.name} onChange={(_, data) => setWarehouse((value) => ({ ...value, name: data.value }))} /></Field><Field label="Адрес"><Input value={warehouse.addressLine} onChange={(_, data) => setWarehouse((value) => ({ ...value, addressLine: data.value }))} placeholder="Город, улица, дом" /></Field><Button appearance="primary" disabled={Boolean(busy) || warehouse.code.length < 2 || warehouse.name.length < 2} onClick={() => void complete("warehouse")}>Сохранить склад</Button></div></div> : null}
    {!pending.has("profile") && pending.has("source") ? <div className={styles.formAction}><div><strong>3. Выберите источник данных</strong><small>Ручной режим запускается сразу. PDF, Excel и CSV загружаются в разделе «Интеграции».</small></div><div className={styles.fields}><Field label="Канал"><Select value={source.type} onChange={(_, data) => { const names: Record<string,string> = { MANUAL: "Ручное управление", PDF: "PDF прайсы", EXCEL: "Excel прайс", CSV: "CSV прайс", API: "API поставщика", ERP: "1С / ERP" }; setSource({ type: data.value, name: names[data.value] ?? data.value }); }}><option value="MANUAL">Ручной ввод</option><option value="PDF">PDF</option><option value="EXCEL">Excel</option><option value="CSV">CSV</option><option value="API">API</option><option value="ERP">1С / ERP</option></Select></Field><Field label="Название подключения"><Input value={source.name} onChange={(_, data) => setSource((value) => ({ ...value, name: data.value }))} /></Field><Button appearance="primary" disabled={Boolean(busy) || source.name.length < 2} onClick={() => void complete("data_source")}>Сохранить источник</Button></div></div> : null}
    <footer>Публикация предложений откроется после построчных проверок compliance, документов товара и данных партии.</footer></section>;
}
