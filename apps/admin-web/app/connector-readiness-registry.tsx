"use client";

import { Button } from "@fluentui/react-components";
import { ArrowClockwise20Regular, PlugConnected20Regular } from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import styles from "./connector-readiness-registry.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Entry = {
  id: string;
  providerCode: string;
  displayName: string;
  readinessStatus: "READY" | "PARTIAL" | "BLOCKED";
  goLiveStatus: "INTERNAL_READY" | "CONNECTOR_NEEDED" | "PILOT" | "LIVE_VERIFIED" | "BLOCKED";
  environment: string;
  directions: Record<string, string>;
  credentialsRequired: boolean;
  externalConnectorRequired: boolean;
  limitations?: string[] | null;
  evidence?: string[] | null;
  runbookPath?: string | null;
  owner: string;
  lastVerifiedAt?: string | null;
};
type Response = { entries: Entry[]; summary: { total: number; ready: number; externalDependency: number; liveVerified: number }; rule: string };

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const labels: Record<string, string> = {
  READY: "Готово внутри", PARTIAL: "Частично", BLOCKED: "Заблокировано",
  INTERNAL_READY: "Internal ready", CONNECTOR_NEEDED: "Нужен внешний контур", PILOT: "Пилот", LIVE_VERIFIED: "Live verified",
};

export function ConnectorReadinessRegistry() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/integrations/readiness`, { headers: adminAuthHeaders(false), cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      setData(await response.json() as Response);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить readiness"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className={styles.panel} aria-labelledby="connector-readiness-title">
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}><PlugConnected20Regular /> Connector readiness</div>
          <h2 id="connector-readiness-title">Готовность каналов поставщика</h2>
          <p>Внутренняя реализация и подтверждённый запуск разделены. Live verified ставится только после реального end-to-end прогона.</p>
        </div>
        <Button appearance="subtle" icon={<ArrowClockwise20Regular />} onClick={() => void load()} disabled={loading}>Обновить</Button>
      </div>
      {data && <div className={styles.summary}>
        <span><strong>{data.summary.total}</strong> каналов</span>
        <span><strong>{data.summary.ready}</strong> ready</span>
        <span><strong>{data.summary.externalDependency}</strong> ждут внешний контур</span>
        <span><strong>{data.summary.liveVerified}</strong> live verified</span>
      </div>}
      {error && <div className={styles.error}>{error}</div>}
      {loading && !data ? <div className={styles.loading}>Проверяем реестр…</div> : (
        <div className={styles.grid}>
          {data?.entries.map((entry) => {
            const activeDirections = Object.entries(entry.directions).filter(([, mode]) => mode !== "NONE");
            return <article className={styles.card} key={entry.id}>
              <div className={styles.cardTop}>
                <div><strong>{entry.displayName}</strong><code>{entry.providerCode}</code></div>
                <div className={styles.badges}><span data-tone={entry.readinessStatus}>{labels[entry.readinessStatus]}</span><span data-tone={entry.goLiveStatus}>{labels[entry.goLiveStatus]}</span></div>
              </div>
              <div className={styles.meta}><span>{entry.environment}</span><span>Owner: {entry.owner}</span>{entry.credentialsRequired && <span>Нужны credentials</span>}{entry.externalConnectorRequired && <span>Нужен внешний агент</span>}</div>
              <div className={styles.directions}>{activeDirections.map(([name, mode]) => <span key={name}>{name.toLowerCase()} · {mode.toLowerCase()}</span>)}</div>
              {entry.limitations?.length ? <ul>{entry.limitations.map((item) => <li key={item}>{item}</li>)}</ul> : null}
              <div className={styles.footer}><span>{entry.lastVerifiedAt ? `Проверено ${new Date(entry.lastVerifiedAt).toLocaleDateString("ru-KZ")}` : "Реальный контур не подтверждён"}</span><span>{entry.runbookPath ?? "Runbook не назначен"}</span></div>
            </article>;
          })}
        </div>
      )}
    </section>
  );
}
