"use client";

import { Button, Input, Spinner, Textarea } from "@fluentui/react-components";
import { useCallback, useEffect, useState } from "react";
import { adminAuthHeaders } from "./admin-auth";
import styles from "./product-correction-queue.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
type Correction = {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string;
  evidenceUrl: string | null;
  createdAt: string;
  product: { canonicalName: string; brand: { name: string } | null; manufacturer: { name: string } | null };
  supplier: { organization: { displayName: string } };
};

const labels: Record<string, string> = {
  CANONICAL_NAME: "Название",
  DESCRIPTION: "Описание",
  MANUFACTURER_SKU: "Артикул производителя",
  GTIN: "GTIN",
  PRODUCT_TYPE: "Тип товара",
  REGULATORY_CLASS: "Регуляторный класс",
};

export function ProductCorrectionQueue() {
  const [items, setItems] = useState<Correction[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(`${apiUrl}/moderation/product-corrections?status=PENDING`, { headers: adminAuthHeaders(false) });
    if (!response.ok) { setError("Не удалось загрузить запросы поставщиков"); return; }
    const data = await response.json() as Correction[];
    setItems(data);
    setDrafts(Object.fromEntries(data.map((item) => [item.id, item.proposedValue])));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (item: Correction, action: "approve" | "reject") => {
    setBusy(item.id);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/moderation/product-corrections/${item.id}/${action}`, {
        method: "POST",
        headers: adminAuthHeaders(),
        body: JSON.stringify({ acceptedValue: action === "approve" ? drafts[item.id] : undefined, moderatorComment: comments[item.id]?.trim() || undefined }),
      });
      if (!response.ok) throw new Error(await response.text());
      await load();
    } catch { setError("Решение не сохранено. Проверьте права и повторите попытку."); }
    finally { setBusy(null); }
  };

  return <section className={styles.panel} aria-label="Исправления карточек">
    <div className={styles.header}>
      <div><h2>Правки от поставщиков</h2><p>Публикация остаётся под контролем DentMarket. Принятое значение можно отредактировать перед сохранением.</p></div>
      <Button appearance="secondary" onClick={() => void load()}>Обновить</Button>
    </div>
    {error ? <div className={styles.error}>{error}</div> : null}
    {!items.length ? <div className={styles.empty}>Новых запросов на исправление нет.</div> : <div className={styles.list}>
      {items.map((item) => <article className={styles.item} key={item.id}>
        <div className={styles.identity}>
          <span>{labels[item.field] ?? item.field}</span>
          <h3>{item.product.canonicalName}</h3>
          <small>{item.supplier.organization.displayName} · {new Date(item.createdAt).toLocaleDateString("ru-KZ")}</small>
          <p>{item.reason}</p>
          {item.evidenceUrl ? <a href={item.evidenceUrl} target="_blank" rel="noreferrer">Открыть подтверждение ↗</a> : <small>Подтверждающая ссылка не приложена</small>}
        </div>
        <div className={styles.comparison}>
          <label><span>Сейчас</span><div>{item.currentValue || "Поле не заполнено"}</div></label>
          <label><span>Значение для публикации</span><Textarea rows={5} value={drafts[item.id] ?? ""} onChange={(_, data) => setDrafts((state) => ({ ...state, [item.id]: data.value }))} /></label>
          <label><span>Комментарий поставщику</span><Input value={comments[item.id] ?? ""} onChange={(_, data) => setComments((state) => ({ ...state, [item.id]: data.value }))} /></label>
        </div>
        <div className={styles.actions}>
          <Button appearance="secondary" disabled={busy === item.id || (comments[item.id]?.trim().length ?? 0) < 3} onClick={() => void decide(item, "reject")}>Отклонить</Button>
          <Button appearance="primary" disabled={busy === item.id || !(drafts[item.id]?.trim()) || (comments[item.id]?.trim().length ?? 0) < 3} onClick={() => void decide(item, "approve")}>{busy === item.id ? <Spinner size="tiny" /> : drafts[item.id]?.trim() === item.proposedValue.trim() ? "Принять" : "Принять с редактурой"}</Button>
        </div>
      </article>)}
    </div>}
  </section>;
}
