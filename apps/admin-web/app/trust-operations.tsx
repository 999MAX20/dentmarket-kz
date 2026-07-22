"use client";

import { Button, Spinner } from "@fluentui/react-components";
import { MarketplaceApiClient } from "@marketplace/api-client";
import { formatAdminStatus } from "./admin-labels";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./trust-operations.module.css";
import { adminApiContext } from "./admin-auth";

const suppliers = [
  ["00000000-0000-4000-8000-000000000020", "Demo Dental Supply"],
  ["00000000-0000-4000-8000-000000000025", "Ortho Trade KZ"],
  ["00000000-0000-4000-8000-000000000060", "MedConsum"],
  ["00000000-0000-4000-8000-000000000070", "TechDent Systems"],
  ["00000000-0000-4000-8000-000000000080", "SterileLine"],
] as const;
type Incident = { id: string; impactedOrganizationId: string | null; type: string; severity: string; status: string; actionType: string; explanation: string; remediation: string; restorationCondition: string; actionExpiresAt: string | null; version: number; appeals: Array<{ id: string; status: string; reason: string }> };
type Rating = { supplierOrganizationId: string; status: string; score: string | null; eventCount: number; confidence: string; computedAt: string };
type Warehouse = { id: string; geoStatus: string };

const incidentTypeLabels: Record<string, string> = {
  MATCHING_ERROR: "Ошибка сопоставления товара",
  STALE_PRICE: "Устаревшая цена",
  UNRELIABLE_STOCK: "Недостоверный остаток",
  PACKAGING_ERROR: "Ошибка упаковки",
  INCOMPLETE_DOCUMENTS: "Неполные документы",
  DELIVERY_FAILURE: "Срыв доставки",
  SUSPICIOUS_PROMOTION: "Проверка акции",
  FAKE_REVIEW: "Проверка отзыва",
  UNVERIFIED_LOCATION: "Адрес не подтверждён",
  PAYMENT_DETAILS_CHANGE: "Изменение реквизитов",
};
const severityLabels: Record<string, string> = { CRITICAL: "Критический", HIGH: "Высокий", NORMAL: "Обычный", LOW: "Низкий" };
const actionLabels: Record<string, string> = { HARD_BLOCK: "Заблокировать операции", NONE: "Без ограничений", REVIEW_REQUIRED: "Отправить на проверку", HIDDEN: "Скрыть публикацию" };

export function TrustOperations() {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", adminApiContext()), []);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [ratings, setRatings] = useState<Array<Rating & { name: string }>>([]);
  const [warehouseStats, setWarehouseStats] = useState({ total: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [nextIncidents, nextRatings, warehouseGroups] = await Promise.all([api.get<Incident[]>("/trust/incidents"), Promise.all(suppliers.map(async ([id, name]) => ({ ...(await api.get<Rating>(`/trust/ratings/suppliers/${id}`)), name }))), Promise.all(suppliers.map(([id]) => api.get<Warehouse[]>(`/suppliers/${id}/warehouses`)))]); const warehouses = warehouseGroups.flat(); setIncidents(nextIncidents); setRatings(nextRatings); setWarehouseStats({ total: warehouses.length, verified: warehouses.filter(({ geoStatus }) => geoStatus === "VERIFIED").length }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить данные доверия и рейтинга"); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (incident: Incident) => { setBusy(incident.id); try { await api.patch(`/trust/incidents/${incident.id}`, { version: incident.version, status: "RESOLVED", actionType: "NONE", resolution: "Оператор подтвердил выполнение условия восстановления." }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось закрыть инцидент"); } finally { setBusy(null); } };
  const open = incidents.filter(({ status }) => status !== "RESOLVED");
  return <section className={styles.section} aria-label="Доверие и рекомендации">
    <div className={styles.header}><div><h2>Доверие и рекомендации</h2><p>Ограничения, апелляции, подтверждённые склады и рейтинг поставщиков.</p></div><Button appearance="subtle" onClick={() => void load()} disabled={loading}>{loading ? <Spinner size="tiny" /> : "Обновить"}</Button></div>
    {error ? <div className={styles.error}>{error}</div> : null}
    <div className={styles.metrics}><div><span>Открытые инциденты</span><strong>{open.length}</strong><small>жёстких: {open.filter(({ actionType }) => actionType === "HARD_BLOCK").length}</small></div><div><span>Апелляции</span><strong>{incidents.flatMap(({ appeals }) => appeals).filter(({ status }) => ["OPEN", "UNDER_REVIEW"].includes(status)).length}</strong><small>ожидают решения</small></div><div><span>Подтверждённые склады</span><strong>{warehouseStats.verified} / {warehouseStats.total}</strong><small>получают локальный приоритет</small></div><div><span>Рейтинг рассчитан</span><strong>{ratings.filter(({ status }) => status === "CALCULATED").length} / {ratings.length}</strong><small>новые не штрафуются</small></div></div>
    <div className={styles.layout}><div><h3>Открытые ограничения</h3>{open.length ? <div className={styles.queue}>{open.map((incident) => <article key={incident.id}><header><div><strong>{incidentTypeLabels[incident.type] ?? "Требуется проверка"}</strong><span>{suppliers.find(([id]) => id === incident.impactedOrganizationId)?.[1] ?? "Платформа"}</span></div><b data-severity={incident.severity}>{severityLabels[incident.severity] ?? "Не указан"}</b></header><p>{incident.explanation}</p><dl><div><dt>Первое действие</dt><dd>{actionLabels[incident.actionType] ?? formatAdminStatus(incident.actionType)}</dd></div><div><dt>Что исправить</dt><dd>{incident.remediation}</dd></div><div><dt>Условие восстановления</dt><dd>{incident.restorationCondition}</dd></div></dl><footer><span>{incident.appeals.length ? `Апелляций: ${incident.appeals.length}` : "Апелляций нет"}</span><Button size="small" disabled={busy === incident.id} onClick={() => void resolve(incident)}>{busy === incident.id ? "Закрываем" : "Подтвердить восстановление"}</Button></footer></article>)}</div> : <div className={styles.empty}>Открытых ограничений нет.</div>}</div><div><h3>Рейтинг поставщиков</h3><div className={styles.ratings}>{ratings.map((rating) => <div key={rating.supplierOrganizationId}><span>{rating.name}</span><strong>{rating.status === "CALCULATED" ? Number(rating.score).toFixed(1) : "Недостаточно данных"}</strong><small>{rating.eventCount ?? 0} событий, достоверность {Math.round(Number(rating.confidence ?? 0) * 100)}%</small></div>)}</div><aside><strong>Правило ранжирования</strong><p>Платное продвижение отмечается отдельно и не меняет обычный порядок предложений.</p></aside></div></div>
  </section>;
}
