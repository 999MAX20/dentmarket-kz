"use client";

import { Button, Spinner } from "@fluentui/react-components";
import { MarketplaceApiClient } from "@marketplace/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./agreement-operations.module.css";
import { adminApiContext } from "./admin-auth";

type Agreement = { id: string; agreementNumber: string; supplierOrganizationId: string; createdAt: string; document: { checksumSha256: string | null }; signing: { available: boolean; supplierSigned: boolean; operatorSigned: boolean; reason: string | null } };

export function AgreementOperations() {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", adminApiContext()), []);
  const [items, setItems] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { setLoading(true); setError(null); try { setItems(await api.get<Agreement[]>("/marketplace-agreements/operator/pending")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить договоры"); } finally { setLoading(false); } }, [api]);
  useEffect(() => { void refresh(); }, [refresh]);
  const sign = async (agreement: Agreement) => { setBusy(agreement.id); setError(null); try { const result = await api.post<{ signingUrl?: string }>(`/marketplace-agreements/${agreement.id}/sign`, { signerName: "DentMarket KZ", expiresInMinutes: 60 }); if (result.signingUrl) window.open(result.signingUrl, "_blank", "noopener,noreferrer"); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось открыть ЭЦП"); } finally { setBusy(null); } };
  return <section className={styles.panel} id="agreements"><header><div><p>Договоры с поставщиками</p><h2>Ожидают подписи ЭЦП</h2></div><Button appearance="secondary" onClick={() => void refresh()} disabled={loading}>Обновить</Button></header>{error ? <div className={styles.error}>{error}</div> : null}{loading ? <div className={styles.loading}><Spinner label="Проверяем договоры" /></div> : !items.length ? <div className={styles.empty}><strong>Новых договоров нет</strong><span>Все договоры уже подписаны командой DentMarket.</span></div> : <div className={styles.list}>{items.map((item) => <article key={item.id}><div><strong>{item.agreementNumber}</strong><span>Поставщик: {item.supplierOrganizationId}</span><small>Создан {new Intl.DateTimeFormat("ru-KZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div><div className={styles.signatures}><span data-ready={item.signing.supplierSigned}>Поставщик {item.signing.supplierSigned ? "✓" : "ожидается"}</span><span data-ready={item.signing.operatorSigned}>DentMarket {item.signing.operatorSigned ? "✓" : "ожидается"}</span></div><Button appearance="primary" disabled={!item.signing.available || busy === item.id} onClick={() => void sign(item)}>{busy === item.id ? "Открываем…" : item.signing.operatorSigned ? "Подписано" : "Подписать ЭЦП"}</Button></article>)}</div>}<footer>Договор начнёт действовать после двух подписей.</footer></section>;
}
