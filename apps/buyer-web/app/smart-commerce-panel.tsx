"use client";

import { Button, Select, Spinner } from "@fluentui/react-components";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import { EmptyState, ErrorState, PageHeader, Section, StatusTag, errorMessage, formatMoney } from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./smart-commerce-panel.module.css";

const BUYER_ID = "00000000-0000-4000-8000-000000000030";
const BUYER_USER_ID = "00000000-0000-4000-8000-000000000500";
type Mode = "URGENT" | "VALUE" | "BALANCED" | "TRUSTED" | "PERSONAL_PRICE";
type Address = { id: string; line1: string; district: string | null; geoStatus: string; city: { nameRu: string; region: { nameRu: string } } };
type Product = { id: string; name: string };
type Search = { items: Product[] };
type Scenario = { offerId: string; supplier: { id: string; name: string }; warehouse: { name: string; verified: boolean }; landedCostMinor: number; currency: string; etaHours: number; distanceKm: number | null; trustScore: number | null; freshness: number; explanation: string; priceSource: string; placement: string };
type Recommendation = { mode: Mode; product: Product; destination: { city: string; verified: boolean }; organicBestOfferId: string | null; scenarios: Scenario[]; promoted: Scenario[]; fairness: { organicOrderPreserved: boolean; unverifiedWarehouseHasNoLocalPriority: boolean } };
type Rating = { status: string; score: string | null; eventCount?: number; indicators?: Array<{ code: string; label: string; value: number; sampleSize: number }> };

const modes: Array<{ id: Mode; label: string; hint: string }> = [
  { id: "URGENT", label: "Нужно срочно", hint: "Срок и подтверждение" },
  { id: "VALUE", label: "Самый выгодный", hint: "Цена с доставкой" },
  { id: "BALANCED", label: "Оптимальный", hint: "Баланс факторов" },
  { id: "TRUSTED", label: "Проверенный", hint: "История исполнения" },
  { id: "PERSONAL_PRICE", label: "Моя цена", hint: "Договорные условия" },
];

export function SmartCommercePanel({ buyerId = BUYER_ID, apiContext }: { buyerId?: string; apiContext?: ApiContext }) {
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext ?? { actorId: BUYER_USER_ID, organizationId: buyerId }), [apiContext, buyerId]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addressId, setAddressId] = useState("");
  const [productId, setProductId] = useState("");
  const [mode, setMode] = useState<Mode>("BALANCED");
  const [result, setResult] = useState<Recommendation | null>(null);
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextAddresses, search] = await Promise.all([api.get<Address[]>("/geo/addresses"), api.get<Search>(`/marketplace/search?buyerOrganizationId=${buyerId}&q=&inStock=true&limit=24`)]);
      setAddresses(nextAddresses); setProducts(search.items);
      setAddressId((current) => current || nextAddresses[0]?.id || "");
      setProductId((current) => current || search.items[0]?.id || "");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [api, buyerId]);
  useEffect(() => { void load(); }, [load]);

  const recommend = useCallback(async (nextMode = mode) => {
    if (!addressId || !productId) return;
    setBusy(true); setError(null);
    try {
      const next = await api.post<Recommendation>("/recommendations/smart", { buyerOrganizationId: buyerId, productId, destinationAddressId: addressId, quantity: 1, mode: nextMode, idempotencyKey: `buyer-rec-${productId}-${nextMode}-${Date.now()}` });
      setResult(next);
      const supplierIds = [...new Set(next.scenarios.map(({ supplier }) => supplier.id))];
      const nextRatings = await Promise.all(supplierIds.map(async (supplierId) => [supplierId, await api.get<Rating>(`/trust/ratings/suppliers/${supplierId}`)] as const));
      setRatings(Object.fromEntries(nextRatings));
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }, [addressId, api, mode, productId]);
  useEffect(() => { if (addressId && productId) void recommend(mode); }, [addressId, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className={styles.loading}><Spinner label="Собираем локальные варианты поставки" /></div>;
  if (error && !addresses.length) return <ErrorState description={error} action={<Button onClick={() => void load()}>Повторить</Button>} />;
  return <div className={styles.stack}>
    <PageHeader eyebrow="Умная закупка" title="Цена, срок и доверие в одном выборе" description="Выберите сценарий. Marketplace покажет полную стоимость, ожидаемый срок и подтверждённые признаки поставщика." />
    {error ? <div className={styles.error}>{error}</div> : null}
    <Section title="Контекст закупки" description="Геолокация телефона не требуется. Используется выбранный адрес филиала.">
      <div className={styles.contextGrid}>
        <label><span>Филиал</span><Select value={addressId} onChange={(_, data) => setAddressId(data.value)}>{addresses.map((address) => <option value={address.id} key={address.id}>{address.city.nameRu}, {address.line1}</option>)}</Select></label>
        <label><span>Товар</span><Select value={productId} onChange={(_, data) => setProductId(data.value)}>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</Select></label>
        <div className={styles.locationState}><StatusTag tone={addresses.find(({ id }) => id === addressId)?.geoStatus === "VERIFIED" ? "success" : "warning"}>{addresses.find(({ id }) => id === addressId)?.geoStatus === "VERIFIED" ? "Адрес подтверждён" : "Адрес требует проверки"}</StatusTag><small>Неподтверждённый адрес не даёт локального приоритета.</small></div>
      </div>
    </Section>
    <div className={styles.modeGrid} role="group" aria-label="Режим рекомендации">{modes.map((item) => <button className={item.id === mode ? styles.modeActive : styles.mode} type="button" key={item.id} onClick={() => { setMode(item.id); void recommend(item.id); }}><strong>{item.label}</strong><span>{item.hint}</span></button>)}</div>
    <Section title={result ? `${result.product.name}: ${result.scenarios.length} сценария` : "Сценарии поставки"} description="Органический порядок сохраняется. Платное размещение показывается отдельно и не скрывает лучший вариант.">
      {busy ? <div className={styles.loading}><Spinner label="Пересчитываем цену и ETA" /></div> : result?.scenarios.length ? <div className={styles.scenarios}>{result.scenarios.map((scenario, index) => { const rating = ratings[scenario.supplier.id]; return <article className={index === 0 ? styles.scenarioBest : styles.scenario} key={scenario.offerId}><header><div><small>{index === 0 ? "Рекомендуемый сценарий" : `Альтернатива ${index + 1}`}</small><h3>{scenario.supplier.name}</h3></div><StatusTag tone={scenario.warehouse.verified ? "success" : "warning"}>{scenario.warehouse.verified ? "Точка подтверждена" : "Без локального приоритета"}</StatusTag></header><div className={styles.scenarioFacts}><div><span>Итого</span><strong>{formatMoney(scenario.landedCostMinor, scenario.currency)}</strong></div><div><span>Ожидаемый срок</span><strong>{scenario.etaHours < 24 ? `${scenario.etaHours} ч` : `${Math.ceil(scenario.etaHours / 24)} дн`}</strong></div><div><span>Расстояние</span><strong>{scenario.distanceKm == null ? "Уточняется" : `${scenario.distanceKm} км`}</strong></div><div><span>Надёжность</span><strong>{rating?.status === "CALCULATED" ? `${Number(rating.score).toFixed(1)} / 100` : "Недостаточно данных"}</strong></div></div><p>{scenario.explanation}</p><footer><span>{scenario.warehouse.name}</span><span>Цена: {scenario.priceSource === "CONTRACT" ? "по договору" : "базовая"}</span></footer></article>; })}</div> : <EmptyState title="Подходящих сценариев нет" description="Поставщики ещё не подтвердили доставку по выбранному адресу." />}
    </Section>
    {result?.promoted.length ? <Section title="Продвижение" description="Эти предложения оплачены поставщиком. Их органическая позиция не изменена."><div className={styles.promoted}>{result.promoted.map((scenario) => <div key={scenario.offerId}><strong>{scenario.supplier.name}</strong><span>{formatMoney(scenario.landedCostMinor, scenario.currency)}, {scenario.etaHours} ч</span><StatusTag tone="info">Продвижение</StatusTag></div>)}</div></Section> : null}
  </div>;
}
