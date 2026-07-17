"use client";

import { Button, Spinner } from "@fluentui/react-components";
import { useCallback, useEffect, useState } from "react";
import styles from "./operation-queue.module.css";
import { adminAuthHeaders } from "./admin-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
type QueueItem = Record<string, unknown> & { id?: string; createdAt?: string; updatedAt?: string; detectedAt?: string; evaluatedAt?: string; proposedName?: string; orderNumber?: string; agreementNumber?: string; fileName?: string };
type QueueSection = { type: string; priority: string; count: number; items: QueueItem[] };
type WorkQueue = { generatedAt: string; totalOpenItems: number; sections: QueueSection[] };

const labels: Record<string, string> = { CATALOG_REVIEW: "Карточки на модерации", COMPLIANCE_REVIEW: "Compliance review", INTEGRATION_RECONCILIATION: "Расхождения интеграций", IMPORT_ATTENTION: "Импорты с вниманием", AGREEMENT_SIGNATURE: "Договоры ЭЦП", SUPPLIER_CONFIRMATION: "Подтверждение заказов", STALE_INVENTORY: "Устаревшие остатки" };
const itemLabel = (item: QueueItem) => item.proposedName ?? item.orderNumber ?? item.agreementNumber ?? item.fileName ?? (typeof item.externalRef === "string" ? item.externalRef : item.id ?? "Операционная задача");
const itemDate = (item: QueueItem) => item.createdAt ?? item.updatedAt ?? item.detectedAt ?? item.evaluatedAt;

export function OperationQueue() {
  const [data, setData] = useState<WorkQueue | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${apiUrl}/operations/work-queue`, { headers: adminAuthHeaders(false) });
      if (!response.ok) throw new Error(`Очередь недоступна (${response.status})`);
      setData(await response.json() as WorkQueue);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить work queue"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className={styles.panel} aria-label="Операционная очередь">
    <div className={styles.header}><div><p className={styles.eyebrow}>Production control tower</p><h2 className={styles.title}>Очередь коммерческих блокеров</h2><span className={styles.subtitle}>Оператор видит, что мешает поставщикам пройти полный путь до продаж.</span></div><div className={styles.total}><strong>{data?.totalOpenItems ?? "—"}</strong><span>открытых задач</span></div><Button appearance="secondary" onClick={() => void load()} disabled={busy}>{busy ? <Spinner size="tiny" /> : "Обновить"}</Button></div>
    {error ? <div className={styles.error}>{error}</div> : busy && !data ? <div className={styles.loading}><Spinner label="Собираем коммерческие блокеры" /></div> : !data?.sections.some(({ count }) => count > 0) ? <div className={styles.empty}><strong>Очередь пуста</strong><span>Критичных блокеров перед go-live нет.</span></div> : <>
      <div className={styles.sections}>{data?.sections.map((section) => <article className={styles.section} data-priority={section.priority} key={section.type}><header><strong>{labels[section.type] ?? section.type}</strong><b>{section.count}</b></header><small>{section.count ? `Приоритет: ${section.priority}` : "Новых задач нет"}</small></article>)}</div>
      <div className={styles.items}><h3>Первые задачи в очереди</h3>{data?.sections.flatMap((section) => section.items.slice(0, 2).map((item) => <div className={styles.item} key={`${section.type}-${item.id}`}><strong>{labels[section.type] ?? section.type}: {itemLabel(item)}</strong>{itemDate(item) ? <time>{new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(itemDate(item)!))}</time> : null}</div>))}</div>
    </>}
    <p className={styles.footer}>Очередь только агрегирует состояние. Изменение договора, compliance, импорта или заказа выполняется в соответствующем доменном разделе с audit trail.</p>
  </section>;
}
