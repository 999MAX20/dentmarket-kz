"use client";

import { Button, Field, Input, Select, Spinner, Textarea } from "@fluentui/react-components";
import type { MarketplaceApiClient } from "@marketplace/api-client";
import { EmptyState, Section, StatusTag, errorMessage, formatDate } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./product-corrections-panel.module.css";

type Product = {
  id: string;
  canonicalName: string;
  description: string | null;
  manufacturerSku: string | null;
  gtin: string | null;
  productType: string;
  regulatoryClass: string | null;
};

type Offer = { id: string; productVariant: { product: Product } };
type Correction = {
  id: string;
  field: string;
  currentValue: string | null;
  proposedValue: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
  moderatorComment: string | null;
  appliedValue: string | null;
  createdAt: string;
  supplierOrganizationId: string;
  product: { canonicalName: string };
};

const fields = [
  ["CANONICAL_NAME", "Название"],
  ["DESCRIPTION", "Описание"],
  ["MANUFACTURER_SKU", "Артикул производителя"],
  ["GTIN", "GTIN"],
  ["PRODUCT_TYPE", "Тип товара"],
  ["REGULATORY_CLASS", "Регуляторный класс"],
] as const;

const fieldLabel = (field: string) => fields.find(([value]) => value === field)?.[1] ?? field;
const statusLabel: Record<Correction["status"], string> = {
  PENDING: "Проверяем",
  APPROVED: "Принято",
  PARTIALLY_APPROVED: "Принято с редактурой",
  REJECTED: "Отклонено",
};

export function ProductCorrectionsPanel({ api, offers, supplierId }: { api: MarketplaceApiClient; offers: Offer[]; supplierId: string }) {
  const products = useMemo(() => [...new Map(offers.map((offer) => [offer.productVariant.product.id, offer.productVariant.product])).values()], [offers]);
  const [productId, setProductId] = useState("");
  const [field, setField] = useState<(typeof fields)[number][0]>("DESCRIPTION");
  const [proposedValue, setProposedValue] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [items, setItems] = useState<Correction[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { if (!productId && products[0]) setProductId(products[0].id); }, [productId, products]);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Correction[]>("/moderation/product-corrections");
      setItems(data.filter((item) => item.supplierOrganizationId === supplierId));
    } catch (cause) { setMessage(errorMessage(cause)); }
  }, [api, supplierId]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/moderation/product-corrections", {
        productId,
        field,
        proposedValue: proposedValue.trim(),
        reason: reason.trim(),
        evidenceUrl: evidenceUrl.trim() || undefined,
      });
      setProposedValue("");
      setReason("");
      setEvidenceUrl("");
      setMessage("Исправление отправлено на проверку");
      await load();
    } catch (cause) { setMessage(errorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <Section title="Исправления карточек" description="Нашли ошибку? Предложите исправление и приложите подтверждение.">
    <div className={styles.layout}>
      <div className={styles.form}>
        <Field label="Товар">
          <Select value={productId} onChange={(_, data) => setProductId(data.value)}>
            {products.map((product) => <option value={product.id} key={product.id}>{product.canonicalName}</option>)}
          </Select>
        </Field>
        <Field label="Что исправить">
          <Select value={field} onChange={(_, data) => setField(data.value as typeof field)}>
            {fields.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Предлагаемая редакция">
          <Textarea rows={4} value={proposedValue} onChange={(_, data) => setProposedValue(data.value)} />
        </Field>
        <Field label="Почему нужна правка" hint="Укажите, что именно не совпадает с документом или каталогом производителя.">
          <Textarea rows={3} value={reason} onChange={(_, data) => setReason(data.value)} />
        </Field>
        <Field label="Ссылка на подтверждение" hint="Необязательно: сайт производителя, регистрационный документ или каталог.">
          <Input type="url" value={evidenceUrl} onChange={(_, data) => setEvidenceUrl(data.value)} />
        </Field>
        {message ? <div className={styles.message}>{message}</div> : null}
        <Button appearance="primary" disabled={busy || !productId || proposedValue.trim().length < 2 || reason.trim().length < 10} onClick={() => void submit()}>
          {busy ? <Spinner size="tiny" /> : "Отправить исправление"}
        </Button>
      </div>
      <div className={styles.history}>
        <h3>Мои исправления</h3>
        {!items.length ? <EmptyState title="Исправлений пока нет" description="Здесь появятся ваши правки и решения DentMarket." /> : items.slice(0, 12).map((item) => <article className={styles.request} key={item.id}>
          <div className={styles.requestHeader}><strong>{item.product.canonicalName}</strong><StatusTag tone={item.status === "REJECTED" ? "danger" : item.status === "PENDING" ? "warning" : "success"}>{statusLabel[item.status]}</StatusTag></div>
          <small>{fieldLabel(item.field)} · {formatDate(item.createdAt, true)}</small>
          <p>{item.appliedValue ?? item.proposedValue}</p>
          {item.moderatorComment ? <span>Комментарий DentMarket: {item.moderatorComment}</span> : null}
        </article>)}
      </div>
    </div>
  </Section>;
}
