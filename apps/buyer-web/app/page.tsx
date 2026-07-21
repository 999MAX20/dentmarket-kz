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
  BuildingShop24Regular,
  Grid24Regular,
  List24Regular,
  PersonSupport24Regular,
  Location24Regular,
  Search24Regular,
  ShoppingBag24Regular,
} from "@fluentui/react-icons";
import {
  MarketplaceApiClient,
  parseSessionHandoff,
  type ApiContext,
  type SessionHandoffEnvelope,
} from "@marketplace/api-client";
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
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { BuyerServicesPanel } from "./buyer-services-panel";
import { SmartCommercePanel } from "./smart-commerce-panel";
import medstomCatalog from "./data/medstom-catalog.json";

const BUYER_ID = "00000000-0000-4000-8000-000000000030";
const BUYER_USER_ID = "00000000-0000-4000-8000-000000000500";
type SessionHandoff = SessionHandoffEnvelope;
const SESSION_KEY = "dentmarket:buyer-session";
const LOGIN_URL = process.env.NEXT_PUBLIC_LOGIN_URL ?? "/login";
const dentalSearchSuggestions = [
  "светник",
  "текучка",
  "коффер",
  "эндошка",
  "гутта",
  "карпулы",
];
const dentalSearchAliases: Record<string, string[]> = {
  светник: ["светильник", "лампа"],
  текучка: ["композит", "текучий"],
  коффер: ["коффердам", "изоляция"],
  эндошка: ["эндодонтия", "эндодонтический"],
  гутта: ["гуттаперча"],
  карпулы: ["карпула", "анестезия"],
};

function readSessionHandoff(): SessionHandoff | null {
  if (typeof window === "undefined") return null;
  const serialized = window.location.hash.startsWith("#session=")
    ? decodeURIComponent(window.location.hash.slice("#session=".length))
    : window.sessionStorage.getItem(SESSION_KEY);
  return parseSessionHandoff(serialized, "BUYER");
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
  supplierSku?: string | null;
  verifiedDocuments?: boolean;
  officialDistributor?: boolean;
  supplierWarranty?: boolean;
};
type SearchProduct = {
  id: string;
  name: string;
  brand: string | null;
  manufacturer: string | null;
  categories: Array<{ id: string; name: string }>;
  minNormalizedPriceMinor: string | null;
  isAvailable: boolean;
  reviewSummary?: { count: number; averageRating: number | null };
  offers: SearchOffer[];
};
type SearchResult = {
  total: number;
  interpretedQuery?: string[];
  items: SearchProduct[];
  facets: {
    categories: Array<{ id: string; name: string; count: number }>;
    suppliers: Array<{ id: string; name: string; count: number }>;
  };
};
const demoCatalogFallback: SearchProduct[] = [
  {
    id: "00000000-0000-4000-8000-000000000100",
    name: "Перчатки нитриловые SafeTouch Ultra",
    brand: "SafeTouch",
    manufacturer: "SafeMed Industries",
    categories: [
      { id: "00000000-0000-4000-8000-000000000901", name: "Перчатки" },
    ],
    minNormalizedPriceMinor: "4750",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000180",
        supplier: {
          id: "00000000-0000-4000-8000-000000000060",
          name: "MedConsum",
        },
        priceMinor: "475000",
        currency: "KZT",
        normalizedPriceMinor: "4750",
        packaging: {
          name: "Упаковка 100 штук",
          quantityInBaseUnit: "100",
          unit: "шт",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["CARRIER"],
      },
      {
        id: "00000000-0000-4000-8000-000000000150",
        supplier: {
          id: "00000000-0000-4000-8000-000000000020",
          name: "Demo Dental Supply",
        },
        priceMinor: "490000",
        currency: "KZT",
        normalizedPriceMinor: "4900",
        packaging: {
          name: "Упаковка 100 штук",
          quantityInBaseUnit: "100",
          unit: "шт",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["SUPPLIER_CITY"],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000110",
    name: "Нагрудники стоматологические CleanDent 2-слойные",
    brand: "CleanDent",
    manufacturer: "CleanDent Europe",
    categories: [
      { id: "00000000-0000-4000-8000-000000000902", name: "Нагрудники" },
    ],
    minNormalizedPriceMinor: "2360",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000200",
        supplier: {
          id: "00000000-0000-4000-8000-000000000070",
          name: "TechDent Systems",
        },
        priceMinor: "1180000",
        currency: "KZT",
        normalizedPriceMinor: "2360",
        packaging: {
          name: "Упаковка 500 штук",
          quantityInBaseUnit: "500",
          unit: "шт",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["SUPPLIER_CITY"],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000120",
    name: "Бахилы MediStep усиленные",
    brand: "MediStep",
    manufacturer: "MediStep Asia",
    categories: [
      { id: "00000000-0000-4000-8000-000000000903", name: "Бахилы" },
    ],
    minNormalizedPriceMinor: "7000",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000170",
        supplier: {
          id: "00000000-0000-4000-8000-000000000060",
          name: "MedConsum",
        },
        priceMinor: "350000",
        currency: "KZT",
        normalizedPriceMinor: "7000",
        packaging: {
          name: "Упаковка 50 пар",
          quantityInBaseUnit: "50",
          unit: "пар",
        },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["CARRIER"],
      },
    ],
  },
  {
    id: "00000000-0000-4000-8000-000000000130",
    name: "Стоматологическая установка DentTech X5",
    brand: "DentTech",
    manufacturer: "DentTech GmbH",
    categories: [
      { id: "00000000-0000-4000-8000-000000000904", name: "Оборудование" },
    ],
    minNormalizedPriceMinor: "85000000",
    isAvailable: true,
    offers: [
      {
        id: "00000000-0000-4000-8000-000000000190",
        supplier: {
          id: "00000000-0000-4000-8000-000000000070",
          name: "TechDent Systems",
        },
        priceMinor: "85000000",
        currency: "KZT",
        normalizedPriceMinor: "85000000",
        packaging: { name: "Комплект", quantityInBaseUnit: "1", unit: "шт" },
        available: true,
        confirmationMode: "AUTO",
        deliveryMethods: ["SPECIAL"],
      },
    ],
  },
];
const medstomCatalogFallback: SearchProduct[] = medstomCatalog.products.map(
  (product) => ({
    id: `medstom-product-${product.externalId}`,
    name: product.name,
    brand: product.brand || null,
    manufacturer: null,
    categories: [
      {
        id: `medstom-category-${product.categoryExternalId}`,
        name: product.category,
      },
    ],
    minNormalizedPriceMinor: product.priceMinor || null,
    isAvailable: false,
    offers: [
      {
        id: `medstom-offer-${product.externalId}`,
        supplier: { id: "medstom-kz", name: "Medstom KZ" },
        priceMinor: product.priceMinor || null,
        currency: product.currency,
        normalizedPriceMinor: product.priceMinor || null,
        packaging: {
          name: product.unit || "шт",
          quantityInBaseUnit: "1",
          unit: product.unit || "шт",
        },
        available: false,
        confirmationMode: "MANUAL",
        deliveryMethods: ["NATIONWIDE"],
        supplierSku: product.supplierSku || null,
        verifiedDocuments: false,
        officialDistributor: false,
        supplierWarranty: false,
      },
    ],
  }),
);
const publicCatalogFallback = [
  ...medstomCatalogFallback,
  ...demoCatalogFallback,
];
const fallbackSearch = (
  query: string,
  sort: string,
  filters: {
    unit?: string;
    packaging?: string;
    delivery?: string;
    stock?: string;
  } = {},
): SearchResult => {
  const normalized = query.trim().toLocaleLowerCase("ru");
  const searchTerms = [
    normalized,
    ...(dentalSearchAliases[normalized] ?? []),
  ].filter(Boolean);
  const filtered = publicCatalogFallback.filter((product) => {
    const offer = product.offers[0];
    const text = [
      product.name,
      product.brand,
      product.manufacturer,
      product.categories[0]?.name,
      offer?.supplier.name,
      offer?.packaging.name,
      offer?.packaging.unit,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("ru");
    return (
      (!searchTerms.length ||
        searchTerms.some((term) => text.includes(term))) &&
      (!filters.unit || text.includes(filters.unit.toLocaleLowerCase("ru"))) &&
      (!filters.packaging ||
        text.includes(filters.packaging.toLocaleLowerCase("ru"))) &&
      (!filters.delivery ||
        offer?.deliveryMethods.includes(filters.delivery)) &&
      (filters.stock !== "true" || offer?.available === true)
    );
  });
  filtered.sort((left, right) => {
    if (sort === "PRICE_ASC")
      return (
        Number(left.minNormalizedPriceMinor || Number.MAX_SAFE_INTEGER) -
        Number(right.minNormalizedPriceMinor || Number.MAX_SAFE_INTEGER)
      );
    if (sort === "PRICE_DESC")
      return (
        Number(right.minNormalizedPriceMinor || -1) -
        Number(left.minNormalizedPriceMinor || -1)
      );
    if (sort === "NAME_ASC") return left.name.localeCompare(right.name, "ru");
    return left.name.localeCompare(right.name, "ru");
  });
  return {
    total: filtered.length,
    items: filtered.slice(0, 60),
    facets: { categories: [], suppliers: [] },
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
  reviewSummary?: { count: number; averageRating: number | null };
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
type SupplierTrust = {
  status: string;
  score: string | null;
  reviewCount?: number;
  eventCount?: number;
};
type ProductReviews = {
  summary: { count: number; averageRating: number | null };
  reviews: Array<{
    id: string;
    overallRating: number;
    comment: string | null;
    officialResponse: string | null;
    createdAt: string;
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
  {
    id: "smart-commerce",
    label: "Город и рекомендации",
    icon: <Location24Regular />,
  },
  { id: "workspace", label: "Списки и бюджеты", icon: <List24Regular /> },
  { id: "assistant", label: "AI-помощник", icon: <Bot24Regular /> },
  { id: "support", label: "Поддержка", icon: <PersonSupport24Regular /> },
  { id: "notifications", label: "Уведомления", icon: <Alert24Regular /> },
  { id: "about", label: "О платформе", icon: <BuildingShop24Regular /> },
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
  const apiContext = useMemo<ApiContext>(
    () =>
      handoff?.accessToken
        ? { accessToken: handoff.accessToken }
        : handoff?.actorId && handoff.organizationId
          ? { actorId: handoff.actorId, organizationId: handoff.organizationId }
          : {},
    [handoff],
  );
  const api = useMemo(
    () =>
      new MarketplaceApiClient(
        process.env.NEXT_PUBLIC_API_URL ??
          "https://dentmarket-api.vercel.app/api",
        apiContext,
      ),
    [apiContext],
  );
  useEffect(() => {
    void (async () => {
      const next = readSessionHandoff();
      if (!next) {
        setHandoffChecked(true);
        return;
      }
      let resolved = next;
      if (next.handoffCode && !next.accessToken) {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api"}/auth/handoff/exchange`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ handoffCode: next.handoffCode }),
          },
        );
        if (!response.ok) {
          setHandoffChecked(true);
          return;
        }
        const session = (await response.json()) as {
          accessToken?: string;
          user?: { id: string; displayName: string };
          organizationId?: string;
          capability?: string;
        };
        resolved = { ...next, ...session, actorId: session.user?.id };
      }
      setHandoff(resolved);
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(resolved));
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      setHandoffChecked(true);
    })();
  }, []);
  const [active, setActive] = useState("catalog");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("RELEVANCE");
  const [unitFilter, setUnitFilter] = useState("");
  const [packagingFilter, setPackagingFilter] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("true");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [productReviews, setProductReviews] = useState<ProductReviews | null>(
    null,
  );
  const [supplierTrust, setSupplierTrust] = useState<
    Record<string, SupplierTrust>
  >({});
  const [carts, setCarts] = useState<Cart[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<string, { rating: number; comment: string }>
  >({});
  const [submittedReviews, setSubmittedReviews] = useState<string[]>([]);

  const activeCart = carts.find((cart) => cart.status === "ACTIVE") ?? null;
  const buyerOrders = orders.filter(
    (order) => order.buyerOrganizationId === buyerId,
  );
  const unread = notifications.filter((item) => !item.readAt).length;

  const buildSearchParams = useCallback(
    (nextQuery = query, nextSort = sort) => {
      const params = new URLSearchParams({
        buyerOrganizationId: buyerId,
        q: nextQuery,
        sort: nextSort,
        limit: "24",
      });
      if (stockFilter !== "all") params.set("inStock", stockFilter);
      if (unitFilter) params.set("unit", unitFilter);
      if (packagingFilter) params.set("packaging", packagingFilter);
      if (deliveryFilter) params.set("deliveryMethod", deliveryFilter);
      return params;
    },
    [
      buyerId,
      deliveryFilter,
      packagingFilter,
      query,
      sort,
      stockFilter,
      unitFilter,
    ],
  );

  const loadSearch = useCallback(
    async (nextQuery = query, nextSort = sort) => {
      const params = buildSearchParams(nextQuery, nextSort);
      try {
        setSearch(
          await api.get<SearchResult>(
            `${handoff ? "/marketplace" : "/catalog"}/search?${params}`,
          ),
        );
      } catch (cause) {
        if (handoff) throw cause;
        setSearch(
          fallbackSearch(nextQuery, nextSort, {
            unit: unitFilter,
            packaging: packagingFilter,
            delivery: deliveryFilter,
            stock: stockFilter,
          }),
        );
      }
    },
    [
      api,
      buildSearchParams,
      deliveryFilter,
      handoff,
      packagingFilter,
      query,
      sort,
      unitFilter,
    ],
  );

  const refresh = useCallback(async () => {
    if (!handoffChecked) return;
    setLoading(true);
    setError(null);
    try {
      if (!handoff) {
        await loadSearch(query, sort);
        setCarts([]);
        setOrders([]);
        setDocuments([]);
        setNotifications([]);
        return;
      }
      const [
        searchResult,
        cartResult,
        orderResult,
        documentResult,
        notificationResult,
      ] = await Promise.all([
        api.get<SearchResult>(`/marketplace/search?${buildSearchParams()}`),
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
  }, [
    api,
    buildSearchParams,
    buyerId,
    handoff,
    handoffChecked,
    loadSearch,
    query,
    sort,
  ]);

  const logout = useCallback(async () => {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ??
      "https://dentmarket-api.vercel.app/api";
    if (handoff?.sessionId && handoff.actorId && handoff.accessToken) {
      try {
        await fetch(`${apiUrl}/auth/sessions/${handoff.sessionId}/revoke`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${handoff.accessToken}`,
            "x-user-id": handoff.actorId,
          },
          body: JSON.stringify({ reason: "user_logout" }),
        });
      } catch {
        // Local cleanup still guarantees that the current browser loses access.
      }
    }
    window.sessionStorage.removeItem(SESSION_KEY);
    setHandoff(null);
    setActive("catalog");
    window.location.assign("/");
  }, [handoff]);

  useEffect(() => {
    if (handoffChecked) void refresh();
  }, [handoffChecked, refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const submitSearchFor = async (nextQuery: string) => {
    setBusy("search");
    setError(null);
    setComparison(null);
    setProductReviews(null);
    try {
      await loadSearch(nextQuery, sort);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };
  const submitSearch = async () => submitSearchFor(query);

  const compare = async (productId: string) => {
    setBusy(`compare:${productId}`);
    setError(null);
    try {
      if (!handoff) {
        const product = search?.items.find(({ id }) => id === productId);
        if (product) {
          setComparison({
            product: {
              id: product.id,
              name: product.name,
              brand: product.brand,
              manufacturer: product.manufacturer,
            },
            reviewSummary: product.reviewSummary,
            offers: product.offers
              .filter((offer) => offer.priceMinor && offer.normalizedPriceMinor)
              .map((offer) => ({
                offerId: offer.id,
                supplier: {
                  organizationId: offer.supplier.id,
                  name: offer.supplier.name,
                },
                supplierSku: offer.supplierSku ?? null,
                price: {
                  amountMinor: offer.priceMinor!,
                  currency: offer.currency ?? "KZT",
                  normalizedPriceMinor: offer.normalizedPriceMinor!,
                  normalizedUnit: offer.packaging.unit ?? "ед.",
                },
                packaging: {
                  name: offer.packaging.name ?? "Упаковка",
                  quantityInBaseUnit: offer.packaging.quantityInBaseUnit,
                  unit: offer.packaging.unit,
                },
                availability: [
                  {
                    warehouse: offer.available
                      ? "Подтверждённый склад"
                      : "Остаток не подтверждён",
                    quantityAvailable: offer.available
                      ? "в наличии"
                      : "требует подтверждения",
                    updatedAt: new Date().toISOString(),
                  },
                ],
                delivery: offer.deliveryMethods.map((method) => ({
                  method,
                  minLeadTimeHours: null,
                  maxLeadTimeHours: null,
                })),
                markers: {
                  verifiedDocuments: offer.verifiedDocuments ?? true,
                  complianceRisk:
                    (offer.verifiedDocuments ?? true)
                      ? "LOW"
                      : "REVIEW_REQUIRED",
                  officialDistributor: offer.officialDistributor ?? false,
                  supplierWarranty: offer.supplierWarranty ?? true,
                  requiresConfirmation:
                    offer.confirmationMode === "MANUAL" || !offer.available,
                },
              })),
            comparisonAttributes: [],
          });
          return;
        }
      }
      const nextComparison = await api.get<Comparison>(
        `${handoff ? "/marketplace" : "/catalog"}/products/${productId}/compare?buyerOrganizationId=${buyerId}&quantity=1`,
      );
      setComparison(nextComparison);
      const [reviews, ...ratings] = await Promise.all([
        api.get<ProductReviews>(`/trust/products/${productId}/reviews`),
        ...nextComparison.offers.map((offer) =>
          api.get<SupplierTrust>(
            `/trust/ratings/suppliers/${offer.supplier.organizationId}`,
          ),
        ),
      ]);
      setProductReviews(reviews);
      setSupplierTrust(
        Object.fromEntries(
          nextComparison.offers.map((offer, index) => [
            offer.supplier.organizationId,
            ratings[index],
          ]),
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const addToCart = async (offerId: string) => {
    if (!handoff) {
      window.location.assign(LOGIN_URL);
      return;
    }
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

  const reviewDraft = (orderId: string) =>
    reviewDrafts[orderId] ?? { rating: 5, comment: "" };
  const submitReview = async (orderId: string) => {
    const draft = reviewDraft(orderId);
    setBusy(`review:${orderId}`);
    try {
      await api.post(`/trust/orders/${orderId}/reviews`, {
        overallRating: draft.rating,
        comment: draft.comment.trim() || null,
        idempotencyKey: `buyer-review:${orderId}`,
      });
      setSubmittedReviews((items) => [...new Set([...items, orderId])]);
      setToast("Отзыв отправлен и привязан к подтверждённому заказу");
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
        title="Закупки для стоматологии — без лишних звонков"
        description="Сравнивайте цены, наличие и условия поставщиков Казахстана в одном каталоге."
      />
      <div className={styles.catalogProof} aria-label="Преимущества каталога">
        <span>
          <strong>10 000+</strong>
          <small>карточек в каталоге</small>
        </span>
        <span>
          <strong>КЗ</strong>
          <small>поставщики по Казахстану</small>
        </span>
        <span>
          <strong>24/7</strong>
          <small>поиск по сленгу и брендам</small>
        </span>
      </div>
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
              className={styles.searchInput}
              value={query}
              onChange={(_, data) => setQuery(data.value)}
              contentBefore={<Search24Regular />}
              placeholder="Например: текучий композит, гутта, перчатки"
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
        <div
          className={styles.searchHelp}
          aria-label="Быстрые стоматологические запросы"
        >
          <span>Можно искать по-своему:</span>
          {dentalSearchSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuery(suggestion);
                void submitSearchFor(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <details className={styles.advancedFilters}>
          <summary>
            Уточнить поиск <span>фасовка, единица, доставка, наличие</span>
          </summary>
          <div
            className={styles.advancedFiltersGrid}
            aria-label="Дополнительные фильтры каталога"
          >
            <Field label="Фасовка">
              <Input
                value={packagingFilter}
                onChange={(_, data) => setPackagingFilter(data.value)}
                placeholder="например, 100 шт"
              />
            </Field>
            <Field label="Единица">
              <Select
                value={unitFilter}
                onChange={(_, data) => setUnitFilter(data.value)}
              >
                <option value="">Любая</option>
                <option value="шт">шт</option>
                <option value="уп">упаковка</option>
                <option value="мл">мл</option>
                <option value="г">г</option>
                <option value="комплект">комплект</option>
              </Select>
            </Field>
            <Field label="Доставка">
              <Select
                value={deliveryFilter}
                onChange={(_, data) => setDeliveryFilter(data.value)}
              >
                <option value="">Любая</option>
                <option value="CARRIER">Курьер</option>
                <option value="NATIONWIDE">По Казахстану</option>
                <option value="PICKUP">Самовывоз</option>
              </Select>
            </Field>
            <Field label="Наличие">
              <Select
                value={stockFilter}
                onChange={(_, data) => setStockFilter(data.value)}
              >
                <option value="true">Только в наличии</option>
                <option value="all">Все предложения</option>
              </Select>
            </Field>
          </div>
        </details>
        <div className={styles.resultsMeta}>
          <span>{search?.total ?? 0} товаров по запросу</span>
          <span>
            {search?.interpretedQuery?.length
              ? `Поняли как: ${search.interpretedQuery.join(", ")}`
              : "Сленг, бренд, артикул и официальное название"}
          </span>
        </div>
        {!search?.items.length ? (
          <EmptyState
            icon={<Search24Regular />}
            title="Ничего не найдено"
            description="Попробуйте профессиональный термин, сленг врача или начните с одной ключевой характеристики."
            action={
              <div className={styles.searchEmptyActions}>
                {dentalSearchSuggestions.slice(0, 4).map((suggestion) => (
                  <Button
                    key={suggestion}
                    size="small"
                    appearance="secondary"
                    onClick={() => {
                      setQuery(suggestion);
                      void submitSearchFor(suggestion);
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            }
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
                  <div className={styles.productVisual} aria-hidden="true">
                    <ShoppingBag24Regular />
                  </div>
                  <div className={styles.productIdentity}>
                    <span className={styles.category}>
                      {product.categories[0]?.name ?? "Стоматология"}
                    </span>
                    <h3>{product.name}</h3>
                    <p>
                      {[product.brand, product.manufacturer]
                        .filter(Boolean)
                        .join(" · ") ||
                        (best?.verifiedDocuments === false
                          ? "Внешний каталог · поставщик не верифицирован"
                          : "Проверенная карточка каталога")}
                    </p>
                    {product.reviewSummary?.count ? (
                      <small className={styles.reviewSummary}>
                        {product.reviewSummary.averageRating?.toFixed(1)} ★ ·{" "}
                        {product.reviewSummary.count} отзывов после заказов
                      </small>
                    ) : (
                      <small className={styles.reviewSummaryMuted}>
                        Пока без отзывов
                      </small>
                    )}
                    {best ? (
                      <div className={styles.productSignals}>
                        <span
                          className={
                            best.available
                              ? styles.signalGood
                              : styles.signalMuted
                          }
                        >
                          {best.available ? "В наличии" : "Под заказ"}
                        </span>
                        <span>{best.supplier.name}</span>
                      </div>
                    ) : null}
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
                    {best ? (
                      <small className={styles.deliveryHint}>
                        {best.deliveryMethods.includes("NATIONWIDE")
                          ? "Доставка по Казахстану"
                          : best.deliveryMethods.includes("CARRIER")
                            ? "Курьерская доставка"
                            : "Условия уточняются"}
                      </small>
                    ) : null}
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
                    {best &&
                    best.available &&
                    (best.verifiedDocuments ?? true) ? (
                      <Button
                        appearance="primary"
                        icon={<Cart24Regular />}
                        onClick={() => void addToCart(best.id)}
                        disabled={busy === `cart:${best.id}`}
                      >
                        В корзину
                      </Button>
                    ) : best ? (
                      <Button appearance="secondary" disabled>
                        После верификации
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
              <div className={styles.productReviewSummary}>
                <strong>
                  {comparison.reviewSummary?.averageRating == null
                    ? "Новый товар"
                    : `${comparison.reviewSummary.averageRating.toFixed(1)} ★`}
                </strong>
                <span>
                  {comparison.reviewSummary?.count ?? 0} подтверждённых отзывов
                </span>
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
                    {supplierTrust[offer.supplier.organizationId]?.score !=
                    null ? (
                      <StatusTag tone="info">
                        Надёжность{" "}
                        {Number(
                          supplierTrust[offer.supplier.organizationId].score,
                        ).toFixed(1)}
                        /100
                      </StatusTag>
                    ) : null}
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
                    disabled={
                      busy === `cart:${offer.offerId}` ||
                      offer.markers.requiresConfirmation ||
                      !offer.markers.verifiedDocuments
                    }
                  >
                    {offer.markers.requiresConfirmation ||
                    !offer.markers.verifiedDocuments
                      ? "После верификации"
                      : "Добавить"}
                  </Button>
                </article>
              ))}
            </div>
            <div className={styles.productReviews}>
              <h4>Отзывы клиник</h4>
              {!productReviews?.reviews.length ? (
                <p>
                  Подтверждённых отзывов пока нет. Они появляются после реальных
                  заказов.
                </p>
              ) : (
                productReviews.reviews.slice(0, 5).map((review) => (
                  <article key={review.id}>
                    <strong>{review.overallRating} ★</strong>
                    <span>{review.comment || "Оценка без комментария"}</span>
                    {review.officialResponse ? (
                      <small>Ответ поставщика: {review.officialResponse}</small>
                    ) : null}
                  </article>
                ))
              )}
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
                  <Fragment key={order.id}>
                    <tr>
                      <td>
                        <strong>{order.orderNumber}</strong>
                        <small className="mp-mono">
                          {order.id.slice(0, 8)}
                        </small>
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
                    {[
                      "DELIVERED",
                      "PARTIALLY_FULFILLED",
                      "RETURN_DISPUTE",
                      "REJECTED",
                      "CANCELLED",
                    ].includes(order.status) ? (
                      <tr>
                        <td colSpan={6}>
                          <div className={styles.reviewForm}>
                            <strong>
                              {submittedReviews.includes(order.id)
                                ? "Отзыв отправлен"
                                : "Оцените исполнение заказа"}
                            </strong>
                            {submittedReviews.includes(order.id) ? (
                              <span>
                                Оценка будет учтена в рейтинге поставщика.
                              </span>
                            ) : (
                              <>
                                <Select
                                  value={String(reviewDraft(order.id).rating)}
                                  onChange={(_, data) =>
                                    setReviewDrafts((items) => ({
                                      ...items,
                                      [order.id]: {
                                        ...reviewDraft(order.id),
                                        rating: Number(data.value),
                                      },
                                    }))
                                  }
                                >
                                  <option value="5">5 — отлично</option>
                                  <option value="4">4 — хорошо</option>
                                  <option value="3">3 — нормально</option>
                                  <option value="2">2 — плохо</option>
                                  <option value="1">1 — очень плохо</option>
                                </Select>
                                <Input
                                  value={reviewDraft(order.id).comment}
                                  onChange={(_, data) =>
                                    setReviewDrafts((items) => ({
                                      ...items,
                                      [order.id]: {
                                        ...reviewDraft(order.id),
                                        comment: data.value,
                                      },
                                    }))
                                  }
                                  placeholder="Комментарий о поставке, цене или наличии"
                                />
                                <Button
                                  appearance="secondary"
                                  onClick={() => void submitReview(order.id)}
                                  disabled={busy === `review:${order.id}`}
                                >
                                  {busy === `review:${order.id}`
                                    ? "Отправляем"
                                    : "Оставить отзыв"}
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
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
    active === "catalog" ? (
      renderCatalog()
    ) : active === "cart" ? (
      renderCart()
    ) : active === "orders" ? (
      renderOrders()
    ) : active === "documents" ? (
      renderDocuments()
    ) : active === "workspace" ||
      active === "assistant" ||
      active === "support" ? (
      <BuyerServicesPanel
        mode={active}
        buyerId={buyerId}
        apiContext={apiContext}
      />
    ) : active === "smart-commerce" ? (
      <SmartCommercePanel buyerId={buyerId} apiContext={apiContext} />
    ) : (
      renderNotifications()
    );
  const nav = navigation.map((item) =>
    item.id === "cart" && activeCart?.items.length
      ? { ...item, badge: String(activeCart.items.length) }
      : item.id === "notifications" && unread
        ? { ...item, badge: String(unread) }
        : item,
  );

  if (!handoff && active === "catalog") {
    return (
      <div className={styles.publicStore}>
        <header className={styles.publicHeader}>
          <a
            className={styles.publicBrand}
            href="/"
            aria-label="DentMarket — магазин"
          >
            <span className={styles.publicBrandMark}>DM</span>
            <span>
              <strong>DentMarket</strong>
              <small>Маркетплейс для стоматологий</small>
            </span>
          </a>
          <nav className={styles.publicNav} aria-label="Разделы магазина">
            <a className={styles.publicNavActive} href="#catalog">
              Каталог
            </a>
            <a href="/about">Поставщикам</a>
            <a href="/about">О платформе</a>
          </nav>
          <Button
            appearance="primary"
            onClick={() => window.location.assign(LOGIN_URL)}
          >
            Войти
          </Button>
        </header>
        <main className={styles.publicMain} id="catalog">
          {loading ? (
            <LoadingState label="Загружаем каталог" />
          ) : (
            renderCatalog()
          )}
        </main>
        <footer className={styles.publicFooter}>
          <span>© DentMarket KZ</span>
          <span>Закупки для клиник и поставщиков</span>
        </footer>
      </div>
    );
  }

  return (
    <AppShell
      productName="DentMarket"
      productMark="DM"
      workspaceLabel="Кабинет клиники"
      userName={handoff?.displayName ?? "Гость"}
      userMeta={
        handoff ? "Клиника · Покупатель" : "Каталог доступен без регистрации"
      }
      navigation={nav}
      activeNavigation={active}
      onLogout={handoff ? () => void logout() : undefined}
      onNavigate={(item) => {
        if (item === "about") window.location.assign("/about");
        else if (!handoff && item !== "catalog")
          window.location.assign(LOGIN_URL);
        else setActive(item);
      }}
      actions={
        <Button
          appearance={handoff ? "subtle" : "primary"}
          icon={handoff ? <ArrowSync24Regular /> : undefined}
          onClick={() =>
            handoff ? void refresh() : window.location.assign(LOGIN_URL)
          }
          aria-label={handoff ? "Обновить данные" : "Войти"}
        >
          {handoff ? null : "Войти"}
        </Button>
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
