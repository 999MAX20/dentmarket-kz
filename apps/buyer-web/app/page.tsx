"use client";

import {
  Button,
  Checkbox,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
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
  Dismiss24Regular,
  Filter24Regular,
  Bot24Regular,
  Grid24Regular,
  List24Regular,
  MoreHorizontal24Regular,
  PersonSupport24Regular,
  Location24Regular,
  Search24Regular,
  ShoppingBag24Regular,
  Star16Filled,
  Tag24Regular,
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
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import styles from "./page.module.css";
import { BuyerServicesPanel } from "./buyer-services-panel";
import { SmartCommercePanel } from "./smart-commerce-panel";
import publicCatalogData from "./data/public-catalog-fallback.json";
import publicCatalogMedia from "./data/public-catalog-media.json";
import { PublicHeader } from "./public-header";
import { loginUrl } from "./public-links";
import {
  deliveryLabel,
  isCompareOfferAvailable,
  rankCompareOffers,
  rankSearchOffers,
} from "./catalog-ranking";

const BUYER_ID = "00000000-0000-4000-8000-000000000030";
const BUYER_USER_ID = "00000000-0000-4000-8000-000000000500";
type SessionHandoff = SessionHandoffEnvelope;
const SESSION_KEY = "dentmarket:buyer-session";
const SEARCH_HISTORY_KEY = "dentmarket:search-history";
const LOGIN_URL = loginUrl;
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
  гутта: ["гуттаперча"],
  карпулы: ["карпула", "анестезия"],
  "перчаткии": ["перчатки"],
  "перчатки нитрил": ["перчатки нитриловые"],
  "компазит": ["композит"],
  "композитт": ["композит"],
  "гуттаперчя": ["гуттаперча"],
  "эндодонтия": ["эндо", "эндодонтический"],
  эндошка: ["эндодонтия", "эндодонтический", "эндомотор"],
};
const canonicalSearchQuery = (query: string) => {
  const normalized = query.trim().toLocaleLowerCase("ru");
  return dentalSearchAliases[normalized]?.[0] ?? query.trim();
};
const ruCount = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
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
  variantId?: string;
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
  promotion?: {
    label: string;
    percentage: number | null;
    endsAt: string | null;
  } | null;
};
type ProductVariantOption = {
  id: string;
  sku: string | null;
  gtin: string | null;
  label: string;
  attributes?: Record<string, unknown>;
};
type SearchMedia = {
  id: string;
  sourceUrl: string | null;
  securePath?: string | null;
  normalizedStorageKey: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  metadata?: {
    exactProductPhoto?: boolean;
    rightsStatus?: string;
    sourceImageUrl?: string | null;
  } | null;
};
type SearchProduct = {
  id: string;
  name: string;
  description?: string | null;
  descriptionSources?: unknown;
  brand: string | null;
  manufacturer: string | null;
  media?: SearchMedia[];
  categories: Array<{ id: string; name: string }>;
  minNormalizedPriceMinor: string | null;
  isAvailable: boolean;
  reviewSummary?: { count: number; averageRating: number | null };
  variants?: ProductVariantOption[];
  offers: SearchOffer[];
  sourceUrl?: string | null;
  sourceUpdatedAt?: string | null;
  attributes?: Array<string[]>;
  photoStatus?: string;
};
type SearchResult = {
  total: number;
  offset?: number;
  limit?: number;
  interpretedQuery?: string[];
  items: SearchProduct[];
  facets: {
    categories: Array<{ id: string; name: string; count: number }>;
    suppliers: Array<{ id: string; name: string; count: number }>;
  };
};
const publicMediaEntries = publicCatalogMedia.entries as Record<
  string,
  SearchMedia
>;
const rejectedProductAsset = (value: string | null | undefined) =>
  /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image|\/(?:themes?|templates?|assets\/icons?|images?\/icons?)\/)/i.test(
    value ?? "",
  );
const mediaSource = (media: SearchMedia | undefined) => {
  if (!media || media.metadata?.exactProductPhoto !== true) return null;
  if (
    rejectedProductAsset(
      media.metadata.sourceImageUrl ?? media.sourceUrl ?? media.securePath,
    )
  )
    return null;
  if (media.securePath?.startsWith("/catalog/")) return media.securePath;
  if (media.securePath) {
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL ??
      "https://dentmarket-api.vercel.app/api";
    return `${apiUrl}${media.securePath}`;
  }
  return media.sourceUrl;
};
const bestPromotionPercent = (product: SearchProduct) =>
  product.offers.reduce(
    (best, offer) => Math.max(best, offer.promotion?.percentage ?? 0),
    0,
  );
const priceDifferencePercent = (product: SearchProduct) => {
  const prices = product.offers
    .map((offer) => Number(offer.priceMinor ?? 0))
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((left, right) => left - right);
  if (prices.length < 2 || prices[0] === prices.at(-1)) return 0;
  return Math.round((1 - prices[0] / prices.at(-1)!) * 100);
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
const generatedCatalogFallback: SearchProduct[] =
  publicCatalogData.products.map((product) => ({
    ...product,
    media: publicMediaEntries[product.sourceUrl ?? ""]
      ? [publicMediaEntries[product.sourceUrl ?? ""]]
      : undefined,
    photoStatus: publicMediaEntries[product.sourceUrl ?? ""]
      ? "exact"
      : product.photoStatus,
    categories: [
      { id: `public-category-${product.category}`, name: product.category },
    ],
  }));
const publicCatalogFallback = [
  ...generatedCatalogFallback,
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
  displayLimit = 60,
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
    items: filtered.slice(0, displayLimit),
    facets: { categories: [], suppliers: [] },
  };
};

const catalogTextKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .trim();

const mergePrivateCatalog = (
  live: SearchResult,
  query: string,
  sort: string,
  filters: { unit?: string; packaging?: string; delivery?: string; stock?: string },
) => {
  const fallback = fallbackSearch(query, sort, filters, 60);
  // The authenticated endpoint may contain only currently published offers.
  // The clinic must still browse the same canonical catalog as a guest; live
  // offers are overlaid on matching cards when they exist.
  if (live.total >= fallback.total || fallback.total === 0) return live;
  const liveByName = new Map(live.items.map((item) => [catalogTextKey(item.name), item]));
  return {
    ...fallback,
    total: Math.max(fallback.total, live.total),
    items: fallback.items.map((item) => {
      const liveItem = liveByName.get(catalogTextKey(item.name));
      return liveItem
        ? { ...item, ...liveItem, media: liveItem.media?.length ? liveItem.media : item.media }
        : item;
    }),
    facets: live.facets?.categories?.length || live.facets?.suppliers?.length ? live.facets : fallback.facets,
  };
};

async function fetchPublicCatalogSearch(
  query: string,
  sort: string,
  params: URLSearchParams,
): Promise<SearchResult | null> {
  if (typeof window !== "undefined") {
    try {
      const saved = JSON.parse(
        window.localStorage.getItem("dentmarket:city") ?? "null",
      ) as { id?: string } | null;
      if (saved?.id) params.set("cityId", saved.id);
    } catch {
      /* legacy plain-text city selection */
    }
  }
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
  const response = await fetch(
    `${apiUrl}/catalog/search?${params.toString()}`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    },
  );
  if (!response.ok) return null;
  const result = (await response.json()) as Partial<SearchResult>;
  if (!Array.isArray(result.items) || typeof result.total !== "number")
    return null;
  return result as SearchResult;
}
type CompareOffer = {
  offerId: string;
  variantId: string;
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
  variants?: ProductVariantOption[];
  selectedVariantId?: string | null;
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
  { id: "workspace", label: "Списки и бюджеты", icon: <List24Regular /> },
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

type BuyerWorkspaceProps = {
  searchParams: Promise<{ q?: string; offset?: string }>;
};

export default function BuyerWorkspace({ searchParams: _searchParams }: BuyerWorkspaceProps) {
  // URL state is applied in an effect after hydration. Keeping the client
  // component's first render deterministic prevents Safari from leaving the
  // server markup interactive-looking but without event handlers.
  const initialQuery = "";
  const initialOffset = 0;
  const initialCatalogLimit = 60;
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
  const [query, setQuery] = useState(initialQuery);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [sort, setSort] = useState("RELEVANCE");
  const [unitFilter, setUnitFilter] = useState("");
  const [packagingFilter, setPackagingFilter] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minPriceFilter, setMinPriceFilter] = useState("");
  const [maxPriceFilter, setMaxPriceFilter] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState<SearchResult | null>(() =>
    fallbackSearch(
      initialQuery,
      "RELEVANCE",
      { stock: "all" },
      initialCatalogLimit,
    ),
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const catalogUrlAppliedRef = useRef(false);
  const returnScrollAppliedRef = useRef(false);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<SearchProduct | null>(
    null,
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
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
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reviewDrafts, setReviewDrafts] = useState<
    Record<string, { rating: number; comment: string }>
  >({});
  const [submittedReviews, setSubmittedReviews] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(SEARCH_HISTORY_KEY) ?? "[]",
      );
      if (Array.isArray(stored)) {
        setRecentSearches(
          stored.filter((item): item is string => typeof item === "string").slice(0, 6),
        );
      }
    } catch {
      // Search history is an optional convenience and must never block catalog use.
    }
  }, []);

  useEffect(() => {
    if (!handoffChecked || handoff) return;
    setSearch(
      fallbackSearch(query, sort, {
        unit: unitFilter,
        packaging: packagingFilter,
        delivery: deliveryFilter,
        stock: "all",
      }),
    );
  }, [
    deliveryFilter,
    handoff,
    handoffChecked,
    packagingFilter,
    query,
    sort,
    unitFilter,
  ]);

  const activeCart = carts.find((cart) => cart.status === "ACTIVE") ?? null;
  const buyerOrders = orders.filter(
    (order) => order.buyerOrganizationId === buyerId,
  );
  const unread = notifications.filter((item) => !item.readAt).length;
  const catalogBrands = useMemo(
    () =>
      [
        ...new Set(
          (search?.items ?? []).map((item) => item.brand).filter(Boolean),
        ),
      ].sort((left, right) => left!.localeCompare(right!, "ru")) as string[],
    [search],
  );
  const catalogCategories = useMemo(
    () =>
      [
        ...new Set(
          (search?.items ?? []).flatMap((item) =>
            item.categories.map(({ name }) => name),
          ),
        ),
      ].sort((left, right) => left.localeCompare(right, "ru")),
    [search],
  );
  const visibleProducts = useMemo(() => {
    const minimum = Number(minPriceFilter) * 100;
    const maximum = Number(maxPriceFilter) * 100;
    return (search?.items ?? []).filter((product) => {
      const offers = product.offers.filter((offer) => {
        const price = Number(offer.priceMinor ?? 0);
        if (stockFilter === "true" && !offer.available) return false;
        if (verifiedOnly && !(offer.verifiedDocuments ?? true)) return false;
        if (officialOnly && !offer.officialDistributor) return false;
        if (minPriceFilter && price < minimum) return false;
        if (maxPriceFilter && price > maximum) return false;
        return true;
      });
      if (brandFilter && product.brand !== brandFilter) return false;
      if (
        categoryFilter &&
        !product.categories.some(({ name }) => name === categoryFilter)
      )
        return false;
      if (product.offers.length === 0) {
        return !(
          stockFilter === "true" ||
          verifiedOnly ||
          officialOnly ||
          minPriceFilter ||
          maxPriceFilter
        );
      }
      return offers.length > 0;
    });
  }, [
    brandFilter,
    categoryFilter,
    maxPriceFilter,
    minPriceFilter,
    officialOnly,
    search,
    stockFilter,
    verifiedOnly,
  ]);
  const promotedProducts = useMemo(
    () =>
      (search?.items ?? [])
        .filter(
          (product) =>
            mediaSource(product.media?.[0]) &&
            product.offers.some((offer) => offer.priceMinor),
        )
        .sort((left, right) => {
          const promotionDifference =
            bestPromotionPercent(right) - bestPromotionPercent(left);
          if (promotionDifference) return promotionDifference;
          const sellerDifference = right.offers.length - left.offers.length;
          if (sellerDifference) return sellerDifference;
          return priceDifferencePercent(right) - priceDifferencePercent(left);
        })
        .slice(0, 3),
    [search],
  );
  const activeFilterCount = [
    packagingFilter,
    unitFilter,
    deliveryFilter,
    stockFilter === "true" ? "stock" : "",
    brandFilter,
    categoryFilter,
    minPriceFilter,
    maxPriceFilter,
    verifiedOnly ? "verified" : "",
    officialOnly ? "official" : "",
  ].filter(Boolean).length;
  const rankedComparisonOffers = useMemo(
    () => rankCompareOffers(comparison?.offers ?? [], supplierTrust),
    [comparison, supplierTrust],
  );

  useEffect(() => {
    if (!filtersOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [filtersOpen]);

  const buildSearchParams = useCallback(
    (nextQuery = query, nextSort = sort) => {
      const params = new URLSearchParams({
        buyerOrganizationId: buyerId,
        q: canonicalSearchQuery(nextQuery),
        sort: nextSort,
        limit: "60",
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
      if (!handoff) {
        const publicParams = new URLSearchParams({
          q: canonicalSearchQuery(nextQuery),
          sort: nextSort,
          limit: "60",
        });
        if (stockFilter === "true") publicParams.set("inStock", "true");
        if (unitFilter) publicParams.set("unit", unitFilter);
        if (packagingFilter) publicParams.set("packaging", packagingFilter);
        if (deliveryFilter) publicParams.set("deliveryMethod", deliveryFilter);
        try {
          const live = await fetchPublicCatalogSearch(
            nextQuery,
            nextSort,
            publicParams,
          );
          if (live) {
            setSearch(
              mergePrivateCatalog(live, nextQuery, nextSort, {
                unit: unitFilter,
                packaging: packagingFilter,
                delivery: deliveryFilter,
                stock: stockFilter,
              }),
            );
            return;
          }
        } catch {
          // The local catalog is the deliberate fail-safe for an unavailable API.
        }
        setSearch(
          fallbackSearch(nextQuery, nextSort, {
            unit: unitFilter,
            packaging: packagingFilter,
            delivery: deliveryFilter,
            stock: stockFilter,
          }),
        );
        return;
      }
      const params = buildSearchParams(nextQuery, nextSort);
      try {
        const live = await api.get<SearchResult>(
          `${handoff ? "/marketplace" : "/catalog"}/search?${params}`,
        );
        setSearch(
          mergePrivateCatalog(live, nextQuery, nextSort, {
            unit: unitFilter,
            packaging: packagingFilter,
            delivery: deliveryFilter,
            stock: "all",
          }),
        );
      } catch (cause) {
        setSearch(
          fallbackSearch(nextQuery, nextSort, {
            unit: unitFilter,
            packaging: packagingFilter,
            delivery: deliveryFilter,
            stock: "all",
          }),
        );
        if (handoff)
          setToast(
            "API временно недоступен — показываем полный резервный каталог",
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
        setSearch(
          fallbackSearch(
            query,
            sort,
            {
              unit: unitFilter,
              packaging: packagingFilter,
              delivery: deliveryFilter,
              stock: "all",
            },
            initialOffset ? initialCatalogLimit : undefined,
          ),
        );
        // Do not block the public catalog on a remote API cold start. If it
        // responds, loadSearch replaces the fallback with live data.
        setLoading(false);
        if (!initialOffset) void loadSearch(query, sort);
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
      setSearch(
        mergePrivateCatalog(searchResult, query, sort, {
          unit: unitFilter,
          packaging: packagingFilter,
          delivery: deliveryFilter,
          stock: "all",
        }),
      );
      setCarts(cartResult);
      setOrders(orderResult);
      setDocuments(documentResult);
      setNotifications(notificationResult);
    } catch (cause) {
      if (handoff)
        setSearch(
          fallbackSearch(query, sort, {
            unit: unitFilter,
            packaging: packagingFilter,
            delivery: deliveryFilter,
            stock: "all",
          }),
        );
      if (handoff) {
        setError(null);
        setToast("Некоторые личные данные пока недоступны — каталог загружен полностью");
      } else {
        setError(errorMessage(cause));
      }
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
    deliveryFilter,
    packagingFilter,
    query,
    sort,
    unitFilter,
    initialCatalogLimit,
    initialOffset,
  ]);

  useEffect(() => {
    if (
      !handoffChecked ||
      handoff ||
      catalogUrlAppliedRef.current ||
      typeof window === "undefined"
    )
      return;
    catalogUrlAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const urlQuery = params.get("q")?.trim() ?? "";
    const parsedOffset = Number(params.get("offset") ?? "0");
    const offset =
      Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
    if (!urlQuery && !offset) return;
    setQuery(urlQuery);
    setSearch(
      fallbackSearch(
        urlQuery,
        sort,
        { stock: "all" },
        Math.max(60, offset + 60),
      ),
    );
    if (!offset) void loadSearch(urlQuery, sort);
  }, [handoff, handoffChecked, loadSearch, sort]);

  useEffect(() => {
    if (returnScrollAppliedRef.current || typeof window === "undefined" || !search)
      return;
    const hash = window.location.hash;
    if (!hash.startsWith("#product-")) return;
    const productId = decodeURIComponent(hash.slice("#product-".length));
    const card = Array.from(
      document.querySelectorAll<HTMLElement>("[data-product-id]"),
    ).find((element) => element.dataset.productId === productId);
    if (!card) return;
    returnScrollAppliedRef.current = true;
    requestAnimationFrame(() => card.scrollIntoView({ block: "center" }));
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  }, [search]);

  const loadMoreProducts = async () => {
    const currentCount = search?.items.length ?? 0;
    setBusy("load-more");
    try {
      if (!handoff) {
        setSearch(
          fallbackSearch(
            query,
            sort,
            {
              unit: unitFilter,
              packaging: packagingFilter,
              delivery: deliveryFilter,
              stock: "all",
            },
            currentCount + 60,
          ),
        );
        return;
      }
      const params = buildSearchParams(query, sort);
      params.set("offset", String(currentCount));
      params.set("limit", "60");
      // Continue through the canonical catalog even when the authenticated
      // endpoint has fewer published offers than the catalog itself.
      setSearch(
        fallbackSearch(
          query,
          sort,
          {
            unit: unitFilter,
            packaging: packagingFilter,
            delivery: deliveryFilter,
            stock: "all",
          },
          currentCount + 60,
        ),
      );
    } catch {
      setSearch(
        fallbackSearch(
          query,
          sort,
          {
            unit: unitFilter,
            packaging: packagingFilter,
            delivery: deliveryFilter,
            stock: "all",
          },
          currentCount + 60,
        ),
      );
      setToast("Показываем следующую порцию резервного каталога");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const onCityChanged = () => {
      void loadSearch(query, sort);
    };
    window.addEventListener("dentmarket:city-changed", onCityChanged);
    return () =>
      window.removeEventListener("dentmarket:city-changed", onCityChanged);
  }, [loadSearch, query, sort]);

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
    // Refresh is the initial page bootstrap. Search and filter changes use
    // loadSearch directly and must not re-run the bootstrap with stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handoffChecked]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const submitSearchFor = async (nextQuery: string, nextSort = sort) => {
    setQuery(nextQuery);
    const normalizedNextQuery = nextQuery.trim();
    if (normalizedNextQuery) {
      setRecentSearches((current) => {
        const next = [normalizedNextQuery, ...current.filter((item) => item !== normalizedNextQuery)].slice(0, 6);
        window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    }
    setSort(nextSort);
    setBusy("search");
    setError(null);
    setComparison(null);
    setProductReviews(null);
    try {
      if (!handoff) {
        await loadSearch(nextQuery, nextSort);
        return;
      }
      await loadSearch(nextQuery, nextSort);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };
  const submitSearch = async () => submitSearchFor(query);

  const compare = async (productId: string, variantId?: string | null) => {
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
            variants: product.variants,
            selectedVariantId: variantId ?? null,
            offers: product.offers
              .filter((offer) => !variantId || offer.variantId === variantId)
              .filter((offer) => offer.priceMinor && offer.normalizedPriceMinor)
              .map((offer) => ({
                offerId: offer.id,
                variantId: offer.variantId ?? variantId ?? product.variants?.[0]?.id ?? "",
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
        `${handoff ? "/marketplace" : "/catalog"}/products/${productId}/compare?buyerOrganizationId=${buyerId}&quantity=1${variantId ? `&variantId=${encodeURIComponent(variantId)}` : ""}`,
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

  const openProduct = (product: SearchProduct) => {
    const initialVariantId =
      product.offers[0]?.variantId ?? product.variants?.[0]?.id ?? null;
    setSelectedProduct(product);
    setSelectedVariantId(initialVariantId);
    setComparison(null);
    setProductReviews(null);
    // Show the detail surface immediately. Loading supplier offers must not
    // block the product card from opening, especially for the public fallback
    // catalog where the live API may be temporarily unavailable.
    void compare(product.id, initialVariantId);
  };

  const closeProduct = () => {
    setSelectedProduct(null);
    setSelectedVariantId(null);
    setComparison(null);
    setProductReviews(null);
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

  const updateCartItemQuantity = async (itemId: string, quantity: number) => {
    if (!activeCart || quantity < 1) return;
    setBusy(`cart-item:${itemId}`);
    setError(null);
    try {
      await api.patch(`/carts/${activeCart.id}/items/${itemId}`, { quantity });
      setCarts(await api.get<Cart[]>(`/buyers/${buyerId}/carts`));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const removeCartItem = async (itemId: string) => {
    if (!activeCart) return;
    setBusy(`cart-item:${itemId}`);
    setError(null);
    try {
      await api.request(`/carts/${activeCart.id}/items/${itemId}`, {
        method: "DELETE",
      });
      setCarts(await api.get<Cart[]>(`/buyers/${buyerId}/carts`));
      setToast("Позиция удалена из корзины");
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

  const renderCatalog = (isPublic = false) => (
    <div className="mp-stack">
      {isPublic ? (
        <>
          <nav
            className={styles.categoryRail}
            aria-label="Популярные категории"
          >
            {[
              {
                label: "Расходные материалы",
                query: "расходные материалы",
                icon: <ClipboardTaskListLtr24Regular />,
              },
              {
                label: "Инструменты",
                query: "инструменты",
                icon: <List24Regular />,
              },
              {
                label: "Оборудование",
                query: "оборудование",
                icon: <Grid24Regular />,
              },
              {
                label: "Эндодонтия",
                query: "эндодонтия",
                icon: <Box24Regular />,
              },
              {
                label: "Имплантология",
                query: "импланты",
                icon: <Cart24Regular />,
              },
              {
                label: "Стерилизация",
                query: "стерилизация",
                icon: <Tag24Regular />,
              },
            ].map((item) => (
              <a
                key={item.label}
                href={`/?q=${encodeURIComponent(item.query)}`}
                onClick={(event) => {
                  event.preventDefault();
                  setQuery(item.query);
                  void submitSearchFor(item.query);
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
          {promotedProducts.length ? (
            <section
              className={styles.dealsSection}
              aria-labelledby="deals-title"
            >
              <div className={styles.dealsHeading}>
                <div>
                  <h2 id="deals-title">Акции и выгодные предложения</h2>
                  <p>Скидка относится к предложению конкретного продавца.</p>
                </div>
                <a
                  href="/?q="
                  onClick={(event) => {
                    event.preventDefault();
                    void submitSearchFor("");
                  }}
                >
                  Смотреть все
                </a>
              </div>
              <div className={styles.dealGrid}>
                {promotedProducts.map((product) => {
                  const best = rankSearchOffers(product.offers).find(
                    (offer) => offer.priceMinor,
                  );
                  const promotion = bestPromotionPercent(product);
                  const priceDifference = priceDifferencePercent(product);
                  const image = mediaSource(product.media?.[0]);
                  return (
                    <article
                      className={styles.dealCard}
                      key={`deal:${product.id}`}
                    >
                      <button
                        type="button"
                        onClick={() => void openProduct(product)}
                        aria-label={`Открыть ${product.name}`}
                      >
                        {image ? (
                          <img
                            src={image}
                            alt={product.media?.[0]?.altText ?? product.name}
                          />
                        ) : null}
                      </button>
                      <div>
                        <span className={styles.dealLabel}>
                          {promotion ? "Акция продавца" : "Выгодная цена"}
                        </span>
                        <h3>{product.name}</h3>
                        <strong>
                          {best
                            ? `от ${formatMoney(best.priceMinor, best.currency ?? "KZT")}`
                            : "Цена по запросу"}
                        </strong>
                        <small>
                          {product.offers.length}{" "}
                          {ruCount(
                            product.offers.length,
                            "продавец",
                            "продавца",
                            "продавцов",
                          )}
                        </small>
                        {promotion ? (
                          <p>У одного продавца скидка {promotion}%</p>
                        ) : priceDifference ? (
                          <p>
                            У одного продавца цена ниже на {priceDifference}%
                          </p>
                        ) : (
                          <p>Сравните цены и условия доставки</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <PageHeader
            eyebrow="B2B закупки"
            title="Закупки для стоматологии без лишних звонков"
            description="Сравнивайте цены, наличие и условия поставщиков Казахстана в одном каталоге."
          />
          <div
            className={styles.catalogProof}
            aria-label="Преимущества каталога"
          >
            <span>
              <strong>3 400+</strong>
              <small>товаров в каталоге</small>
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
        </>
      )}
      <Section>
        {!isPublic ? (
          <>
            {/** Keep cabinet search behavior and visual language aligned with the public store. */}
            <form
              id="catalog-search"
              className={styles.searchBar}
              onSubmit={(event) => {
                event.preventDefault();
                // Read the native input at submit time so autofill and keyboard
                // events are handled even before React commits the state update.
                void submitSearchFor(searchInputRef.current?.value ?? query);
              }}
            >
              <Field label="Поиск по каталогу">
                <div className={styles.searchInputShell}>
                  <Search24Regular aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    className={styles.searchInput}
                    aria-label="Поиск по каталогу"
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    onInput={(event) => {
                      const value = event.currentTarget.value;
                      setQuery(value);
                      if (!handoff) {
                        setSearch(
                          fallbackSearch(value, sort, {
                            unit: unitFilter,
                            packaging: packagingFilter,
                            delivery: deliveryFilter,
                            stock: "all",
                          }),
                        );
                      }
                    }}
                    placeholder="Найти товар, бренд, артикул или сказать по-своему"
                  />
                  {(() => {
                    const normalized = query.trim().toLocaleLowerCase("ru");
                    const pool = [
                      ...dentalSearchSuggestions,
                      ...Object.keys(dentalSearchAliases),
                      ...Object.values(dentalSearchAliases).flat(),
                      ...recentSearches,
                    ];
                    const matches = [...new Set(pool)]
                      .filter(
                        (suggestion) =>
                          normalized.length >= 2 &&
                          suggestion.toLocaleLowerCase("ru").includes(normalized) &&
                          suggestion.toLocaleLowerCase("ru") !== normalized,
                      )
                      .slice(0, 6);
                    return matches.length ? (
                      <div className={styles.searchSuggestions} role="listbox" aria-label="Подсказки поиска">
                        {matches.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            role="option"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setQuery(suggestion);
                              void submitSearchFor(suggestion);
                            }}
                          >
                            <Search24Regular aria-hidden="true" />
                            <span>{suggestion}</span>
                          </button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                </div>
              </Field>
              <Field label="Сортировка">
                <Select
                  value={sort}
                  onChange={(_, data) => setSort(data.value)}
                >
                  <option value="RELEVANCE">По релевантности</option>
                  <option value="PRICE_ASC">Сначала дешевле</option>
                  <option value="PRICE_DESC">Сначала дороже</option>
                  <option value="NAME_ASC">По названию</option>
                  <option value="UPDATED_DESC">По обновлению</option>
                </Select>
              </Field>
              <Button
                type="button"
                appearance="primary"
                onClick={() =>
                  void submitSearchFor(searchInputRef.current?.value ?? query)
                }
                icon={
                  busy === "search" ? (
                    <Spinner size="tiny" />
                  ) : (
                    <Search24Regular />
                  )
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
          </>
        ) : (
          <>
            <div className={styles.catalogToolbar}>
              <div>
                <h1 id="catalog-title">Каталог для стоматологий</h1>
                <p>
                  {search?.total ?? visibleProducts.length}{" "}
                  {ruCount(
                    search?.total ?? visibleProducts.length,
                    "товар",
                    "товара",
                    "товаров",
                  )}
                </p>
              </div>
              <div className={styles.catalogToolbarActions}>
                <Button
                  appearance="secondary"
                  icon={<Filter24Regular />}
                  onClick={() => setFiltersOpen(true)}
                >
                  Фильтры{activeFilterCount ? ` · ${activeFilterCount}` : ""}
                </Button>
                <Select
                  aria-label="Сортировка каталога"
                  value={sort}
                  onChange={(_, data) =>
                    void submitSearchFor(query, data.value)
                  }
                >
                  <option value="RELEVANCE">По популярности</option>
                  <option value="PRICE_ASC">Сначала дешевле</option>
                  <option value="PRICE_DESC">Сначала дороже</option>
                  <option value="NAME_ASC">По названию</option>
                  <option value="UPDATED_DESC">Сначала новые</option>
                </Select>
              </div>
            </div>
            {activeFilterCount ? (
              <div
                className={styles.activeFilters}
                aria-label="Выбранные фильтры"
              >
                {[
                  categoryFilter
                    ? {
                        key: "category",
                        label: categoryFilter,
                        clear: () => setCategoryFilter(""),
                      }
                    : null,
                  brandFilter
                    ? {
                        key: "brand",
                        label: brandFilter,
                        clear: () => setBrandFilter(""),
                      }
                    : null,
                  minPriceFilter
                    ? {
                        key: "min",
                        label: `от ${minPriceFilter} ₸`,
                        clear: () => setMinPriceFilter(""),
                      }
                    : null,
                  maxPriceFilter
                    ? {
                        key: "max",
                        label: `до ${maxPriceFilter} ₸`,
                        clear: () => setMaxPriceFilter(""),
                      }
                    : null,
                  deliveryFilter
                    ? {
                        key: "delivery",
                        label: "Доставка выбрана",
                        clear: () => setDeliveryFilter(""),
                      }
                    : null,
                  packagingFilter
                    ? {
                        key: "packaging",
                        label: packagingFilter,
                        clear: () => setPackagingFilter(""),
                      }
                    : null,
                  unitFilter
                    ? {
                        key: "unit",
                        label: unitFilter,
                        clear: () => setUnitFilter(""),
                      }
                    : null,
                  stockFilter === "true"
                    ? {
                        key: "stock",
                        label: "В наличии",
                        clear: () => setStockFilter("all"),
                      }
                    : null,
                  verifiedOnly
                    ? {
                        key: "verified",
                        label: "Документы проверены",
                        clear: () => setVerifiedOnly(false),
                      }
                    : null,
                  officialOnly
                    ? {
                        key: "official",
                        label: "Официальный продавец",
                        clear: () => setOfficialOnly(false),
                      }
                    : null,
                ]
                  .filter(
                    (
                      item,
                    ): item is {
                      key: string;
                      label: string;
                      clear: () => void;
                    } => Boolean(item),
                  )
                  .map((item) => (
                    <button key={item.key} type="button" onClick={item.clear}>
                      {item.label}
                      <Dismiss24Regular aria-hidden="true" />
                    </button>
                  ))}
                <button
                  className={styles.clearFilters}
                  type="button"
                  onClick={() => {
                    setBrandFilter("");
                    setCategoryFilter("");
                    setMinPriceFilter("");
                    setMaxPriceFilter("");
                    setVerifiedOnly(false);
                    setOfficialOnly(false);
                    setUnitFilter("");
                    setPackagingFilter("");
                    setDeliveryFilter("");
                    setStockFilter("all");
                  }}
                >
                  Сбросить всё
                </button>
              </div>
            ) : null}
          </>
        )}
        {!isPublic ? (
          <details className={styles.advancedFilters}>
            <summary>
              Уточнить поиск{" "}
              <span>бренд, категория, цена, документы и доставка</span>
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
              <Field label="Бренд">
                <Select
                  value={brandFilter}
                  onChange={(_, data) => setBrandFilter(data.value)}
                >
                  <option value="">Все бренды</option>
                  {catalogBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Категория">
                <Select
                  value={categoryFilter}
                  onChange={(_, data) => setCategoryFilter(data.value)}
                >
                  <option value="">Все категории</option>
                  {catalogCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Цена от, ₸">
                <Input
                  type="number"
                  min="0"
                  value={minPriceFilter}
                  onChange={(_, data) => setMinPriceFilter(data.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Цена до, ₸">
                <Input
                  type="number"
                  min="0"
                  value={maxPriceFilter}
                  onChange={(_, data) => setMaxPriceFilter(data.value)}
                  placeholder="без лимита"
                />
              </Field>
              <Checkbox
                checked={verifiedOnly}
                onChange={(_, data) => setVerifiedOnly(Boolean(data.checked))}
                label="Только с проверенными документами"
              />
              <Checkbox
                checked={officialOnly}
                onChange={(_, data) => setOfficialOnly(Boolean(data.checked))}
                label="Только официальные дистрибьюторы"
              />
              <Button
                appearance="subtle"
                onClick={() => {
                  setBrandFilter("");
                  setCategoryFilter("");
                  setMinPriceFilter("");
                  setMaxPriceFilter("");
                  setVerifiedOnly(false);
                  setOfficialOnly(false);
                  setUnitFilter("");
                  setPackagingFilter("");
                  setDeliveryFilter("");
                  setStockFilter("true");
                }}
              >
                Сбросить фильтры
              </Button>
            </div>
          </details>
        ) : null}
        {!isPublic ? (
          <div className={styles.resultsMeta}>
            <span>
              {visibleProducts.length}
              {search && search.total > visibleProducts.length
                ? ` из ${search.total}`
                : ""}{" "}
              {ruCount(
                search?.total ?? visibleProducts.length,
                "товар",
                "товара",
                "товаров",
              )}{" "}
              по запросу
            </span>
            <span>
              {search?.interpretedQuery?.length
                ? `Поняли как: ${search.interpretedQuery.join(", ")}`
                : "Ищите по названию, бренду или артикулу"}
            </span>
          </div>
        ) : null}
        {loading && isPublic ? (
          <LoadingState label="Загружаем предложения" />
        ) : !visibleProducts.length ? (
          <EmptyState
            icon={<Search24Regular />}
            title="Ничего не найдено"
            description="Попробуйте другое название, бренд или артикул."
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
            {visibleProducts.map((product) => {
              const ranked = rankSearchOffers(product.offers);
              const best = ranked.find((offer) => offer.priceMinor);
              const eligibleOffers = ranked.filter(
                (offer) =>
                  offer.available &&
                  (offer.verifiedDocuments ?? true) &&
                  offer.confirmationMode !== "MANUAL",
              );
              const normalizedPrice = best?.normalizedPriceMinor;
              const productImage = mediaSource(product.media?.[0]);
              const promotion = bestPromotionPercent(product);
              const priceDifference = priceDifferencePercent(product);
              const productIndex = search?.items.findIndex(
                (item) => item.id === product.id,
              ) ?? 0;
              const returnTo = `/?q=${encodeURIComponent(query)}&offset=${Math.max(0, Math.floor(productIndex / 60) * 60)}#product-${encodeURIComponent(product.id)}`;
              return (
                <article
                  className={styles.product}
                  key={product.id}
                  data-testid="product-card"
                  data-product-id={product.id}
                >
                  <a
                    className={styles.productCardSurface}
                    href={`/products/${encodeURIComponent(product.id)}?returnTo=${encodeURIComponent(returnTo)}`}
                    aria-label={`Открыть карточку ${product.name}`}
                  >
                    <div className={styles.productVisual}>
                      {productImage ? (
                        <img
                          src={productImage}
                          alt={product.media?.[0]?.altText ?? product.name}
                          loading="lazy"
                          draggable={false}
                          onContextMenu={(event) => event.preventDefault()}
                        />
                      ) : (
                        <span className={styles.photoPending}>
                          Фото
                          <br />
                          добавляем
                        </span>
                      )}
                    </div>
                    <div className={styles.productIdentity}>
                      <span className={styles.category}>
                        {isPublic
                          ? (product.brand ??
                            product.categories[0]?.name ??
                            "DentMarket")
                          : (product.categories[0]?.name ?? "Стоматология")}
                      </span>
                      <h3>{product.name}</h3>
                      {!isPublic ? (
                        <p>
                          {[
                            ...new Set(
                              [product.brand, product.manufacturer].filter(
                                Boolean,
                              ),
                            ),
                          ].join(" · ") ||
                            (product.sourceUrl
                              ? "Карточка DentMarket"
                              : best?.verifiedDocuments === false
                                ? "Внешний каталог · поставщик не верифицирован"
                                : "Проверенная карточка каталога")}
                        </p>
                      ) : null}
                      {product.reviewSummary?.count ? (
                        <small className={styles.reviewSummary}>
                          <Star16Filled aria-hidden="true" />
                          {product.reviewSummary.averageRating?.toFixed(
                            1,
                          )} · {product.reviewSummary.count}{" "}
                          {ruCount(
                            product.reviewSummary.count,
                            "отзыв",
                            "отзыва",
                            "отзывов",
                          )}
                        </small>
                      ) : (
                        <small className={styles.reviewSummaryMuted}>
                          Пока без отзывов
                        </small>
                      )}
                    </div>
                    <div className={styles.offerSummary}>
                      <strong>
                        {best
                          ? `от ${formatMoney(best.priceMinor, best.currency ?? "KZT")}`
                          : "Цена по запросу"}
                      </strong>
                      {normalizedPrice ? (
                        <span>
                          от{" "}
                          {formatMoney(
                            normalizedPrice,
                            best?.currency ?? "KZT",
                          )}{" "}
                          за {best?.packaging.unit ?? "ед."}
                        </span>
                      ) : null}
                      {isPublic ? (
                        <span>
                          {product.offers.length
                            ? `${product.offers.length} ${ruCount(
                                product.offers.length,
                                "продавец",
                                "продавца",
                                "продавцов",
                              )}`
                            : "Пока нет предложений"}
                        </span>
                      ) : (
                        <span>
                          {product.offers.length}{" "}
                          {ruCount(
                            product.offers.length,
                            "предложение",
                            "предложения",
                            "предложений",
                          )}{" "}
                          · {eligibleOffers.length}{" "}
                          {ruCount(
                            eligibleOffers.length,
                            "готово",
                            "готовы",
                            "готовы",
                          )}{" "}
                          к заказу
                        </span>
                      )}
                      {best ? (
                        <small className={styles.deliveryHint}>
                          {deliveryLabel(best.deliveryMethods)}
                        </small>
                      ) : null}
                      {isPublic && promotion ? (
                        <small className={styles.dealLine}>
                          У одного продавца скидка {promotion}%
                        </small>
                      ) : isPublic && priceDifference ? (
                        <small className={styles.dealLine}>
                          Цена у продавцов отличается на {priceDifference}%
                        </small>
                      ) : null}
                    </div>
                  </a>
                  <div className={styles.productActions}>
                    {(() => {
                      const cartOffer = eligibleOffers[0] ??
                        (isPublic && product.offers.length === 1
                          ? product.offers[0]
                          : undefined);
                      return cartOffer ? (
                        <Button
                          appearance="primary"
                          icon={<Cart24Regular />}
                          onClick={(event) => {
                            event.stopPropagation();
                            void addToCart(cartOffer.id);
                          }}
                          disabled={
                            busy === `cart:${cartOffer.id}` ||
                            (!isPublic &&
                              (!cartOffer.available ||
                                cartOffer.verifiedDocuments === false))
                          }
                        >
                          {busy === `cart:${cartOffer.id}`
                            ? "Добавляем"
                            : "В корзину"}
                        </Button>
                      ) : null;
                    })()}
                    <Button
                      appearance="secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        openProduct(product);
                      }}
                      disabled={busy === `compare:${product.id}`}
                    >
                      {busy === `compare:${product.id}`
                        ? "Загрузка"
                        : isPublic
                          ? product.offers.length > 1
                            ? "Сравнить цены"
                            : product.offers.length === 1
                              ? "Смотреть предложение"
                              : "Открыть карточку"
                          : product.offers.length === 1
                            ? "Смотреть предложение"
                            : `Смотреть ${product.offers.length} ${ruCount(product.offers.length, "предложение", "предложения", "предложений")}`}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {search && search.total > search.items.length ? (
          <div className={styles.loadMore}>
            <a
              className={styles.loadMoreLink}
              href={`/?q=${encodeURIComponent(query)}&offset=${search.items.length}`}
              onClick={(event) => {
                event.preventDefault();
                void loadMoreProducts();
              }}
            >
              {busy === "load-more" ? "Загружаем…" : "Показать ещё 60 товаров"}
            </a>
            <small>
              Показано {search.items.length} из {search.total}
            </small>
          </div>
        ) : null}
      </Section>
      {isPublic && filtersOpen ? (
        <div
          className={styles.filterBackdrop}
          role="presentation"
          onClick={() => setFiltersOpen(false)}
        >
          <aside
            className={styles.filterDrawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id="filter-title">Фильтры</h2>
                <p>Показываем условия для выбранного города.</p>
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                aria-label="Закрыть фильтры"
              >
                <Dismiss24Regular />
              </button>
            </header>
            <div className={styles.filterDrawerBody}>
              <Field label="Категория">
                <Select
                  value={categoryFilter}
                  onChange={(_, data) => setCategoryFilter(data.value)}
                >
                  <option value="">Все категории</option>
                  {catalogCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Бренд">
                <Select
                  value={brandFilter}
                  onChange={(_, data) => setBrandFilter(data.value)}
                >
                  <option value="">Все бренды</option>
                  {catalogBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className={styles.filterPriceRange}>
                <Field label="Цена от, ₸">
                  <Input
                    type="number"
                    min="0"
                    value={minPriceFilter}
                    onChange={(_, data) => setMinPriceFilter(data.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="Цена до, ₸">
                  <Input
                    type="number"
                    min="0"
                    value={maxPriceFilter}
                    onChange={(_, data) => setMaxPriceFilter(data.value)}
                    placeholder="без лимита"
                  />
                </Field>
              </div>
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
              <div className={styles.filterChecks}>
                <Checkbox
                  checked={stockFilter === "true"}
                  onChange={(_, data) =>
                    setStockFilter(data.checked ? "true" : "all")
                  }
                  label="Только в наличии"
                />
                <Checkbox
                  checked={verifiedOnly}
                  onChange={(_, data) => setVerifiedOnly(Boolean(data.checked))}
                  label="Документы проверены"
                />
                <Checkbox
                  checked={officialOnly}
                  onChange={(_, data) => setOfficialOnly(Boolean(data.checked))}
                  label="Официальный дистрибьютор"
                />
              </div>
            </div>
            <footer>
              <Button
                appearance="subtle"
                onClick={() => {
                  setBrandFilter("");
                  setCategoryFilter("");
                  setMinPriceFilter("");
                  setMaxPriceFilter("");
                  setVerifiedOnly(false);
                  setOfficialOnly(false);
                  setUnitFilter("");
                  setPackagingFilter("");
                  setDeliveryFilter("");
                  setStockFilter("all");
                }}
              >
                Сбросить
              </Button>
              <Button
                appearance="primary"
                onClick={() => {
                  setFiltersOpen(false);
                  void submitSearchFor(query);
                }}
              >
                Показать {visibleProducts.length}
              </Button>
            </footer>
          </aside>
        </div>
      ) : null}
      {selectedProduct ? (
        <div
          className={styles.productModalBackdrop}
          role="presentation"
          onClick={closeProduct}
        >
          <section
            className={styles.productModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.productModalHeader}>
              <div>
                <span className={styles.category}>
                  {selectedProduct.categories[0]?.name ?? "Стоматология"}
                </span>
                <h2 id="product-detail-title">{selectedProduct.name}</h2>
                <p>
                  {[
                    ...new Set(
                      [
                        selectedProduct.brand,
                        selectedProduct.manufacturer,
                      ].filter(Boolean),
                    ),
                  ].join(" · ")}
                </p>
              </div>
              <Button
                appearance="subtle"
                onClick={closeProduct}
                aria-label="Закрыть карточку"
              >
                Закрыть
              </Button>
            </header>
            <div className={styles.productModalBody}>
              <div
                className={styles.productModalVisual}
                onContextMenu={(event) => event.preventDefault()}
              >
                {mediaSource(selectedProduct.media?.[0]) ? (
                  <img
                    src={mediaSource(selectedProduct.media?.[0])!}
                    alt={
                      selectedProduct.media?.[0]?.altText ??
                      selectedProduct.name
                    }
                    draggable={false}
                  />
                ) : (
                  <div className={styles.productModalPhotoPending}>
                    Ищем точное фото товара
                  </div>
                )}
                <small>
                  {mediaSource(selectedProduct.media?.[0])
                    ? "Фото товара"
                    : "Покажем фото только после проверки модели"}
                </small>
              </div>
              <div className={styles.productInfo}>
                {selectedProduct.variants && selectedProduct.variants.length > 1 ? (
                  <div className={styles.variantPicker}>
                    <div>
                      <span className={styles.category}>Вариант товара</span>
                      <strong>Выберите точную фасовку или REF</strong>
                    </div>
                    <select
                      value={selectedVariantId ?? ""}
                      onChange={(event) => {
                        const variantId = event.target.value;
                        setSelectedVariantId(variantId);
                        setComparison(null);
                        void compare(selectedProduct.id, variantId);
                      }}
                      aria-label="Выберите вариант товара"
                    >
                      {selectedProduct.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className={styles.productModalCopy}>
                  <h3>О товаре</h3>
                  <p>
                    {selectedProduct.description ||
                      "Проверяем состав и характеристики товара."}
                  </p>
                  <small>
                    Описание проверено DentMarket. Цену, наличие и доставку
                    указывает продавец.
                  </small>
                  {selectedProduct.attributes?.length ? (
                    <dl className={styles.productAttributes}>
                      {selectedProduct.attributes.map(([label, value]) => (
                        <div key={`${label}-${value}`}>
                          <dt>{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {selectedProduct.sourceUrl ? (
                    <a
                      className={styles.productSourceLink}
                      href={selectedProduct.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Открыть подтверждение ↗
                    </a>
                  ) : null}
                </div>
                <aside
                  className={styles.productFacts}
                  aria-label="Сводка по товару"
                >
                  <span>
                    <strong>{comparison?.offers.length ?? selectedProduct.offers.length}</strong>
                    <small>
                      {ruCount(
                        comparison?.offers.length ?? selectedProduct.offers.length,
                        "предложение",
                        "предложения",
                        "предложений",
                      )}
                    </small>
                  </span>
                  <span>
                    <strong>
                      {selectedProduct.reviewSummary?.averageRating?.toFixed(
                        1,
                      ) ?? "Нет оценок"}
                    </strong>
                    <small>
                      {selectedProduct.reviewSummary?.count ?? 0}{" "}
                      {ruCount(
                        selectedProduct.reviewSummary?.count ?? 0,
                        "отзыв",
                        "отзыва",
                        "отзывов",
                      )}{" "}
                      клиник
                    </small>
                  </span>
                  <span>
                    <strong>
                      {
                        selectedProduct.offers.filter(
                          (offer) =>
                            offer.available &&
                            (offer.verifiedDocuments ?? true),
                        ).length
                      }
                    </strong>
                    <small>готовы к заказу</small>
                  </span>
                </aside>
              </div>
              <section
                className={styles.sellerSection}
                aria-labelledby="seller-list-title"
              >
                <div className={styles.sellerSectionHeader}>
                  <div>
                    <span className={styles.category}>
                      Предложения поставщиков
                    </span>
                    <h3 id="seller-list-title">Выберите продавца</h3>
                    <p>
                      Порядок учитывает наличие, проверку документов, доставку и
                      итоговую цену.
                    </p>
                  </div>
                  <span className={styles.rankingNote}>
                    Цена указана за фасовку
                  </span>
                </div>
                {busy === `compare:${selectedProduct.id}` && !comparison ? (
                  <LoadingState label="Собираем предложения поставщиков" />
                ) : !rankedComparisonOffers.length ? (
                  <EmptyState
                    icon={<ShoppingBag24Regular />}
                    title="Предложения уточняются"
                    description="Оставьте товар открытым или повторите поиск позже."
                  />
                ) : (
                  <div className={styles.sellerList}>
                    <div className={styles.sellerListHead} aria-hidden="true">
                      <span>Поставщик</span>
                      <span>Цена</span>
                      <span>Доставка и наличие</span>
                      <span>Надёжность</span>
                      <span />
                    </div>
                    {rankedComparisonOffers.map((offer, index) => {
                      const available = isCompareOfferAvailable(offer);
                      const trustScore =
                        supplierTrust[offer.supplier.organizationId]?.score;
                      const recommended =
                        index === 0 &&
                        available &&
                        offer.markers.verifiedDocuments;
                      const deliveryMethods = offer.delivery.map(
                        ({ method }) => method,
                      );
                      const leadTime = offer.delivery.find(
                        ({ maxLeadTimeHours }) => maxLeadTimeHours != null,
                      )?.maxLeadTimeHours;
                      return (
                        <article
                          className={
                            recommended
                              ? styles.sellerRowRecommended
                              : styles.sellerRow
                          }
                          key={offer.offerId}
                        >
                          <div className={styles.sellerIdentity}>
                            <div className={styles.sellerNameLine}>
                              <strong>{offer.supplier.name}</strong>
                              {recommended ? (
                                <span className={styles.recommendedBadge}>
                                  Рекомендуем
                                </span>
                              ) : null}
                            </div>
                            {offer.supplierSku ? (
                              <small>Артикул {offer.supplierSku}</small>
                            ) : null}
                            <div className={styles.sellerMarkers}>
                              {offer.markers.verifiedDocuments ? (
                                <StatusTag tone="success">
                                  Документы проверены
                                </StatusTag>
                              ) : (
                                <StatusTag tone="warning">
                                  Документы на проверке
                                </StatusTag>
                              )}
                              {offer.markers.officialDistributor ? (
                                <StatusTag tone="info">
                                  Официальный дистрибьютор
                                </StatusTag>
                              ) : null}
                              {offer.markers.supplierWarranty ? (
                                <StatusTag tone="neutral">Гарантия</StatusTag>
                              ) : null}
                            </div>
                          </div>
                          <div className={styles.sellerPrice}>
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
                            <small>{offer.packaging.name}</small>
                          </div>
                          <div className={styles.sellerDelivery}>
                            <strong
                              className={
                                available
                                  ? styles.availableText
                                  : styles.pendingText
                              }
                            >
                              {available
                                ? "В наличии"
                                : "Требует подтверждения"}
                            </strong>
                            <span>{deliveryLabel(deliveryMethods)}</span>
                            {leadTime != null ? (
                              <small>до {Math.ceil(leadTime / 24)} дн.</small>
                            ) : null}
                          </div>
                          <div className={styles.sellerTrust}>
                            <strong>
                              {trustScore != null
                                ? `${Number(trustScore).toFixed(0)}/100`
                                : "Нет истории"}
                            </strong>
                            <small>
                              {offer.markers.verifiedDocuments
                                ? "Документы актуальны"
                                : "Документы проверяются"}
                            </small>
                          </div>
                          <Button
                            appearance={recommended ? "primary" : "secondary"}
                            icon={<Cart24Regular />}
                            onClick={() => void addToCart(offer.offerId)}
                            disabled={
                              busy === `cart:${offer.offerId}` ||
                              !available ||
                              !offer.markers.verifiedDocuments
                            }
                          >
                            {!available || !offer.markers.verifiedDocuments
                              ? "Недоступно"
                              : "В корзину"}
                          </Button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
              <section className={styles.productReviews}>
                <h4>Отзывы клиник</h4>
                {!productReviews?.reviews.length ? (
                  <p>
                    Подтверждённых отзывов пока нет. Они появляются после
                    реальных заказов.
                  </p>
                ) : (
                  productReviews.reviews.slice(0, 5).map((review) => (
                    <article key={review.id}>
                      <strong>{review.overallRating} ★</strong>
                      <span>{review.comment || "Оценка без комментария"}</span>
                      {review.officialResponse ? (
                        <small>
                          Ответ поставщика: {review.officialResponse}
                        </small>
                      ) : null}
                    </article>
                  ))
                )}
              </section>
            </div>
          </section>
        </div>
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
                    <td>
                      <div className={styles.quantityControl}>
                        <Button
                          appearance="subtle"
                          size="small"
                          onClick={() =>
                            void updateCartItemQuantity(
                              item.id,
                              Math.max(1, Number(item.quantity) - 1),
                            )
                          }
                          disabled={
                            Number(item.quantity) <= 1 ||
                            busy === `cart-item:${item.id}`
                          }
                          aria-label="Уменьшить количество"
                        >
                          −
                        </Button>
                        <strong>{item.quantity}</strong>
                        <Button
                          appearance="subtle"
                          size="small"
                          onClick={() =>
                            void updateCartItemQuantity(
                              item.id,
                              Number(item.quantity) + 1,
                            )
                          }
                          disabled={busy === `cart-item:${item.id}`}
                          aria-label="Увеличить количество"
                        >
                          +
                        </Button>
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<Dismiss24Regular />}
                          onClick={() => void removeCartItem(item.id)}
                          disabled={busy === `cart-item:${item.id}`}
                          aria-label="Удалить позицию"
                        />
                      </div>
                    </td>
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
        description="После оформления корзина автоматически разделится на заказы поставщикам."
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
                                  <option value="5">5, отлично</option>
                                  <option value="4">4, хорошо</option>
                                  <option value="3">3, нормально</option>
                                  <option value="2">2, плохо</option>
                                  <option value="1">1, очень плохо</option>
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
        eyebrow="Документы заказа"
        title="Документы"
        description="Счета, спецификации, накладные и подписанные версии хранятся вместе с заказом."
      />
      <Section>
        {!documents.length ? (
          <EmptyState
            icon={<Document24Regular />}
            title="Документов пока нет"
            description="Документы появятся здесь после оформления заказа."
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
        <PublicHeader
          active="catalog"
          query={query}
          recentSearches={recentSearches}
          searching={busy === "search"}
          onQueryChange={(value) => {
            setQuery(value);
            if (!value.trim()) {
              void submitSearchFor("");
              return;
            }
            setSearch(
              fallbackSearch(value, sort, {
                unit: unitFilter,
                packaging: packagingFilter,
                delivery: deliveryFilter,
                stock: "all",
              }),
            );
          }}
          onSearch={(value) => void submitSearchFor(value ?? query)}
        />
        <main className={styles.publicMain} id="catalog">
          {renderCatalog(true)}
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
      contextLabel={
        active === "smart-commerce"
          ? "Рекомендации по городу"
          : active === "assistant"
            ? "AI-помощник"
            : active === "support"
              ? "Поддержка"
              : undefined
      }
      onLogout={handoff ? () => void logout() : undefined}
      onNavigate={(item) => {
        if (!handoff && item !== "catalog") window.location.assign(LOGIN_URL);
        else setActive(item);
      }}
      actions={
        handoff ? (
          <>
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Button appearance="subtle" icon={<MoreHorizontal24Regular />}>
                  Сервисы
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem
                    icon={<Location24Regular />}
                    onClick={() => setActive("smart-commerce")}
                  >
                    Рекомендации по городу
                  </MenuItem>
                  <MenuItem
                    icon={<Bot24Regular />}
                    onClick={() => setActive("assistant")}
                  >
                    AI-помощник
                  </MenuItem>
                  <MenuItem
                    icon={<PersonSupport24Regular />}
                    onClick={() => setActive("support")}
                  >
                    Поддержка
                  </MenuItem>
                  <MenuItem onClick={() => window.location.assign("/about")}>
                    О DentMarket
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
            <Button
              appearance="subtle"
              icon={<ArrowSync24Regular />}
              onClick={() => void refresh()}
              aria-label="Обновить данные"
            />
          </>
        ) : (
          <Button
            appearance="primary"
            onClick={() => window.location.assign(LOGIN_URL)}
          >
            Войти
          </Button>
        )
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
