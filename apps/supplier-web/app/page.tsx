"use client";

import {
  Button,
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
  ArrowSync24Regular,
  Box24Regular,
  BuildingShop24Regular,
  CheckmarkCircle24Regular,
  ClipboardTaskListLtr24Regular,
  CloudArrowUp24Regular,
  DataTrending24Regular,
  Document24Regular,
  Money24Regular,
  MoreHorizontal24Regular,
  PlugConnected24Regular,
  ShieldCheckmark24Regular,
  Warning24Regular,
  Star24Regular,
} from "@fluentui/react-icons";
import { MarketplaceApiClient, parseSessionHandoff, type ApiContext, type SessionHandoffEnvelope } from "@marketplace/api-client";
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
import { PromotionsPanel } from "./promotions-panel";
import { SupplierTrustPanel } from "./supplier-trust-panel";
import { OnboardingProgress } from "./onboarding-progress";
import { ConnectorOnboarding } from "./connector-onboarding";

const OPERATOR_ID = "00000000-0000-4000-8000-000000000002";
const OPERATOR_ORG_ID = "00000000-0000-4000-8000-000000000001";
type SessionHandoff = SessionHandoffEnvelope;
const SESSION_KEY = "dentmarket:supplier-session";

function readSessionHandoff(): SessionHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.location.hash.startsWith("#session=") ? decodeURIComponent(window.location.hash.slice("#session=".length)) : window.sessionStorage.getItem(SESSION_KEY);
    if (!serialized) return null;
    return parseSessionHandoff(serialized, "SUPPLIER");
  } catch { return null; }
}
const suppliers = [
  {
    id: "00000000-0000-4000-8000-000000000020",
    name: "Demo Dental Supply",
    city: "Алматы",
  },
  {
    id: "00000000-0000-4000-8000-000000000025",
    name: "Ortho Trade KZ",
    city: "Астана",
  },
  {
    id: "00000000-0000-4000-8000-000000000060",
    name: "MedConsum",
    city: "Шымкент",
  },
  {
    id: "00000000-0000-4000-8000-000000000070",
    name: "TechDent Systems",
    city: "Алматы",
  },
  {
    id: "00000000-0000-4000-8000-000000000080",
    name: "SterileLine",
    city: "Караганда",
  },
];

type Offer = {
  id: string;
  supplierSku: string | null;
  status: string;
  sourceType: string;
  confirmationMode: string;
  productVariantId: string;
  productVariant: { product: { canonicalName: string } };
  packaging: {
    name: string;
    quantityInBaseUnit: string;
    unit: { symbol: string };
  } | null;
  publication: {
    status: string;
    marketplaceVisible: boolean;
    blockedReason: string | null;
  } | null;
  prices: Array<{
    id: string;
    amountMinor: string;
    currency: string;
    status: string;
    freshnessExpiresAt: string | null;
  }>;
  inventoryBalances: Array<{
    id: string;
    quantityAvailable: string;
    freshnessStatus: string;
    warehouse: { name: string };
  }>;
};
type Balance = {
  id: string;
  warehouseId: string;
  productVariantId: string;
  offerId: string | null;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  safetyStock: string;
  availabilityStatus: string;
  freshnessStatus: string;
  freshnessExpiresAt: string | null;
  source: string;
  updatedAt: string;
  warehouse: { name: string; code: string };
  productVariant: { product: { canonicalName: string } };
  lots: Array<{
    id: string;
    lotNumber: string;
    expirationDate: string | null;
    quantityAvailable: string;
    status: string;
  }>;
};
type Order = {
  id: string;
  supplierOrganizationId: string;
  orderNumber: string;
  status: string;
  subtotalAmountMinor: string;
  currency: string;
  createdAt: string;
  buyer: { displayName: string };
  items: Array<{
    id: string;
    quantity: string;
    acceptedQuantity: string | null;
    status: string;
    offer: { productVariant: { product: { canonicalName: string } } };
  }>;
};
type Integration = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  displayName: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  bindings: unknown[];
  _count: { jobs: number; reconciliationEntries: number };
};
type Credential = {
  id: string;
  type: string;
  number: string;
  status: string;
  issuer: string | null;
  validTo: string | null;
  rejectionReason: string | null;
};
type ComplianceCheck = {
  id: string;
  sellerOrganizationId: string;
  status: string;
  riskLevel: string;
  decision: string;
  evaluatedAt: string;
  reason: string | null;
  offer?: { productVariant?: { product?: { canonicalName?: string } } } | null;
};
type DocumentRecord = {
  id: string;
  title: string;
  kind: string;
  format: string;
  status: string;
  documentNumber: string | null;
  createdAt: string;
};
type MerchantAccount = {
  id: string;
  onboardingStatus: string;
  verificationStatus: string;
  payoutStatus: string;
  externalMerchantId: string | null;
  provider: { name: string; code: string };
};
type FreshnessPolicy = {
  id: string;
  source: string;
  dataType: string;
  staleAfterMinutes: number;
  expirationBehavior: string;
  confirmationRequired: boolean;
  status: string;
};
type DataOverride = {
  id: string;
  target: string;
  mode: string;
  status: string;
  reason: string;
  createdAt: string;
  validUntil: string | null;
};
type SupplierDataSource = { id: string; name: string; type: string; status: string };
type ImportBatch = {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  extractionMetadata?: { method?: string; warnings?: string[]; textCharacters?: number } | null;
  createdAt: string;
  source: { name: string };
  _count?: { rows: number };
};
type ExternalCatalogItem = {
  id: string;
  name: string;
  supplierSku: string | null;
  matchedVariantId: string | null;
  matchedVariant?: { product: { canonicalName: string } } | null;
  productCandidate?: { id: string; status: string } | null;
  matchCandidates: Array<{ score: string; reasons: string[]; status: string; productVariant: { id: string; product: { canonicalName: string; brand?: { name: string } | null; manufacturer?: { name: string } | null } } }>;
};

const navigation: NavigationItem[] = [
  { id: "dashboard", label: "Обзор", icon: <DataTrending24Regular /> },
  { id: "orders", label: "Заказы", icon: <ClipboardTaskListLtr24Regular /> },
  { id: "offers", label: "Предложения", icon: <BuildingShop24Regular /> },
  { id: "inventory", label: "Остатки", icon: <Box24Regular /> },
  { id: "integrations", label: "Интеграции", icon: <PlugConnected24Regular /> },
  { id: "documents", label: "Документы", icon: <Document24Regular /> },
];

const statusTone = (
  status: string,
): "success" | "warning" | "danger" | "info" | "neutral" => {
  if (
    [
      "ACTIVE",
      "PUBLISHED",
      "FRESH",
      "VERIFIED",
      "READY",
      "PASSED",
      "ALLOWED",
      "CONFIRMED",
      "SIGNED",
      "GENERATED",
    ].includes(status)
  )
    return "success";
  if (
    [
      "FAILED",
      "BLOCKED",
      "REJECTED",
      "REVOKED",
      "EXPIRED",
      "DEAD",
      "CANCELLED",
    ].includes(status)
  )
    return "danger";
  if (
    [
      "PENDING",
      "AWAITING_CONFIRMATION",
      "STALE",
      "UNDER_REVIEW",
      "REVIEW_REQUIRED",
      "UNKNOWN",
    ].includes(status)
  )
    return "warning";
  return "info";
};

const integrationProviderLabel: Record<string, string> = {
  ONE_C: "1С",
  MOYSKLAD: "МойСклад",
  MOCK: "Тестовое подключение",
};
const integrationModeLabel: Record<string, string> = {
  AGENT: "локальный модуль",
  API: "прямое подключение",
  HYBRID: "комбинированный режим",
};
const credentialTypeLabel: Record<string, string> = {
  REGISTRATION_CERTIFICATE: "Регистрационное удостоверение",
  WHOLESALE_LICENSE: "Лицензия на оптовую торговлю",
  QUALITY_CERTIFICATE: "Сертификат качества",
  DISTRIBUTOR_AUTHORIZATION: "Разрешение дистрибьютора",
  MEDICAL_DEVICE_SALE_NOTIFICATION: "Уведомление о реализации медизделий",
};

export default function SupplierWorkspace() {
  const [handoff, setHandoff] = useState<SessionHandoff | null>(null);
  const [handoffChecked, setHandoffChecked] = useState(false);
  const apiContext = useMemo<ApiContext>(() => handoff?.accessToken ? { accessToken: handoff.accessToken } : handoff?.actorId && handoff.organizationId ? { actorId: handoff.actorId, organizationId: handoff.organizationId } : { actorId: OPERATOR_ID, organizationId: OPERATOR_ORG_ID }, [handoff]);
  const api = useMemo(() => new MarketplaceApiClient(process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api", apiContext), [apiContext]);
  const [supplierId, setSupplierId] = useState(suppliers[0].id);
  const [active, setActive] = useState("dashboard");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [merchantAccounts, setMerchantAccounts] = useState<MerchantAccount[]>(
    [],
  );
  const [policies, setPolicies] = useState<FreshnessPolicy[]>([]);
  const [overrides, setOverrides] = useState<DataOverride[]>([]);
  const [dataSources, setDataSources] = useState<SupplierDataSource[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [externalItems, setExternalItems] = useState<ExternalCatalogItem[]>([]);
  const [priceListFile, setPriceListFile] = useState<File | null>(null);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [quantityDrafts, setQuantityDrafts] = useState<Record<string, string>>(
    {},
  );
  const [credentialType, setCredentialType] = useState(
    "REGISTRATION_CERTIFICATE",
  );
  const [credentialNumber, setCredentialNumber] = useState("");
  const [credentialFile, setCredentialFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void (async () => { const next = readSessionHandoff(); if (!next?.organizationId) { setHandoffChecked(true); return; } let resolved = next; if (next.handoffCode && !next.accessToken) { const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api"}/auth/handoff/exchange`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handoffCode: next.handoffCode }) }); if (!response.ok) { setHandoffChecked(true); return; } const session = await response.json() as { accessToken?: string; user?: { id: string; displayName: string }; organizationId?: string; capability?: string }; resolved = { ...next, ...session, actorId: session.user?.id }; } setHandoff(resolved); setSupplierId(resolved.organizationId!); window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(resolved)); window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); setHandoffChecked(true); })();
  }, []);

  const availableSuppliers = useMemo(() => handoff?.organizationId ? [{ id: handoff.organizationId, name: handoff.organizationDisplayName || "Новая организация", city: "География не настроена" }] : suppliers, [handoff]);
  const supplier = availableSuppliers.find((item) => item.id === supplierId) ?? availableSuppliers[0];
  const supplierOrders = orders.filter(
    (order) => order.supplierOrganizationId === supplierId,
  );
  const supplierChecks = checks.filter(
    (check) => check.sellerOrganizationId === supplierId,
  );

  const refresh = useCallback(async () => {
    if (!handoffChecked) return;
    setLoading(true);
    setError(null);
    try {
      const [
        offerData,
        balanceData,
        orderData,
        integrationData,
        credentialData,
        checkData,
        documentData,
        merchantData,
        policyData,
        overrideData,
        sourceData,
        importBatchData,
        externalItemData,
      ] = await Promise.all([
        api.get<Offer[]>(`/suppliers/${supplierId}/offers`),
        api.get<Balance[]>(`/suppliers/${supplierId}/inventory/balances`),
        api.get<Order[]>("/supplier-orders"),
        api.get<Integration[]>(`/suppliers/${supplierId}/integrations`),
        api.get<Credential[]>(
          `/compliance/organizations/${supplierId}/credentials`,
        ),
        api.get<ComplianceCheck[]>("/compliance/checks"),
        api.get<DocumentRecord[]>(
          `/documents?ownerOrganizationId=${supplierId}&limit=100`,
        ),
        api.get<MerchantAccount[]>(
          `/organizations/${supplierId}/payment-merchant-accounts`,
        ),
        api.get<FreshnessPolicy[]>(
          `/suppliers/${supplierId}/inventory/freshness/policies`,
        ),
        api.get<DataOverride[]>(`/suppliers/${supplierId}/inventory/overrides`),
        api.get<SupplierDataSource[]>(`/suppliers/${supplierId}/data-sources`),
        api.get<ImportBatch[]>(`/suppliers/${supplierId}/import-batches`),
        api.get<ExternalCatalogItem[]>(`/suppliers/${supplierId}/external-items`),
      ]);
      setOffers(offerData);
      setBalances(balanceData);
      setOrders(orderData);
      setIntegrations(integrationData);
      setCredentials(credentialData);
      setChecks(checkData);
      setDocuments(documentData);
      setMerchantAccounts(merchantData);
      setPolicies(policyData);
      setOverrides(overrideData);
      setDataSources(sourceData);
      setImportBatches(importBatchData);
      setExternalItems(externalItemData);
      setPriceDrafts(
        Object.fromEntries(
          offerData.map((offer) => [
            offer.id,
            String(
              Number(
                offer.prices.find((price) => price.status === "ACTIVE")
                  ?.amountMinor ?? 0,
              ) / 100,
            ),
          ]),
        ),
      );
      setQuantityDrafts(
        Object.fromEntries(
          balanceData.map((balance) => [balance.id, balance.quantityOnHand]),
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [api, handoffChecked, supplierId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const savePrice = async (offer: Offer) => {
    const amount = Number(priceDrafts[offer.id]);
    if (!Number.isFinite(amount) || amount < 0)
      return setError("Введите корректную цену");
    setBusy(`price:${offer.id}`);
    setError(null);
    try {
      await api.put(`/suppliers/${supplierId}/offers/${offer.id}/price`, {
        amountMinor: Math.round(amount * 100),
        currency: "KZT",
        includesVat: true,
        source: "MANUAL",
        reason: "Обновление в кабинете поставщика",
      });
      await refresh();
      setToast("Цена обновлена и записана в историю");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const saveBalance = async (balance: Balance) => {
    const quantity = Number(quantityDrafts[balance.id]);
    if (!Number.isFinite(quantity) || quantity < 0)
      return setError("Введите корректный остаток");
    setBusy(`balance:${balance.id}`);
    setError(null);
    try {
      await api.put(`/suppliers/${supplierId}/inventory/balances`, {
        warehouseId: balance.warehouseId,
        productVariantId: balance.productVariantId,
        offerId: balance.offerId,
        quantityOnHand: quantity,
        quantityReserved: Number(balance.quantityReserved),
        safetyStock: Number(balance.safetyStock),
        source: "MANUAL",
      });
      await refresh();
      setToast("Остаток обновлён, срок актуальности пересчитан");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const confirmOrder = async (order: Order) => {
    setBusy(`order:${order.id}`);
    setError(null);
    try {
      await api.post(`/supplier-orders/${order.id}/confirm`, {
        decisions: order.items.map((item) => ({
          itemId: item.id,
          acceptedQuantity: Number(item.quantity),
        })),
      });
      await refresh();
      setToast("Заказ подтверждён полностью");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const submitCredential = async () => {
    if (!credentialNumber.trim()) return setError("Укажите номер документа");
    if (!credentialFile) return setError("Прикрепите файл документа");
    setBusy("credential");
    setError(null);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error("Не удалось прочитать файл")); reader.readAsDataURL(credentialFile); });
      await api.post(`/compliance/organizations/${supplierId}/credentials`, {
        type: credentialType,
        number: credentialNumber.trim(),
        issuer: "Поставщик",
        fileName: credentialFile.name,
        contentBase64,
        metadata: { source: "supplier-web" },
      });
      setCredentialNumber("");
      setCredentialFile(null);
      await refresh();
      setToast("Документ отправлен на проверку");
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

  const uploadPriceList = async () => {
    if (!priceListFile) return setError("Выберите PDF-прайс или каталог");
    if (!priceListFile.name.toLowerCase().endsWith(".pdf")) return setError("На этом экране принимаются PDF-файлы");
    if (priceListFile.size > 20_000_000) return setError("PDF должен быть не больше 20 МБ");
    setBusy("pdf-import");
    setError(null);
    try {
      let source = dataSources.find((item) => item.type === "PDF");
      if (!source) source = await api.post<SupplierDataSource>(`/suppliers/${supplierId}/data-sources`, { name: "PDF-прайсы поставщика", type: "PDF", configuration: { extractionMode: "text-table-with-review", createdFrom: "supplier-web" } });
      const contentBase64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error("Не удалось прочитать PDF")); reader.readAsDataURL(priceListFile); });
      const batch = await api.post<ImportBatch>(`/suppliers/${supplierId}/import-batches`, {
        sourceId: source.id,
        fileName: priceListFile.name,
        fileType: "PDF",
        contentBase64,
        columnMapping: { externalId: "externalId", name: "name", supplierSku: "supplierSku", unit: "unit", priceMinor: "priceMinor", currency: "currency" },
      });
      setPriceListFile(null);
      await refresh();
      setToast(batch.status === "REVIEW_REQUIRED" ? "PDF сохранён: требуется распознавание или ручная проверка" : `Извлечено ${batch.totalRows} строк. Проверьте и запустите обработку`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const processImportBatch = async (batch: ImportBatch) => {
    setBusy(`import:${batch.id}`);
    setError(null);
    try {
      await api.post(`/suppliers/${supplierId}/import-batches/${batch.id}/process`, {});
      await refresh();
      setToast("Прайс нормализован и отправлен в очередь сопоставления");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const confirmCatalogMatch = async (item: ExternalCatalogItem, productVariantId: string) => {
    setBusy(`match:${item.id}`);
    setError(null);
    try {
      await api.post(`/suppliers/${supplierId}/external-items/${item.id}/match`, { productVariantId });
      await refresh();
      setToast("Позиция привязана к существующей карточке. Дубль не создан");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };

  const renderDashboard = () => {
    const activePrices = offers.filter((offer) =>
      offer.prices.some((price) => price.status === "ACTIVE"),
    );
    const stock = balances.reduce(
      (sum, balance) => sum + Number(balance.quantityAvailable),
      0,
    );
    const revenue = supplierOrders.reduce(
      (sum, order) => sum + Number(order.subtotalAmountMinor),
      0,
    );
    const pendingOrders = supplierOrders.filter(
      (order) => order.status === "AWAITING_CONFIRMATION",
    ).length;
    const staleBalances = balances.filter(
      (balance) => balance.freshnessStatus !== "FRESH",
    ).length;
    const hiddenOffers = offers.filter(
      (offer) => !offer.publication?.marketplaceVisible,
    ).length;
    return (
      <div className="mp-stack">
        <PageHeader
          title={`Добрый день, ${supplier.name}`}
          description="Сначала обработайте заказы и данные, которые влияют на продажи."
        />
        <Section title="Требует внимания" description="Приоритетные действия на сегодня">
          <div className={styles.attentionGrid}>
            <button type="button" onClick={() => setActive("orders")}>
              <StatusTag tone={pendingOrders ? "warning" : "success"}>Заказы</StatusTag>
              <strong>{pendingOrders ? `${pendingOrders} ждут подтверждения` : "Все заказы обработаны"}</strong>
              <span>Подтвердите доступное количество и срок поставки.</span>
            </button>
            <button type="button" onClick={() => setActive("inventory")}>
              <StatusTag tone={staleBalances ? "warning" : "success"}>Остатки</StatusTag>
              <strong>{staleBalances ? `${staleBalances} позиций устарели` : "Остатки актуальны"}</strong>
              <span>Обновите данные, чтобы предложения оставались видимыми.</span>
            </button>
            <button type="button" onClick={() => setActive("offers")}>
              <StatusTag tone={hiddenOffers ? "warning" : "success"}>Каталог</StatusTag>
              <strong>{hiddenOffers ? `${hiddenOffers} предложений скрыто` : "Каталог опубликован"}</strong>
              <span>Проверьте цену, публикацию и обязательные документы.</span>
            </button>
          </div>
        </Section>
        <div className="mp-metrics">
          <Metric
            label="Опубликовано"
            value={`${offers.filter((offer) => offer.publication?.marketplaceVisible).length} / ${offers.length}`}
            detail={`${activePrices.length} с активной ценой`}
            icon={<BuildingShop24Regular />}
          />
          <Metric
            label="Доступный остаток"
            value={new Intl.NumberFormat("ru-KZ").format(stock)}
            detail={`${balances.length} складских позиций`}
            icon={<Box24Regular />}
          />
          <Metric
            label="Заказы"
            value={supplierOrders.length}
            detail={`${supplierOrders.filter((order) => order.status === "AWAITING_CONFIRMATION").length} ждут решения`}
            icon={<ClipboardTaskListLtr24Regular />}
          />
          <Metric
            label="Оборот заказов"
            value={formatMoney(revenue)}
            detail="До вычета комиссии и возвратов"
            icon={<Money24Regular />}
          />
        </div>
        <div className="mp-grid-2">
          <Section
            title="Состояние данных"
            description="Проверки, которые влияют на публикацию и продажи"
          >
            <div className={styles.healthGrid}>
              <div className={styles.healthItem}>
                <StatusTag
                  tone={
                    balances.every((item) => item.freshnessStatus === "FRESH")
                      ? "success"
                      : "warning"
                  }
                >
                  Остатки
                </StatusTag>
                <strong>
                  {
                    balances.filter((item) => item.freshnessStatus === "FRESH")
                      .length
                  }{" "}
                  актуальных
                </strong>
                <p>Политики актуальности: {policies.length}</p>
              </div>
              <div className={styles.healthItem}>
                <StatusTag
                  tone={
                    integrations.some((item) => item.status === "ACTIVE")
                      ? "success"
                      : "neutral"
                  }
                >
                  Интеграции
                </StatusTag>
                <strong>{integrations.length || "Нет подключений"}</strong>
                <p>
                  {integrations.reduce(
                    (sum, item) => sum + item._count.jobs,
                    0,
                  )}{" "}
                  заданий синхронизации
                </p>
              </div>
              <div className={styles.healthItem}>
                <StatusTag
                  tone={
                    credentials.some((item) => item.status === "VERIFIED")
                      ? "success"
                      : "warning"
                  }
                >
                  Комплаенс
                </StatusTag>
                <strong>
                  {
                    credentials.filter((item) => item.status === "VERIFIED")
                      .length
                  }{" "}
                  проверено
                </strong>
                <p>
                  {
                    supplierChecks.filter((item) => item.decision === "BLOCKED")
                      .length
                  }{" "}
                  блокирующих проверок
                </p>
              </div>
            </div>
          </Section>
          <Section title="Последние заказы" description="События по исполнению">
            {!supplierOrders.length ? (
              <EmptyState
                icon={<ClipboardTaskListLtr24Regular />}
                title="Заказов нет"
                description="Новые заказы покупателей появятся здесь."
              />
            ) : (
              <div className={styles.timeline}>
                {supplierOrders.slice(0, 5).map((order) => (
                  <article className={styles.event} key={order.id}>
                    <span>{formatDate(order.createdAt, true)}</span>
                    <div>
                      <strong>{order.orderNumber}</strong>
                      <p>
                        {order.buyer.displayName} · {order.items.length} позиций
                        ·{" "}
                        {formatMoney(order.subtotalAmountMinor, order.currency)}
                      </p>
                    </div>
                    <StatusTag tone={statusTone(order.status)}>
                      {formatStatus(order.status)}
                    </StatusTag>
                  </article>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    );
  };

  const renderOffers = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Каталог поставщика"
        title="Предложения и цены"
        description="Для каждой цены сохраняются источник, срок действия и история изменений."
      />
      <Section>
        {!offers.length ? (
          <EmptyState
            icon={<BuildingShop24Regular />}
            title="Нет предложений"
            description="Создайте предложение или загрузите каталог через интеграцию."
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Товар</th>
                  <th>Упаковка</th>
                  <th>Публикация</th>
                  <th>Остаток</th>
                  <th>Цена, ₸</th>
                </tr>
              </thead>
              <tbody>
                {offers.map((offer) => {
                  const activePrice = offer.prices.find(
                    (price) => price.status === "ACTIVE",
                  );
                  return (
                    <tr key={offer.id}>
                      <td>
                        <strong>
                          {offer.productVariant.product.canonicalName}
                        </strong>
                        <small>
                          {offer.supplierSku ?? offer.id.slice(0, 8)} ·{" "}
                          {offer.sourceType}
                        </small>
                      </td>
                      <td>
                        {offer.packaging?.name ?? "Не назначена"}
                        <br />
                        <small>
                          {offer.packaging
                            ? `${offer.packaging.quantityInBaseUnit} ${offer.packaging.unit.symbol}`
                            : ""}
                        </small>
                      </td>
                      <td>
                        <StatusTag
                          tone={statusTone(
                            offer.publication?.status ?? "DRAFT",
                          )}
                        >
                          {formatStatus(offer.publication?.status ?? "DRAFT")}
                        </StatusTag>
                      </td>
                      <td>
                        {offer.inventoryBalances.reduce(
                          (sum, item) => sum + Number(item.quantityAvailable),
                          0,
                        )}
                      </td>
                      <td>
                        <div className={styles.editCell}>
                          <Input
                            type="number"
                            min="0"
                            value={priceDrafts[offer.id] ?? ""}
                            onChange={(_, data) =>
                              setPriceDrafts((items) => ({
                                ...items,
                                [offer.id]: data.value,
                              }))
                            }
                          />
                          <Button
                            appearance="primary"
                            onClick={() => void savePrice(offer)}
                            disabled={busy === `price:${offer.id}`}
                          >
                            {busy === `price:${offer.id}` ? (
                              <Spinner size="tiny" />
                            ) : (
                              "Сохранить"
                            )}
                          </Button>
                        </div>
                        <small>
                          {activePrice?.freshnessExpiresAt
                            ? `до ${formatDate(activePrice.freshnessExpiresAt, true)}`
                            : "срок не задан"}
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );

  const renderInventory = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Складской учёт"
        title="Остатки и партии"
        description="Доступное количество учитывает резервы, страховой запас и время последнего обновления."
        actions={
          <Button
            icon={<ArrowSync24Regular />}
            onClick={() =>
              void api
                .post(
                  `/suppliers/${supplierId}/inventory/freshness/recompute`,
                  { staleAfterMinutes: 1440 },
                )
                .then(refresh)
            }
          >
            Пересчитать
          </Button>
        }
      />
      <Section>
        {!balances.length ? (
          <EmptyState
            icon={<Box24Regular />}
            title="Нет складских остатков"
            description="Добавьте складскую позицию или синхронизируйте ERP."
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Товар и склад</th>
                  <th>Доступно</th>
                  <th>Резерв</th>
                  <th>Партии</th>
                  <th>Актуальность</th>
                  <th>На складе</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((balance) => (
                  <tr key={balance.id}>
                    <td>
                      <strong>
                        {balance.productVariant.product.canonicalName}
                      </strong>
                      <small>
                        {balance.warehouse.name} · {balance.warehouse.code}
                      </small>
                    </td>
                    <td>
                      <strong>{balance.quantityAvailable}</strong>
                    </td>
                    <td>{balance.quantityReserved}</td>
                    <td>
                      {balance.lots.length}
                      <br />
                      <small>
                        {balance.lots[0]
                          ? `${balance.lots[0].lotNumber} до ${formatDate(balance.lots[0].expirationDate)}`
                          : "без партий"}
                      </small>
                    </td>
                    <td>
                      <StatusTag tone={statusTone(balance.freshnessStatus)}>
                        {formatStatus(balance.freshnessStatus)}
                      </StatusTag>
                      <br />
                      <small>
                        {formatDate(balance.freshnessExpiresAt, true)}
                      </small>
                    </td>
                    <td>
                      <div className={styles.editCell}>
                        <Input
                          type="number"
                          min="0"
                          value={quantityDrafts[balance.id] ?? ""}
                          onChange={(_, data) =>
                            setQuantityDrafts((items) => ({
                              ...items,
                              [balance.id]: data.value,
                            }))
                          }
                        />
                        <Button
                          appearance="primary"
                          onClick={() => void saveBalance(balance)}
                          disabled={busy === `balance:${balance.id}`}
                        >
                          {busy === `balance:${balance.id}` ? (
                            <Spinner size="tiny" />
                          ) : (
                            "Сохранить"
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {overrides.length ? (
        <Section
          title="Ручные переопределения"
          description="Данные, защищённые от автоматической перезаписи"
        >
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Тип</th>
                  <th>Режим</th>
                  <th>Причина</th>
                  <th>Статус</th>
                  <th>Создано</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((override) => (
                  <tr key={override.id}>
                    <td>{override.target}</td>
                    <td>{override.mode}</td>
                    <td>{override.reason}</td>
                    <td>
                      <StatusTag tone={statusTone(override.status)}>
                        {formatStatus(override.status)}
                      </StatusTag>
                    </td>
                    <td>{formatDate(override.createdAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </div>
  );

  const renderOrders = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Исполнение"
        title="Заказы покупателей"
        description="Подтвердите доступное количество, затем создайте отгрузку и комплект документов."
      />
      <Section>
        {!supplierOrders.length ? (
          <EmptyState
            icon={<ClipboardTaskListLtr24Regular />}
            title="Заказов пока нет"
            description="Новые заказы появятся после резервирования покупателем."
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Заказ</th>
                  <th>Покупатель</th>
                  <th>Состав</th>
                  <th>Сумма</th>
                  <th>Статус</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {supplierOrders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{order.orderNumber}</strong>
                      <small>{formatDate(order.createdAt, true)}</small>
                    </td>
                    <td>{order.buyer.displayName}</td>
                    <td>
                      {order.items
                        .map(
                          (item) =>
                            item.offer.productVariant.product.canonicalName,
                        )
                        .join(", ")}
                    </td>
                    <td>
                      {formatMoney(order.subtotalAmountMinor, order.currency)}
                    </td>
                    <td>
                      <StatusTag tone={statusTone(order.status)}>
                        {formatStatus(order.status)}
                      </StatusTag>
                    </td>
                    <td>
                      {order.status === "AWAITING_CONFIRMATION" ? (
                        <Button
                          appearance="primary"
                          icon={<CheckmarkCircle24Regular />}
                          onClick={() => void confirmOrder(order)}
                          disabled={busy === `order:${order.id}`}
                        >
                          Подтвердить всё
                        </Button>
                      ) : (
                        <span className="mp-muted">Решение принято</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );

  const renderIntegrations = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Обмен данными"
        title="Интеграции"
        description="Загружайте прайсы файлами или подключите 1С и другую учётную систему."
      />
      {handoff ? <ConnectorOnboarding supplierId={supplierId} apiContext={apiContext} /> : null}
      <Section title="Загрузить прайс или каталог" description="Мы сохраним исходный файл, распознаем строки и попросим подтвердить валюту перед публикацией.">
        <div className={styles.pdfUpload}>
          <Field label="PDF поставщика" hint="До 20 МБ. Текстовые таблицы распознаются автоматически; сканы уходят на ручную проверку.">
            <input className={styles.fileInput} type="file" accept="application/pdf,.pdf" onChange={(event) => setPriceListFile(event.target.files?.[0] ?? null)} />
          </Field>
          <Button appearance="primary" icon={<CloudArrowUp24Regular />} disabled={!priceListFile || busy === "pdf-import"} onClick={() => void uploadPriceList()}>
            {busy === "pdf-import" ? "Извлекаем…" : "Загрузить и распознать"}
          </Button>
        </div>
        {importBatches.length ? <div className={styles.importList}>{importBatches.slice(0, 10).map((batch) => <article className={styles.importItem} key={batch.id}>
          <div><strong>{batch.fileName}</strong><p>{batch.source.name} · {batch.totalRows} строк · {formatDate(batch.createdAt, true)}</p>{batch.extractionMetadata?.warnings?.map((warning) => <p className={styles.importWarning} key={warning}>{warning}</p>)}</div>
          <div className={styles.importActions}><StatusTag tone={statusTone(batch.status)}>{formatStatus(batch.status)}</StatusTag>{batch.status === "MAPPED" && batch.totalRows > 0 ? <Button appearance="secondary" disabled={busy === `import:${batch.id}`} onClick={() => void processImportBatch(batch)}>Проверено, обработать</Button> : null}</div>
        </article>)}</div> : <EmptyState icon={<CloudArrowUp24Regular />} title="Файлы ещё не загружены" description="Добавьте прайс поставщика. После обработки здесь появятся найденные строки." />}
      </Section>
      <Section title="Проверка дублей каталога" description="Новая карточка не создаётся автоматически. Сначала платформа ищет точное или похожее совпадение в общем каталоге.">
        {externalItems.length ? <div className={styles.importList}>{externalItems.slice(0, 30).map((item) => { const candidate = item.matchCandidates.find((entry) => entry.status === "PROPOSED") ?? item.matchCandidates[0]; return <article className={styles.importItem} key={item.id}>
          <div><strong>{item.name}</strong><p>{item.supplierSku || "Без артикула"} · {item.matchedVariant ? `привязано к «${item.matchedVariant.product.canonicalName}»` : candidate ? `найдено совпадение «${candidate.productVariant.product.canonicalName}» (${Math.round(Number(candidate.score) * 100)}%)` : item.productCandidate ? "новая карточка ожидает модерации" : "совпадений нет"}</p></div>
          <div className={styles.importActions}>{item.matchedVariant ? <StatusTag tone="success">Привязано</StatusTag> : candidate ? <Button appearance="secondary" disabled={busy === `match:${item.id}`} onClick={() => void confirmCatalogMatch(item, candidate.productVariant.id)}>Использовать карточку</Button> : <StatusTag tone="warning">Модерация</StatusTag>}</div>
        </article>; })}</div> : <EmptyState icon={<Box24Regular />} title="Позиций для проверки пока нет" description="После обработки прайса здесь появятся существующие карточки, возможные совпадения и новые кандидаты." />}
      </Section>
      <Section>
        {!integrations.length ? (
          <EmptyState
            icon={<PlugConnected24Regular />}
            title="Интеграций пока нет"
            description="Обратитесь к оператору для подключения учётной системы или продолжайте работать вручную."
          />
        ) : (
          <div className={styles.integrationList}>
            {integrations.map((integration) => (
              <article className={styles.integration} key={integration.id}>
                <div>
                  <strong>{integration.displayName}</strong>
                  <p>
                    {integrationProviderLabel[integration.provider] ?? integration.provider}. {integrationModeLabel[integration.mode] ?? integration.mode}.{" "}
                    {integration.bindings.length} привязок, {" "}
                    {integration._count.jobs} заданий
                  </p>
                  <p>
                    {integration.lastSuccessAt
                      ? `Последний успех ${formatDate(integration.lastSuccessAt, true)}`
                      : (integration.lastError ??
                        "Синхронизация ещё не выполнялась")}
                  </p>
                </div>
                <StatusTag tone={statusTone(integration.status)}>
                  {formatStatus(integration.status)}
                </StatusTag>
              </article>
            ))}
          </div>
        )}
      </Section>
      <Section title="Способы загрузки данных">
        <div className={styles.healthGrid}>
          <div className={styles.healthItem}>
            <CloudArrowUp24Regular />
            <strong>Импорт PDF, CSV и Excel</strong>
            <p>Загрузка таблиц, распознавание строк и проверка валюты перед публикацией.</p>
          </div>
          <div className={styles.healthItem}>
            <PlugConnected24Regular />
            <strong>Прямое подключение</strong>
            <p>Автоматическое обновление данных и повторная отправка при ошибке.</p>
          </div>
          <div className={styles.healthItem}>
            <DataTrending24Regular />
            <strong>1С Connector Agent</strong>
            <p>
              Регистрация агента, heartbeat, очередь заданий и версионирование.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );

  const renderCompliance = () => (
    <div className="mp-stack">
      <PageHeader
        eyebrow="Регуляторика"
        title="Комплаенс и документы организации"
        description="Загрузите лицензии и регистрационные документы. Мы проверим их срок действия и сохраним историю изменений."
      />
      <Section
        title="Добавить документ"
        description="После отправки документ появится со статусом «Ожидает проверки»"
      >
        <div className={styles.formRow}>
          <Field label="Тип">
            <Select
              value={credentialType}
              onChange={(_, data) => setCredentialType(data.value)}
            >
              <option value="REGISTRATION_CERTIFICATE">
                Регистрационное удостоверение
              </option>
              <option value="WHOLESALE_LICENSE">Оптовая лицензия</option>
              <option value="MEDICAL_DEVICE_SALE_NOTIFICATION">Уведомление о реализации медицинских изделий</option>
              <option value="DISTRIBUTOR_AUTHORIZATION">
                Авторизация дистрибьютора
              </option>
              <option value="QUALITY_CERTIFICATE">Сертификат качества</option>
              <option value="OTHER">Другой документ</option>
            </Select>
          </Field>
          <Field label="Номер">
            <Input
              value={credentialNumber}
              onChange={(_, data) => setCredentialNumber(data.value)}
              placeholder="KZ-RC-2026-001"
            />
          </Field>
          <Field label="Файл PDF / изображение">
            <input className={styles.fileInput} type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setCredentialFile(event.currentTarget.files?.[0] ?? null)} />
          </Field>
          <Button
            appearance="primary"
            icon={<CloudArrowUp24Regular />}
            onClick={() => void submitCredential()}
            disabled={busy === "credential" || !credentialFile}
          >
            Отправить
          </Button>
        </div>
        {!credentials.length ? (
          <EmptyState
            icon={<ShieldCheckmark24Regular />}
            title="Документы не добавлены"
            description="Добавьте лицензию или регистрационное удостоверение."
          />
        ) : (
          <div className={styles.credentialList}>
            {credentials.map((credential) => (
              <article className={styles.credential} key={credential.id}>
                <div>
                  <strong>
                    {credentialTypeLabel[credential.type] ?? "Документ"}. {credential.number}
                  </strong>
                  <p>
                    {credential.issuer ?? "Издатель не указан"}. Действует до{" "}
                    {formatDate(credential.validTo)}
                  </p>
                  {credential.rejectionReason ? (
                    <p>{credential.rejectionReason}</p>
                  ) : null}
                </div>
                <StatusTag tone={statusTone(credential.status)}>
                  {formatStatus(credential.status)}
                </StatusTag>
              </article>
            ))}
          </div>
        )}
      </Section>
      <Section
        title="Последние автоматические проверки"
        description={`${supplierChecks.length} результатов`}
      >
        {!supplierChecks.length ? (
          <EmptyState
            icon={<ShieldCheckmark24Regular />}
            title="Проверок пока нет"
            description="Проверка запускается при публикации и оформлении заказа."
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Объект</th>
                  <th>Риск</th>
                  <th>Решение</th>
                  <th>Статус</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                {supplierChecks.slice(0, 50).map((check) => (
                  <tr key={check.id}>
                    <td>
                      {check.offer?.productVariant?.product?.canonicalName ??
                        "Организация"}
                    </td>
                    <td>
                      <StatusTag
                        tone={
                          check.riskLevel === "CRITICAL"
                            ? "danger"
                            : check.riskLevel === "HIGH"
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {check.riskLevel}
                      </StatusTag>
                    </td>
                    <td>{check.decision}</td>
                    <td>
                      <StatusTag tone={statusTone(check.status)}>
                        {formatStatus(check.status)}
                      </StatusTag>
                    </td>
                    <td>{formatDate(check.evaluatedAt, true)}</td>
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
        eyebrow="Документооборот"
        title="Документы"
        description="Счета, спецификации и накладные с электронными подписями и историей версий."
      />
      <Section>
        {!documents.length ? (
          <EmptyState
            icon={<Document24Regular />}
            title="Документов пока нет"
            description="Сформированные счета, спецификации и накладные появятся здесь."
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
      <Section
        title="Платёжный профиль"
        description="Готовность к приёму и выплате средств"
      >
        {!merchantAccounts.length ? (
          <EmptyState
            icon={<Money24Regular />}
            title="Платёжный профиль не подключён"
            description="Настройка выполняется оператором площадки."
          />
        ) : (
          <div className="mp-table-wrap">
            <table className="mp-table">
              <thead>
                <tr>
                  <th>Провайдер</th>
                  <th>Подключение</th>
                  <th>Проверка</th>
                  <th>Выплаты</th>
                  <th>Merchant ID</th>
                </tr>
              </thead>
              <tbody>
                {merchantAccounts.map((account) => (
                  <tr key={account.id}>
                    <td>{account.provider.name}</td>
                    <td>
                      <StatusTag tone={statusTone(account.onboardingStatus)}>
                        {formatStatus(account.onboardingStatus)}
                      </StatusTag>
                    </td>
                    <td>
                      <StatusTag tone={statusTone(account.verificationStatus)}>
                        {formatStatus(account.verificationStatus)}
                      </StatusTag>
                    </td>
                    <td>
                      <StatusTag tone={statusTone(account.payoutStatus)}>
                        {formatStatus(account.payoutStatus)}
                      </StatusTag>
                    </td>
                    <td className="mp-mono">{account.externalMerchantId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );

  const content =
    active === "dashboard"
      ? renderDashboard()
      : active === "offers"
        ? renderOffers()
        : active === "inventory"
          ? renderInventory()
          : active === "orders"
            ? renderOrders()
            : active === "integrations"
              ? renderIntegrations()
              : active === "compliance"
                ? renderCompliance()
                : active === "promotions"
                  ? <PromotionsPanel supplierId={supplierId} apiContext={apiContext} />
                : active === "trust"
                  ? <SupplierTrustPanel supplierId={supplierId} apiContext={apiContext} />
                : renderDocuments();
  const nav = navigation.map((item) =>
    item.id === "orders" &&
    supplierOrders.filter((order) => order.status === "AWAITING_CONFIRMATION")
      .length
      ? {
          ...item,
          badge: String(
            supplierOrders.filter(
              (order) => order.status === "AWAITING_CONFIRMATION",
            ).length,
          ),
        }
      : item,
  );

  return (
    <AppShell
      productName="DentMarket"
      productMark="DM"
      workspaceLabel="Кабинет поставщика"
      userName={supplier.name}
      userMeta={`${supplier.city} · Поставщик`}
      navigation={nav}
      activeNavigation={active}
      contextLabel={
        active === "compliance"
          ? "Комплаенс"
          : active === "promotions"
            ? "Акции"
            : active === "trust"
              ? "Доверие и география"
              : undefined
      }
      onNavigate={setActive}
      actions={
        <>
          <Select
            className={styles.switcher}
            value={supplierId}
            onChange={(_, data) => setSupplierId(data.value)}
            aria-label="Организация поставщика"
          >
            {availableSuppliers.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" icon={<MoreHorizontal24Regular />}>Ещё</Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<ShieldCheckmark24Regular />} onClick={() => setActive("compliance")}>Комплаенс</MenuItem>
                <MenuItem icon={<Money24Regular />} onClick={() => setActive("promotions")}>Акции</MenuItem>
                <MenuItem icon={<Star24Regular />} onClick={() => setActive("trust")}>Доверие и география</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Button
            className={styles.refreshButton}
            appearance="subtle"
            icon={<ArrowSync24Regular />}
            onClick={() => void refresh()}
            aria-label="Обновить данные"
          />
        </>
      }
    >
      {loading ? (
        <LoadingState label="Загружаем кабинет поставщика" />
      ) : error && !offers.length && !balances.length ? (
        <ErrorState
          description={error}
          action={<Button onClick={() => void refresh()}>Повторить</Button>}
        />
      ) : (
        <>
          {error ? <div className={styles.toast}>{error}</div> : null}
          {handoff ? <OnboardingProgress apiContext={apiContext} supplierId={supplierId} onNavigate={setActive} /> : null}
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
