"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import styles from "./supplier-operations.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Warehouse = { id: string; code: string; name: string };
type DataSource = { id: string; name: string; type: string };
type SupplierProfile = {
  organizationId: string;
  organization: { displayName: string; bin: string };
  warehouses: Warehouse[];
  dataSources: DataSource[];
  _count: { offers: number; importBatches: number };
};
type ImportBatch = {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  createdAt: string;
};
type Product = {
  id: string;
  canonicalName: string;
  variants: Array<{ id: string; sku?: string | null; gtin?: string | null }>;
};
type MatchCandidate = {
  id: string;
  score: string;
  productVariant: {
    id: string;
    sku?: string | null;
    product: { canonicalName: string };
  };
};
type ExternalItem = {
  id: string;
  externalId: string;
  name: string;
  supplierSku?: string | null;
  matchedVariantId?: string | null;
  matchCandidates: MatchCandidate[];
};
type Offer = {
  id: string;
  supplierSku?: string | null;
  status: string;
  version: number;
  productVariant: { id: string; product: { canonicalName: string } };
  publication?: { status: string; marketplaceVisible: boolean } | null;
  prices: Array<{ amountMinor: string; currency: string; status: string }>;
};
type Balance = {
  id: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  availabilityStatus: string;
  freshnessStatus: string;
  warehouse: Warehouse;
  productVariant: { id: string; product: { canonicalName: string } };
  lots: Array<{
    id: string;
    lotNumber: string;
    expirationDate?: string | null;
    quantityAvailable: string;
    status: string;
  }>;
  reservations: Array<{ id: string; quantity: string; expiresAt: string }>;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

const demoCsv = `id,name,sku,gtin,price,currency,stock,lot,expires
WEB-001,Демонстрационный стоматологический композит,DEMO-COMP-A2,1234567890123,129000,KZT,24,WEB-LOT-01,2028-06-30`;

function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function SupplierOperations() {
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [items, setItems] = useState<ExternalItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: { ...adminAuthHeaders(), ...init?.headers },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          payload?.message ?? `API вернул статус ${response.status}`,
        );
      }
      return response.json() as Promise<T>;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supplierData = await request<SupplierProfile[]>("/suppliers");
      setSuppliers(supplierData);
      const activeSupplierId = supplierId || supplierData[0]?.organizationId;
      if (!activeSupplierId) {
        setMessage(
          "Создайте supplier profile для организации с capability SUPPLIER.",
        );
        return;
      }
      if (!supplierId) setSupplierId(activeSupplierId);
      const [batchData, itemData, productData, offerData, balanceData] =
        await Promise.all([
          request<ImportBatch[]>(
            `/suppliers/${activeSupplierId}/import-batches`,
          ),
          request<ExternalItem[]>(
            `/suppliers/${activeSupplierId}/external-items`,
          ),
          request<Product[]>("/catalog/products"),
          request<Offer[]>(`/suppliers/${activeSupplierId}/offers`),
          request<Balance[]>(
            `/suppliers/${activeSupplierId}/inventory/balances`,
          ),
        ]);
      setBatches(batchData);
      setItems(itemData);
      setProducts(productData);
      setOffers(offerData);
      setBalances(balanceData);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Контур поставщика недоступен.",
      );
    } finally {
      setLoading(false);
    }
  }, [request, supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSupplier = suppliers.find(
    ({ organizationId }) => organizationId === supplierId,
  );

  async function createWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/suppliers/${supplierId}/warehouses`, {
        method: "POST",
        body: JSON.stringify({
          code: String(data.get("code")).toUpperCase(),
          name: data.get("name"),
          addressLine: String(data.get("addressLine") ?? "") || null,
        }),
      });
      form.reset();
      await load();
      setMessage("Склад поставщика создан.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать склад.",
      );
    }
  }

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/suppliers/${supplierId}/data-sources`, {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          type: data.get("type"),
        }),
      });
      form.reset();
      await load();
      setMessage("Источник данных добавлен.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать источник.",
      );
    }
  }

  async function uploadCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const batch = await request<ImportBatch>(
        `/suppliers/${supplierId}/import-batches`,
        {
          method: "POST",
          body: JSON.stringify({
            sourceId: data.get("sourceId"),
            fileName: data.get("fileName"),
            fileType: "CSV",
            contentBase64: base64Utf8(String(data.get("csv"))),
            columnMapping: {
              externalId: "id",
              name: "name",
              supplierSku: "sku",
              gtin: "gtin",
              priceMinor: "price",
              currency: "currency",
              quantityOnHand: "stock",
              lotNumber: "lot",
              expirationDate: "expires",
            },
          }),
        },
      );
      await request(
        `/suppliers/${supplierId}/import-batches/${batch.id}/process`,
        { method: "POST" },
      );
      await load();
      setMessage("CSV сохранён как raw rows и обработан matching pipeline.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Импорт не выполнен.",
      );
    }
  }

  async function confirmMatch(item: ExternalItem, variantId: string) {
    try {
      await request(
        `/suppliers/${supplierId}/external-items/${item.id}/match`,
        {
          method: "POST",
          body: JSON.stringify({ productVariantId: variantId }),
        },
      );
      await load();
      setMessage(
        `Строка ${item.externalId} сопоставлена с вариантом каталога.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Matching не подтверждён.",
      );
    }
  }

  async function createOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/suppliers/${supplierId}/offers`, {
        method: "POST",
        body: JSON.stringify({
          productVariantId: data.get("productVariantId"),
          sourceId: String(data.get("sourceId") ?? "") || null,
          supplierSku: String(data.get("supplierSku") ?? "") || null,
          sourceType: "IMPORT",
        }),
      });
      form.reset();
      await load();
      setMessage("Черновик supplier offer создан отдельно от цены и остатка.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Offer не создан.");
    }
  }

  async function activateOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const offer = offers.find(({ id }) => id === data.get("offerId"));
    if (!offer) return;
    try {
      await request(`/suppliers/${supplierId}/offers/${offer.id}/price`, {
        method: "PUT",
        body: JSON.stringify({
          amountMinor: Number(data.get("amountMinor")),
          currency: "KZT",
          includesVat: true,
          vatRate: 12,
          source: "MANUAL",
          reason: "Обновление из admin-web",
        }),
      });
      await request(`/suppliers/${supplierId}/inventory/balances`, {
        method: "PUT",
        body: JSON.stringify({
          warehouseId: data.get("warehouseId"),
          productVariantId: offer.productVariant.id,
          offerId: offer.id,
          quantityOnHand: Number(data.get("quantityOnHand")),
          safetyStock: Number(data.get("safetyStock") || 0),
          source: "MANUAL",
        }),
      });
      await request(`/suppliers/${supplierId}/offers/${offer.id}/publication`, {
        method: "PUT",
        body: JSON.stringify({ status: "PUBLISHED", marketplaceVisible: true }),
      });
      await load();
      setMessage(
        "Цена записана в историю, остаток обновлён, offer опубликован.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Offer не активирован.",
      );
    }
  }

  async function createLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/suppliers/${supplierId}/inventory/lots`, {
        method: "POST",
        body: JSON.stringify({
          inventoryBalanceId: data.get("balanceId"),
          lotNumber: data.get("lotNumber"),
          expirationDate: data.get("expirationDate"),
          quantityOnHand: Number(data.get("quantityOnHand")),
          status: "ACTIVE",
        }),
      });
      form.reset();
      await load();
      setMessage("Партия добавлена в FEFO-контур.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Партия не создана.");
    }
  }

  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await request(
        `/suppliers/${supplierId}/inventory/balances/${data.get("balanceId")}/reservations`,
        {
          method: "POST",
          body: JSON.stringify({
            quantity: Number(data.get("quantity")),
            idempotencyKey: data.get("idempotencyKey"),
            ttlMinutes: 30,
            referenceType: "ADMIN_SMOKE",
          }),
        },
      );
      await load();
      setMessage("Резерв создан атомарно; повтор того же ключа безопасен.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Резерв не создан.");
    }
  }

  return (
    <section
      id="supplier-data"
      className={styles.section}
      aria-label="Контур данных поставщика"
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>ITERATION 1B / SUPPLIER DATA</span>
          <h2>Прайс → matching → offer → inventory</h2>
          <p>
            Сквозной путь сохраняет исходную строку и разделяет коммерческие
            состояния.
          </p>
        </div>
        <div className={styles.actions}>
          <select
            aria-label="Активный поставщик"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
          >
            {suppliers.map((supplier) => (
              <option
                key={supplier.organizationId}
                value={supplier.organizationId}
              >
                {supplier.organization.displayName}
              </option>
            ))}
          </select>
          <button onClick={() => void load()}>Синхронизировать</button>
        </div>
      </div>
      {message && (
        <div className={styles.notice} role="status">
          {message}
        </div>
      )}
      {loading ? (
        <div className={styles.loading}>
          <i />
          <i />
          <i />
        </div>
      ) : !activeSupplier ? (
        <div className={styles.empty}>Нет supplier profile.</div>
      ) : (
        <div className={styles.grid}>
          <article className={styles.panel}>
            <header>
              <span>01</span>
              <div>
                <h3>Поставщик и источники</h3>
                <p>
                  {activeSupplier.organization.displayName} · БИН{" "}
                  {activeSupplier.organization.bin}
                </p>
              </div>
            </header>
            <div className={styles.stats}>
              <b>
                {activeSupplier.warehouses.length}
                <small>складов</small>
              </b>
              <b>
                {activeSupplier.dataSources.length}
                <small>источников</small>
              </b>
              <b>
                {activeSupplier._count.importBatches}
                <small>импортов</small>
              </b>
            </div>
            <form className={styles.form} onSubmit={createWarehouse}>
              <label>
                Код склада
                <input name="code" required placeholder="AST-02" />
              </label>
              <label>
                Название
                <input name="name" required placeholder="Склад Астана" />
              </label>
              <label className={styles.wide}>
                Адрес
                <input name="addressLine" placeholder="ул. ..." />
              </label>
              <button className={styles.secondary}>Добавить склад</button>
            </form>
            <form className={styles.form} onSubmit={createSource}>
              <label>
                Источник
                <input name="name" required placeholder="Прайс отдела продаж" />
              </label>
              <label>
                Тип
                <select name="type" defaultValue="CSV">
                  <option>CSV</option>
                  <option>EXCEL</option>
                  <option>MANUAL</option>
                  <option>API</option>
                  <option>ERP</option>
                </select>
              </label>
              <button className={styles.secondary}>Добавить источник</button>
            </form>
          </article>

          <article className={styles.panel}>
            <header>
              <span>02</span>
              <div>
                <h3>Импорт и matching</h3>
                <p>CSV/Excel parser, raw rows и объяснимые кандидаты.</p>
              </div>
            </header>
            <form className={styles.form} onSubmit={uploadCsv}>
              <label>
                Источник
                <select name="sourceId" required>
                  <option value="">Выберите</option>
                  {activeSupplier.dataSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Имя файла
                <input name="fileName" defaultValue="web-price.csv" required />
              </label>
              <label className={styles.wide}>
                CSV
                <textarea name="csv" rows={5} defaultValue={demoCsv} required />
              </label>
              <button className={styles.primary}>Загрузить и обработать</button>
            </form>
            <div className={styles.records}>
              {batches.slice(0, 3).map((batch) => (
                <div className={styles.record} key={batch.id}>
                  <div>
                    <strong>{batch.fileName}</strong>
                    <small>
                      {batch.status} · {batch.processedRows}/{batch.totalRows} ·
                      ошибок {batch.errorRows}
                    </small>
                  </div>
                  <time>
                    {new Date(batch.createdAt).toLocaleDateString("ru-KZ")}
                  </time>
                </div>
              ))}
            </div>
            <div className={styles.matches}>
              {items.slice(0, 4).map((item) => {
                const candidate = item.matchCandidates[0];
                return (
                  <div className={styles.match} key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.externalId} ·{" "}
                        {item.matchedVariantId
                          ? "MATCHED"
                          : candidate
                            ? `score ${candidate.score}`
                            : "без кандидата"}
                      </small>
                    </div>
                    {!item.matchedVariantId && candidate && (
                      <button
                        onClick={() =>
                          void confirmMatch(item, candidate.productVariant.id)
                        }
                      >
                        Подтвердить
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </article>

          <article className={styles.panel}>
            <header>
              <span>03</span>
              <div>
                <h3>Offer, цена, публикация</h3>
                <p>Цена версионируется отдельно от видимости и наличия.</p>
              </div>
            </header>
            <form className={styles.form} onSubmit={createOffer}>
              <label className={styles.wide}>
                Вариант
                <select name="productVariantId" required>
                  <option value="">Выберите</option>
                  {products.flatMap((product) =>
                    product.variants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {product.canonicalName} · {variant.sku ?? "без SKU"}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <label>
                Источник
                <select name="sourceId">
                  <option value="">Ручной</option>
                  {activeSupplier.dataSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SKU поставщика
                <input name="supplierSku" />
              </label>
              <button className={styles.primary}>Создать offer</button>
            </form>
            <form className={styles.form} onSubmit={activateOffer}>
              <label className={styles.wide}>
                Offer
                <select name="offerId" required>
                  <option value="">Выберите</option>
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.productVariant.product.canonicalName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Цена, тиын
                <input
                  name="amountMinor"
                  type="number"
                  min="0"
                  defaultValue="129000"
                  required
                />
              </label>
              <label>
                On hand
                <input
                  name="quantityOnHand"
                  type="number"
                  min="0"
                  defaultValue="24"
                  required
                />
              </label>
              <label>
                Safety stock
                <input
                  name="safetyStock"
                  type="number"
                  min="0"
                  defaultValue="2"
                />
              </label>
              <label>
                Склад
                <select name="warehouseId" required>
                  <option value="">Выберите</option>
                  {activeSupplier.warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className={styles.primary}>
                Цена + остаток + publish
              </button>
            </form>
            <div className={styles.records}>
              {offers.slice(0, 5).map((offer) => (
                <div className={styles.record} key={offer.id}>
                  <div>
                    <strong>
                      {offer.productVariant.product.canonicalName}
                    </strong>
                    <small>
                      {offer.status} · {offer.publication?.status ?? "DRAFT"} ·
                      v{offer.version}
                    </small>
                  </div>
                  <b>
                    {offer.prices.find(({ status }) => status === "ACTIVE")
                      ?.amountMinor ?? "—"}{" "}
                    KZT¢
                  </b>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <header>
              <span>04</span>
              <div>
                <h3>Партии и атомарный резерв</h3>
                <p>FEFO, freshness и доступность по складу.</p>
              </div>
            </header>
            <form className={styles.form} onSubmit={createLot}>
              <label className={styles.wide}>
                Balance
                <select name="balanceId" required>
                  <option value="">Выберите</option>
                  {balances.map((balance) => (
                    <option key={balance.id} value={balance.id}>
                      {balance.productVariant.product.canonicalName} · доступно{" "}
                      {balance.quantityAvailable}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Номер партии
                <input name="lotNumber" required placeholder="LOT-2026-001" />
              </label>
              <label>
                Годен до
                <input name="expirationDate" type="date" required />
              </label>
              <label>
                Количество
                <input name="quantityOnHand" type="number" min="0" required />
              </label>
              <button className={styles.secondary}>Добавить lot</button>
            </form>
            <form className={styles.form} onSubmit={reserve}>
              <label>
                Balance
                <select name="balanceId" required>
                  <option value="">Выберите</option>
                  {balances.map((balance) => (
                    <option key={balance.id} value={balance.id}>
                      {balance.warehouse.code} · {balance.quantityAvailable}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Количество
                <input
                  name="quantity"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  required
                />
              </label>
              <label className={styles.wide}>
                Idempotency key
                <input
                  name="idempotencyKey"
                  minLength={8}
                  required
                  placeholder="checkout-demo-001"
                />
              </label>
              <button className={styles.primary}>Зарезервировать</button>
            </form>
            <div className={styles.records}>
              {balances.slice(0, 5).map((balance) => (
                <div className={styles.record} key={balance.id}>
                  <div>
                    <strong>
                      {balance.productVariant.product.canonicalName}
                    </strong>
                    <small>
                      {balance.warehouse.name} · {balance.freshnessStatus} ·
                      lots {balance.lots.length}
                    </small>
                  </div>
                  <b>
                    {balance.quantityAvailable} / {balance.quantityOnHand}
                  </b>
                </div>
              ))}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
