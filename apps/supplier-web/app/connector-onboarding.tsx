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
  const load = useCallback(() => { setError(""); void api.get<Readiness>(`/suppliers/${supplierId}/integrations/onboarding/readiness`).then(setData).catch((cause) => setError(cause instanceof Error ? cause.message : "Не удалось проверить подключение")); }, [api, supplierId]);
  useEffect(() => { load(); window.addEventListener("dentmarket:onboarding-changed", load); return () => window.removeEventListener("dentmarket:onboarding-changed", load); }, [load]);
  if (error) return <div className={styles.error}>{error}</div>;
  if (!data) return <div className={styles.loading}><Spinner size="tiny" /> Проверяем подключение…</div>;
  const target = data.channel ? data.timeTargets[data.channel] : null;
  return <section className={styles.panel} aria-labelledby="connector-wizard-title"><header><div><p>Подготовка к продажам</p><h2 id="connector-wizard-title">Готово {data.completedSteps} из {data.totalSteps}</h2><small>{data.channel ? `Способ загрузки: ${data.channel}` : "Выберите способ загрузки товаров"}{target ? `. Срок: ${target}` : ""}</small></div><div className={styles.percent}><strong>{data.progressPercent}%</strong><Button appearance="subtle" icon={<ArrowClockwise20Regular />} aria-label="Обновить" onClick={load} /></div></header><ProgressBar value={data.progressPercent / 100} /><div className={styles.steps}>{data.steps.map((step) => <article key={step.id} data-complete={step.complete}><span>{step.complete ? <CheckmarkCircle20Regular /> : <Circle20Regular />}</span><div><strong>{step.label}</strong><p>{step.evidence}</p></div></article>)}</div><footer>Проверьте заказ, подпишите договор и подтвердите товары. Если работаете в 1С, мы поможем с подключением.</footer></section>;
}
