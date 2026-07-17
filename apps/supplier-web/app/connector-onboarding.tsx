"use client";

import { Button, ProgressBar, Spinner } from "@fluentui/react-components";
import { ArrowClockwise20Regular, CheckmarkCircle20Regular, Circle20Regular } from "@fluentui/react-icons";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./connector-onboarding.module.css";

type Readiness = { channel: string | null; completedSteps: number; totalSteps: number; progressPercent: number; connection: { provider: string; status: string; agentStatus: string | null; lastSuccessAt: string | null } | null; timeTargets: Record<string,string>; steps: Array<{ id: string; label: string; complete: boolean; evidence: string }> };

export function ConnectorOnboarding({ supplierId, apiContext }: { supplierId: string; apiContext: ApiContext }) {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext), [apiContext]);
  const [data, setData] = useState<Readiness | null>(null); const [error, setError] = useState("");
  const load = useCallback(() => { setError(""); void api.get<Readiness>(`/suppliers/${supplierId}/integrations/onboarding/readiness`).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось проверить канал")); }, [api, supplierId]);
  useEffect(() => { load(); window.addEventListener("dentmarket:onboarding-changed", load); return () => window.removeEventListener("dentmarket:onboarding-changed", load); }, [load]);
  if (error) return <div className={styles.error}>{error}</div>;
  if (!data) return <div className={styles.loading}><Spinner size="tiny" /> Проверяем готовность канала…</div>;
  const target = data.channel ? data.timeTargets[data.channel] : null;
  return <section className={styles.panel} aria-labelledby="connector-wizard-title"><header><div><p>Быстрый запуск поставщика</p><h2 id="connector-wizard-title">Connector wizard · {data.completedSteps}/{data.totalSteps}</h2><small>{data.channel ? `Канал: ${data.channel}` : "Источник ещё не выбран"}{target ? ` · цель ${target}` : ""}</small></div><div className={styles.percent}><strong>{data.progressPercent}%</strong><Button appearance="subtle" icon={<ArrowClockwise20Regular />} aria-label="Обновить readiness" onClick={load} /></div></header><ProgressBar value={data.progressPercent / 100} /><div className={styles.steps}>{data.steps.map((step,index) => <article key={step.id} data-complete={step.complete}><span>{step.complete ? <CheckmarkCircle20Regular /> : <Circle20Regular />}</span><div><small>{String(index+1).padStart(2,"0")}</small><strong>{step.label}</strong><p>{step.evidence}</p></div></article>)}</div><footer>Go-live считается завершённым только после реального контрольного заказа, активного договора и готовых к публикации данных. Серверный протокол 1С без installer/binary остаётся внешней зависимостью.</footer></section>;
}
