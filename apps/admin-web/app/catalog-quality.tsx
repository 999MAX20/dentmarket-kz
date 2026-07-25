"use client";

import { Button, Spinner } from "@fluentui/react-components";
import { useCallback, useEffect, useState } from "react";
import styles from "./page.module.css";
import { adminAuthHeaders } from "./admin-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
type Quality = { cards: number; indexed: number; missingVariants: number; missingCategories: number; missingIndustries: number; bySource: Array<{ source: string; count: number }>; scoreDistribution?: { ready: number; improve: number; moderation: number }; correctionQueue?: Array<{ id: string; name: string; score: number; status: string; missing: string[] }> };
type SearchAnalytics = { days: number; queries: Array<{ query: string; searches: number; noResults: number; avgResults: number }> };

export function CatalogQuality() {
  const [quality, setQuality] = useState<Quality | null>(null);
  const [analytics, setAnalytics] = useState<SearchAnalytics | null>(null);
  const [busy, setBusy] = useState(true);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const headers = adminAuthHeaders(false);
      const [qualityResponse, analyticsResponse] = await Promise.all([fetch(`${apiUrl}/catalog/quality`, { headers }), fetch(`${apiUrl}/marketplace/search/analytics?days=30`, { headers })]);
      if (qualityResponse.ok) setQuality(await qualityResponse.json() as Quality);
      if (analyticsResponse.ok) setAnalytics(await analyticsResponse.json() as SearchAnalytics);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <section className={styles.panel} aria-label="Качество каталога и поиск">
    <div className={styles.panelHeader}><div><h2 className={styles.panelTitle}>Качество каталога и поиск</h2><span className={styles.muted}>Автоматическая проверка данных и неудовлетворённых запросов</span></div><Button appearance="secondary" onClick={() => void load()} disabled={busy}>{busy ? <Spinner size="tiny" /> : "Обновить"}</Button></div>
    {quality ? <><div className={styles.moduleGrid}><article className={styles.module}><strong>{quality.cards.toLocaleString("ru-KZ")}</strong><div className={styles.moduleDescription}>канонических карточек</div></article><article className={styles.module}><strong>{quality.scoreDistribution?.ready.toLocaleString("ru-KZ") ?? quality.indexed.toLocaleString("ru-KZ")}</strong><div className={styles.moduleDescription}>готовы к публикации</div></article><article className={styles.module}><strong>{quality.scoreDistribution?.moderation.toLocaleString("ru-KZ") ?? quality.missingVariants + quality.missingCategories + quality.missingIndustries}</strong><div className={styles.moduleDescription}>нуждаются в модерации</div></article></div>{quality.correctionQueue?.length ? <div className={styles.qualityTable}><h3 className={styles.panelTitle}>Очередь доработки карточек</h3>{quality.correctionQueue.slice(0, 8).map((item) => <div className={styles.checkRow} key={item.id}><div className={styles.checkCopy}><strong>{item.name}</strong><span className={styles.checkMeta}>{item.missing.join(", ")}</span></div><span className={styles.muted}>{item.score}/100</span></div>)}</div> : null}</> : <div className={styles.loading}><Spinner label="Проверяем каталог" /></div>}
    {analytics?.queries.length ? <div className={styles.qualityTable}><h3 className={styles.panelTitle}>Запросы без результата за 30 дней</h3>{analytics.queries.filter((row) => row.noResults > 0).slice(0, 8).map((row) => <div className={styles.checkRow} key={row.query}><div className={styles.checkCopy}><strong>{row.query}</strong><span className={styles.checkMeta}>{row.noResults} без результата из {row.searches} запросов</span></div><span className={styles.muted}>{Math.round(row.avgResults)} в среднем</span></div>)}</div> : <div className={styles.empty}>Пока нет накопленной аналитики поиска.</div>}
  </section>;
}
