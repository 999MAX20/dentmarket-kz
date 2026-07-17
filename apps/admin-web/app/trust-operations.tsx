"use client";

import { Button, Spinner } from "@fluentui/react-components";
import { MarketplaceApiClient } from "@marketplace/api-client";
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

export function TrustOperations() {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", adminApiContext()), []);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [ratings, setRatings] = useState<Array<Rating & { name: string }>>([]);
  const [warehouseStats, setWarehouseStats] = useState({ total: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { const [nextIncidents, nextRatings, warehouseGroups] = await Promise.all([api.get<Incident[]>("/trust/incidents"), Promise.all(suppliers.map(async ([id, name]) => ({ ...(await api.get<Rating>(`/trust/ratings/suppliers/${id}`)), name }))), Promise.all(suppliers.map(([id]) => api.get<Warehouse[]>(`/suppliers/${id}/warehouses`)))]); const warehouses = warehouseGroups.flat(); setIncidents(nextIncidents); setRatings(nextRatings); setWarehouseStats({ total: warehouses.length, verified: warehouses.filter(({ geoStatus }) => geoStatus === "VERIFIED").length }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Контур доверия недоступен"); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  const resolve = async (incident: Incident) => { setBusy(incident.id); try { await api.patch(`/trust/incidents/${incident.id}`, { version: incident.version, status: "RESOLVED", actionType: "NONE", resolution: "Оператор подтвердил выполнение условия восстановления." }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось закрыть инцидент"); } finally { setBusy(null); } };
  const open = incidents.filter(({ status }) => status !== "RESOLVED");
  return <section className={styles.section} aria-label="Trust and Smart Commerce">
    <div className={styles.header}><div><h2>Trust & Smart Commerce</h2><p>Лояльные реакции, апелляции, подтверждённые точки и объяснимый рейтинг.</p></div><Button appearance="subtle" onClick={() => void load()} disabled={loading}>{loading ? <Spinner size="tiny" /> : "Обновить"}</Button></div>
    {error ? <div className={styles.error}>{error}</div> : null}
    <div className={styles.metrics}><div><span>Открытые инциденты</span><strong>{open.length}</strong><small>жёстких: {open.filter(({ actionType }) => actionType === "HARD_BLOCK").length}</small></div><div><span>Апелляции</span><strong>{incidents.flatMap(({ appeals }) => appeals).filter(({ status }) => ["OPEN", "UNDER_REVIEW"].includes(status)).length}</strong><small>ожидают решения</small></div><div><span>Подтверждённые склады</span><strong>{warehouseStats.verified} / {warehouseStats.total}</strong><small>получают локальный приоритет</small></div><div><span>Рейтинг рассчитан</span><strong>{ratings.filter(({ status }) => status === "CALCULATED").length} / {ratings.length}</strong><small>новые не штрафуются</small></div></div>
    <div className={styles.layout}><div><h3>Очередь лояльных реакций</h3>{open.length ? <div className={styles.queue}>{open.map((incident) => <article key={incident.id}><header><div><strong>{incident.type}</strong><span>{suppliers.find(([id]) => id === incident.impactedOrganizationId)?.[1] ?? "Общий контур"}</span></div><b data-severity={incident.severity}>{incident.severity}</b></header><p>{incident.explanation}</p><dl><div><dt>Первая реакция</dt><dd>{incident.actionType}</dd></div><div><dt>Исправление</dt><dd>{incident.remediation}</dd></div><div><dt>Условие возврата</dt><dd>{incident.restorationCondition}</dd></div></dl><footer><span>{incident.appeals.length ? `Апелляций: ${incident.appeals.length}` : "Апелляций нет"}</span><Button size="small" disabled={busy === incident.id} onClick={() => void resolve(incident)}>{busy === incident.id ? "Закрываем" : "Подтвердить восстановление"}</Button></footer></article>)}</div> : <div className={styles.empty}>Открытых инцидентов нет.</div>}</div><div><h3>Объяснимый рейтинг</h3><div className={styles.ratings}>{ratings.map((rating) => <div key={rating.supplierOrganizationId}><span>{rating.name}</span><strong>{rating.status === "CALCULATED" ? Number(rating.score).toFixed(1) : "Недостаточно данных"}</strong><small>{rating.eventCount ?? 0} событий, confidence {Math.round(Number(rating.confidence ?? 0) * 100)}%</small></div>)}</div><aside><strong>Правило справедливости</strong><p>Продвижение маркируется отдельно. Оно не меняет органический порядок, не обходит риск и не даёт локальный приоритет неподтверждённой точке.</p></aside></div></div>
  </section>;
}
