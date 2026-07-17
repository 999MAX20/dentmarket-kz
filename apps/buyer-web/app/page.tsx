"use client";

import {
  Button,
  Field,
  Input,
  Select,
  Spinner,
} from "@fluentui/react-components";
import {
  Alert24Regular,
  ArrowSync24Regular,
  Box24Regular,
  Cart24Regular,
  CheckmarkCircle24Regular,
  ClipboardTaskListLtr24Regular,
  Document24Regular,
  Bot24Regular,
  Grid24Regular,
  List24Regular,
  PersonSupport24Regular,
  Location24Regular,
  Search24Regular,
  ShoppingBag24Regular,
} from "@fluentui/react-icons";
import { MarketplaceApiClient, type ApiContext } from "@marketplace/api-client";
import {
  AppShell,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  PageHeader,
  Section,
  StatusTag,
  errorMessage,
  formatDate,
  formatMoney,
  formatStatus,
  type NavigationItem,
} from "@marketplace/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { BuyerServicesPanel } from "./buyer-services-panel";
import { SmartCommercePanel } from "./smart-commerce-panel";

const BUYER_ID = "00000000-0000-4000-8000-000000000030";
const BUYER_USER_ID = "00000000-0000-4000-8000-000000000500";
type SessionHandoff = { actorId?: string; displayName?: string; organizationDisplayName?: string; organizationId?: string; accessToken?: string; capability?: string };
const SESSION_KEY = "dentmarket:buyer-session";

function readSessionHandoff(): SessionHandoff | null {
  if (typeof window === "undefined") return null;
  try { const serialized = window.location.hash.startsWith("#session=") ? decodeURIComponent(window.location.hash.slice("#session=".length)) : window.sessionStorage.getItem(SESSION_KEY); if (!serialized) return null; const value = JSON.parse(serialized) as SessionHandoff; return value.capability === "BUYER" && value.organizationId && (value.accessToken || value.actorId) ? value : null; }
  catch { return null; }
}

type SearchOffer = {
  id: string;
  supplier: { id: string; name: string };
  priceMinor: string | null;
  currency: string | null;
  normalizedPriceMinor: string | null;
  packaging: {
    name: string | null;
    quantityInBaseUnit: string;
    unit: string | null;
  };
  available: boolean;
  confirmationMode: string;
  deliveryMethods: string[];
};
type SearchProduct = {
  id: string;
  name: string;
  brand: string | null;
  manufacturer: string | null;
  categories: Array<{ id: string; name: string }>;
  minNormalizedPriceMinor: string | null;
  isAvailable: boolean;
  offers: SearchOffer[];
};
type SearchResult = {
  total: number;
  items: SearchProduct[];
  facets: {
    categories: Array<{ id: string; name: string; count: number }>;
    suppliers: Array<{ id: string; name: string; count: number }>;
  };
};
type CompareOffer = {
  offerId: string;
  supplier: { organizationId: string; name: string };
  supplierSku: string | null;
  price: {
    amountMinor: string;
    currency: string;
    normalizedPriceMinor: string;
    normalizedUnit: string;
  };
  packaging: { name: string; quantityInBaseUnit: string; unit: string | null };
  availability: Array<{
    warehouse: string;
    quantityAvailable: string;
    updatedAt: string | null;
  }>;
  delivery: Array<{
    method: string;
    minLeadTimeHours: number | null;
    maxLeadTimeHours: number | null;
  }>;
  markers: {
    verifiedDocuments: boolean;
    complianceRisk: string | null;
    officialDistributor: boolean;
    supplierWarranty: boolean;
    requiresConfirmation: boolean;
  };
};
type Comparison = {
  product: {
    id: string;
    name: string;
    brand: string | null;
    manufacturer: string | null;
  };
  offers: CompareOffer[];
  comparisonAttributes: Array<{ code: string; name: string; value: unknown }>;
};
type CartItem = {
  id: string;
  offerId: string;
  quantity: string;
  unitPriceMinor: string;
  totalPriceMinor: string;
  currency: string;
  offer?: {
    supplier?: { organization?: { displayName?: string } };
    productVariant?: { product?: { canonicalName?: string } };
  };
};
type Cart = {
  id: string;
  status: string;
  currency: string;
  items: CartItem[];
  checkout?: { id: string } | null;
  createdAt: string;
};
type SupplierOrder = {
  id: string;
  buyerOrganizationId: string;
  orderNumber: string;
  status: string;
  subtotalAmountMinor: string;
  currency: string;
  createdAt: string;
  supplier: { displayName: string };
  items: Array<{
    id: string;
    quantity: string;
    acceptedQuantity: string | null;
    status: string;
    offer: { productVariant: { product: { canonicalName: string } } };
  }>;
};
type DocumentRecord = {
  id: string;
  title: string;
  documentNumber: string | null;
  kind: string;
  format: string;
  status: string;
  createdAt: string;
  signatures: Array<{ id: string; status: string }>;
};
type NotificationRecord = {
  id: string;
  subject: string;
  body: string;
  eventType: string;
  priority: string;
  status: string;
  readAt: string | null;
  createdAt: string;
};

const navigation: NavigationItem[] = [
  { id: "catalog", label: "Каталог", icon: <Grid24Regular /> },
  { id: "cart", label: "Корзина", icon: <Cart24Regular /> },
  { id: "orders", label: "Заказы", icon: <ClipboardTaskListLtr24Regular /> },
  { id: "documents", label: "Документы", icon: <Document24Regular /> },
  { id: "smart-commerce", label: "Город и рекомендации", icon: <Location24Regular /> },
  { id: "workspace", label: "Списки и бюджеты", icon: <List24Regular /> },
  { id: "assistant", label: "AI-помощник", icon: <Bot24Regular /> },
  { id: "support", label: "Поддержка", icon: <PersonSupport24Regular /> },
  { id: "notifications", label: "Уведомления", icon: <Alert24Regular /> },
];

const statusTone = (
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (
    [
      "COMPLETED",
      "CONFIRMED",
      "SIGNED",
      "SENT",
      "GENERATED",
      "DELIVERED",
    ].includes(status)
  )
    return "success";
  if (["FAILED", "REJECTED", "CANCELLED", "DEAD", "EXPIRED"].includes(status))
    return "danger";
  if (
    [
      "AWAITING_CONFIRMATION",
      "PENDING",
      "AWAITING_SIGNATURE",
      "PARTIALLY_SIGNED",
    ].includes(status)
  )
    return "warning";
  return "info";
};

export default function BuyerWorkspace() {
  const [handoff, setHandoff] = useState<SessionHandoff | null>(null);
  const [handoffChecked, setHandoffChecked] = useState(false);
  const buyerId = handoff?.organizationId ?? BUYER_ID;
  const apiContext = useMemo<ApiContext>(() => handoff?.accessToken ? { accessToken: handoff.accessToken } : handoff?.actorId && handoff.organizationId ? { actorId: handoff.actorId, organizationId: handoff.organizationId } : { actorId: BUYER_USER_ID, organizationId: BUYER_ID }, [handoff]);
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext), [apiContext]);
  useEffect(() => { const next = readSessionHandoff(); if (next) { setHandoff(next); window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next)); window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); } setHandoffChecked(true); }, []);
  const [active, setActive] = useState("catalog");
  const [query, setQuery] = useState("перчатки");
  const [sort, setSort] = useState("RELEVANCE");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [carts, setCarts] = useState<Cart[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const activeCart = carts.find((cart) => cart.status === "ACTIVE") ?? null;
  const buyerOrders = orders.filter(
    (order) => order.buyerOrganizationId === buyerId,
  );
  const unread = notifications.filter((item) => !item.readAt).length;

  const loadSearch = useCallback(
    async (nextQuery = query, nextSort = sort) => {
      const params = new URLSearchParams({
        buyerOrganizationId: buyerId,
        q: nextQuery,
        sort: nextSort,
        inStock: "true",
        limit: "24",
      });
      setSearch(await api.get<SearchResult>(`/marketplace/search?${params}`));
    },
    [api, buyerId, query, sort],
  );

  const refresh = useCallback(async () => {
    if (!handoffChecked) return;
    setLoading(true);
    setError(null);
    try {
      const [
        searchResult,
        cartResult,
        orderResult,
        documentResult,
        notificationResult,
      ] = await Promise.all([
        api.get<SearchResult>(
          `/marketplace/search?${new URLSearchParams({ buyerOrganizationId: buyerId, q: query, sort, inStock: "true", limit: "24" })}`,
        ),
        api.get<Cart[]>(`/buyers/${buyerId}/carts`),
        api.get<SupplierOrder[]>(`/buyers/${buyerId}/orders`),
        api.get<DocumentRecord[]>(
          `/documents?ownerOrganizationId=${buyerId}&limit=100`,
        ),
        api.get<NotificationRecord[]>(
          `/notifications/organizations/${buyerId}?limit=100`,
        ),
      ]);
      setSearch(searchResult);
      setCarts(cartResult);
      setOrders(orderResult);
      setDocuments(documentResult);
      setNotifications(notificationResult);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api, buyerId, handoffChecked, query, sort]);

  useEffect(() => { if (handoffChecked) void refresh(); }, [handoffChecked, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const submitSearch = async () => {
    setBusy("search");
    setError(null);
    setComparison(null);
    try {
      await loadSearch();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const compare = async (productId: string) => {
    setBusy(`compare:${productId}`);
    setError(null);
    try {
      setComparison(
        await api.get<Comparison>(
          `/marketplace/products/${productId}/compare?buyerOrganizationId=${buyerId}&quantity=1`,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const addToCart = async (offerId: string) => {
    setBusy(`cart:${offerId}`);
    setError(null);
    try {
      const cart =
        activeCart ??
        (await api.post<Cart>(`/buyers/${buyerId}/carts`, {
          currency: "KZT",
        }));
      await api.post(`/carts/${cart.id}/items`, { offerId, quantity: 1 });
      setCarts(await api.get<Cart[]>(`/buyers/${buyerId}/carts`));
      setToast("Позиция добавлена в корзину");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const checkout = async () => {
    if (!activeCart) return;
    setBusy("checkout");
    setError(null);
    try {
      await api.post(`/carts/${activeCart.id}/checkout`, {
        idempotencyKey: `buyer-ui-${activeCart.id}`,
      });
      const [nextCarts, nextOrders] = await Promise.all([
        api.get<Cart[]>(`/buyers/${buyerId}/carts`),
        api.get<SupplierOrder[]>(`/buyers/${buyerId}/orders`),
      ]);
      setCarts(nextCarts);
      setOrders(nextOrders);
      setActive("orders");
      setToast("Заказ оформлен и разделён по поставщикам");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const markRead = async (id: string) => {
    setBusy(`read:${id}`);
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((items) =>
        items.map((item) =>
          item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const downloadDocument = async (document: DocumentRecord) => {
    setBusy(`document:${document.id}`);
    setError(null);
    try {
      const result = await api.download(`/documents/${document.id}/download`);
      const url = URL.createObjectURL(result.blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download =
        result.fileName ?? `${document.title}.${document.format.toLowerCase()}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const renderCatalog = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="B2B закупки"
        title="Найдите нужное для клиники"
        description="Сравнивайте актуальные цены, упаковки, наличие, доставку и регуляторные признаки поставщиков."
      />
      <Section>
        <form
          className={styles.searchBar}
          onSubmit={(event) => {
            event.preventDefault();
            void submitSearch();
          }}
        >
          <Field label="Поиск по каталогу">
            <Input
              value={query}
              onChange={(_, data) => setQuery(data.value)}
              contentBefore={<Search24Regular />}
              placeholder="Название, бренд, артикул"
            />
          </Field>
          <Field label="Сортировка">
            <Select value={sort} onChange={(_, data) => setSort(data.value)}>
              <option value="RELEVANCE">По релевантности</option>
              <option value="PRICE_ASC">Сначала дешевле</option>
              <option value="PRICE_DESC">Сначала дороже</option>
              <option value="NAME_ASC">По названию</option>
              <option value="UPDATED_DESC">По обновлению</option>
            </Select>
          </Field>
          <Button
            type="submit"
            appearance="primary"
            icon={
              busy === "search" ? <Spinner size="tiny" /> : <Search24Regular />
            }
            disabled={busy === "search"}
          >
            Найти
          </Button>
        </form>
        <div className={styles.resultsMeta}>
          <span>{search?.total ?? 0} товаров по запросу</span>
          <span>Только с актуальным остатком</span>
        </div>
        {!search?.items.length ? (
          <EmptyState
            icon={<Search24Regular />}
            title="Ничего не найдено"
            description="Измените запрос или попробуйте более общее название категории."
          />
        ) : (
          <div className={styles.productList}>
            {search.items.map((product) => {
              const best = product.offers
                .filter((offer) => offer.priceMinor)
                .sort(
                  (a, b) =>
                    Number(a.normalizedPriceMinor) -
                    Number(b.normalizedPriceMinor),
                )[0];
              return (
                <article className={styles.product} key={product.id}>
                  <div className={styles.productIdentity}>
                    <span className={styles.category}>
                      {product.categories[0]?.name ?? "Стоматология"}
                    </span>
                    <h3>{product.name}</h3>
                    <p>
                      {[product.brand, product.manufacturer]
                        .filter(Boolean)
                        .join(" · ") || "Проверенная карточка каталога"}
                    </p>
                  </div>
                  <div className={styles.offerSummary}>
                    <strong>
                      {best
                        ? formatMoney(best.priceMinor, best.currency ?? "KZT")
                        : "Цена по запросу"}
                    </strong>
                    <span>
                      {product.offers.length} предложений ·{" "}
                      {best?.packaging.name ?? "упаковка уточняется"}
                    </span>
                  </div>
                  <div className={styles.productActions}>
                    <Button
                      appearance="secondary"
                      onClick={() => void compare(product.id)}
                      disabled={busy === `compare:${product.id}`}
                    >
                      {busy === `compare:${product.id}`
                        ? "Загрузка"
                        : "Сравнить"}
                    </Button>
                    {best ? (
                      <Button
                        appearance="primary"
                        icon={<Cart24Regular />}
                        onClick={() => void addToCart(best.id)}
                        disabled={busy === `cart:${best.id}`}
                      >
                        В корзину
                      </Button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Section>
      {comparison ? (
        <Section
          title="Сравнение предложений"
          description={`${comparison.product.name} · ${comparison.offers.length} поставщиков`}
        >
          <div className={styles.comparePanel}>
            <div className={styles.compareTitle}>
              <div>
                <h3>{comparison.product.name}</h3>
                <p>
                  {[comparison.product.brand, comparison.product.manufacturer]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button appearance="subtle" onClick={() => setComparison(null)}>
                Закрыть
              </Button>
            </div>
            <div className={styles.offerGrid}>
              {comparison.offers.map((offer) => (
                <article className={styles.offerCard} key={offer.offerId}>
                  <header>
                    <div>
                      <h4>{offer.supplier.name}</h4>
                      <p>
                        {offer.supplierSku ?? "Артикул поставщика не указан"}
                      </p>
                    </div>
                    {offer.markers.verifiedDocuments ? (
                      <StatusTag tone="success">Проверено</StatusTag>
                    ) : (
                      <StatusTag tone="warning">Проверка</StatusTag>
                    )}
                  </header>
                  <div className={styles.offerPrice}>
                    <strong>
                      {formatMoney(
                        offer.price.amountMinor,
                        offer.price.currency,
                      )}
                    </strong>
                    <small>
                      {formatMoney(
                        offer.price.normalizedPriceMinor,
                        offer.price.currency,
                      )}{" "}
                      за {offer.price.normalizedUnit}
                    </small>
                  </div>
                  <div className={styles.markers}>
                    {offer.markers.officialDistributor ? (
                      <StatusTag tone="info">Дистрибьютор</StatusTag>
                    ) : null}
                    {offer.markers.supplierWarranty ? (
                      <StatusTag tone="neutral">Гарантия</StatusTag>
                    ) : null}
                    {offer.markers.requiresConfirmation ? (
                      <StatusTag tone="warning">Подтверждение</StatusTag>
                    ) : (
                      <StatusTag tone="success">В наличии</StatusTag>
                    )}
                  </div>
                  <small>
                    {offer.packaging.name} ·{" "}
                    {offer.availability[0]?.quantityAvailable ?? 0} доступно
                  </small>
                  <Button
                    appearance="primary"
                    icon={<Cart24Regular />}
                    onClick={() => void addToCart(offer.offerId)}
                    disabled={busy === `cart:${offer.offerId}`}
                  >
                    Добавить
                  </Button>
                </article>
              ))}
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  );

  const renderCart = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Заказ"
        title="Корзина клиники"
        description="Цены и остатки будут повторно проверены перед резервированием."
        actions={
          <Button icon={<ArrowSync24Regular />} onClick={() => void refresh()}>
            Обновить
          </Button>
        }
      />
      {!activeCart || !activeCart.items.length ? (
        <Section>
          <EmptyState
            icon={<Cart24Regular />}
            title="Корзина пока пуста"
            description="Добавьте товары из каталога, чтобы собрать заказ нескольким поставщикам."
            action={
              <Button appearance="primary" onClick={() => setActive("catalog")}>
                Перейти в каталог
              </Button>
            }
          />
        </Section>
      ) : (
        <Section
          title={`${activeCart.items.length} позиций`}
          description="Активная корзина"
        >
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Поставщик</th>
                  <th>Количество</th>
                  <th>Цена</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {activeCart.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {item.offer?.productVariant?.product?.canonicalName ??
                          `Позиция ${item.offerId.slice(0, 8)}`}
                      </strong>
                      <small className="mp-mono">
                        {item.offerId.slice(0, 12)}
                      </small>
                    </td>
                    <td>
                      {item.offer?.supplier?.organization?.displayName ??
                        "Поставщик"}
                    </td>
                    <td>{item.quantity}</td>
                    <td>{formatMoney(item.unitPriceMinor, item.currency)}</td>
                    <td>
                      <strong>
                        {formatMoney(item.totalPriceMinor, item.currency)}
                      </strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.cartTotal}>
            <span>
              Итого по корзине
              <strong>
                {formatMoney(
                  activeCart.items.reduce(
                    (sum, item) => sum + Number(item.totalPriceMinor),
                    0,
                  ),
                  activeCart.currency,
                )}
              </strong>
            </span>
            <Button
              appearance="primary"
              size="large"
              icon={<ShoppingBag24Regular />}
              onClick={() => void checkout()}
              disabled={busy === "checkout"}
            >
              {busy === "checkout" ? "Резервируем" : "Оформить заказ"}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );

  const renderOrders = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Исполнение"
        title="Заказы"
        description="Один checkout автоматически разделяется на отдельные заказы поставщикам."
      />
      <div className="mp-metrics">
        <Metric
          label="Всего заказов"
          value={buyerOrders.length}
          detail="По всем поставщикам"
          icon={<ClipboardTaskListLtr24Regular />}
        />
        <Metric
          label="Ждут подтверждения"
          value={
            buyerOrders.filter(
              (order) => order.status === "AWAITING_CONFIRMATION",
            ).length
          }
          detail="Резерв уже создан"
          icon={<Box24Regular />}
        />
        <Metric
          label="Подтверждены"
          value={
            buyerOrders.filter((order) => order.status === "CONFIRMED").length
          }
          detail="Готовы к отгрузке"
          icon={<CheckmarkCircle24Regular />}
        />
        <Metric
          label="Объём закупок"
          value={formatMoney(
            buyerOrders.reduce(
              (sum, order) => sum + Number(order.subtotalAmountMinor),
              0,
            ),
          )}
          detail="Включая текущие заказы"
          icon={<ShoppingBag24Regular />}
        />
      </div>
      <Section>
        {!buyerOrders.length ? (
          <EmptyState
            icon={<ClipboardTaskListLtr24Regular />}
            title="Заказов ещё нет"
            description="Оформленные корзины появятся здесь."
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Заказ</th>
                  <th>Поставщик</th>
                  <th>Позиции</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Создан</th>
                </tr>
              </thead>
              <tbody>
                {buyerOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.orderNumber}</strong>
                      <small className="mp-mono">{order.id.slice(0, 8)}</small>
                    </td>
                    <td>{order.supplier.displayName}</td>
                    <td>{order.items.length}</td>
                    <td>
                      {formatMoney(order.subtotalAmountMinor, order.currency)}
                    </td>
                    <td>
                      <StatusTag tone={statusTone(order.status)}>
                        {formatStatus(order.status)}
                      </StatusTag>
                    </td>
                    <td>{formatDate(order.createdAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );

  const renderDocuments = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Юридический контур"
        title="Документы"
        description="Счета, спецификации, накладные и подписанные версии хранятся с контрольной суммой."
      />
      <Section>
        {!documents.length ? (
          <EmptyState
            icon={<Document24Regular />}
            title="Документов пока нет"
            description="Документы заказа появятся после формирования оператором или поставщиком."
          />
        ) : (
          <div className={styles.documentList}>
            {documents.map((document) => (
              <article className={styles.document} key={document.id}>
                <div>
                  <strong>{document.title}</strong>
                  <p>
                    {document.kind} · {document.format} ·{" "}
                    {document.documentNumber ?? "без номера"} ·{" "}
                    {formatDate(document.createdAt, true)}
                  </p>
                </div>
                <div className="mp-inline-actions">
                  <StatusTag tone={statusTone(document.status)}>
                    {formatStatus(document.status)}
                  </StatusTag>
                  <Button
                    appearance="subtle"
                    onClick={() => void downloadDocument(document)}
                    disabled={busy === `document:${document.id}`}
                  >
                    Скачать
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );

  const renderNotifications = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="События"
        title="Уведомления"
        description="Изменения заказов, платежей, документов и доставки в одном журнале."
      />
      <Section>
        {!notifications.length ? (
          <EmptyState
            icon={<Alert24Regular />}
            title="Нет новых событий"
            description="Важные события по закупкам появятся здесь."
          />
        ) : (
          <div className={styles.notificationList}>
            {notifications.map((notification) => (
              <article className={styles.notification} key={notification.id}>
                <div>
                  <strong>{notification.subject}</strong>
                  <p>{notification.body}</p>
                  <p>
                    {notification.eventType} ·{" "}
                    {formatDate(notification.createdAt, true)}
                  </p>
                </div>
                <div className="mp-inline-actions">
                  <StatusTag
                    tone={
                      notification.priority === "CRITICAL"
                        ? "danger"
                        : notification.readAt
                          ? "neutral"
                          : "info"
                    }
                  >
                    {notification.readAt ? "Прочитано" : notification.priority}
                  </StatusTag>
                  {!notification.readAt ? (
                    <Button
                      appearance="subtle"
                      onClick={() => void markRead(notification.id)}
                      disabled={busy === `read:${notification.id}`}
                    >
                      Прочитано
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>
    </div>
  );

  const content =
    active === "catalog"
      ? renderCatalog()
      : active === "cart"
        ? renderCart()
        : active === "orders"
          ? renderOrders()
          : active === "documents"
            ? renderDocuments()
            : active === "workspace" || active === "assistant" || active === "support"
              ? <BuyerServicesPanel mode={active} buyerId={buyerId} apiContext={apiContext} />
              : active === "smart-commerce"
                ? <SmartCommercePanel buyerId={buyerId} apiContext={apiContext} />
              : renderNotifications();
  const nav = navigation.map((item) =>
    item.id === "cart" && activeCart?.items.length
      ? { ...item, badge: String(activeCart.items.length) }
      : item.id === "notifications" && unread
        ? { ...item, badge: String(unread) }
        : item,
  );

  return (
    <AppShell
      productName="DentMarket"
      productMark="DM"
      workspaceLabel="Кабинет клиники"
      userName={handoff?.displayName ?? "Demo Dental Clinic"}
      userMeta={`${handoff ? "География не настроена" : "Павлодар"} · Покупатель`}
      navigation={nav}
      activeNavigation={active}
      onNavigate={setActive}
      actions={
        <Button
          appearance="subtle"
          icon={<ArrowSync24Regular />}
          onClick={() => void refresh()}
          aria-label="Обновить данные"
        />
      }
    >
      {loading ? (
        <LoadingState label="Загружаем кабинет клиники" />
      ) : error && !search ? (
        <ErrorState
          description={error}
          action={<Button onClick={() => void refresh()}>Повторить</Button>}
        />
      ) : (
        <>
          {error ? <div className={styles.toast}>{error}</div> : null}
          {content}
        </>
      )}
      {toast ? (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      ) : null}
    </AppShell>
  );
}
