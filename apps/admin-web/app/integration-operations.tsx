"use client";

import { Button } from "@fluentui/react-components";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  Key20Regular,
  Link20Regular,
  Play20Regular,
} from "@fluentui/react-icons";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import styles from "./integration-operations.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Supplier = {
  organizationId: string;
  organization: { displayName: string };
};
type Binding = {
  id: string;
  dataType: string;
  warehouseId?: string | null;
  offerId?: string | null;
  priority: number;
  status: string;
};
type Mapping = {
  id: string;
  entityType: string;
  externalId: string;
  internalId?: string | null;
  status: string;
};
type Agent = {
  agentId: string;
  status: string;
  version?: string | null;
  lastHeartbeatAt?: string | null;
};
type Connection = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  displayName: string;
  version: number;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  bindings: Binding[];
  mappings: Mapping[];
  agent?: Agent | null;
  _count: {
    jobs: number;
    webhookEvents: number;
    reconciliationEntries: number;
    externalReservations: number;
  };
};
type Job = {
  id: string;
  type: string;
  status: string;
  trigger: string;
  attempt: number;
  maxAttempts: number;
  lastError?: string | null;
  createdAt: string;
};
type Reconciliation = {
  id: string;
  kind: string;
  status: string;
  externalRef?: string | null;
  resolution?: string | null;
  detectedAt: string;
};
type CreateResult = {
  connection: Connection;
  enrollment?: { agentId: string; enrollmentToken: string; expiresAt: string };
  webhook?: { endpointPath: string; signingSecret: string };
};
type Warehouse = { id: string; code: string; name: string };
type Offer = {
  id: string;
  productVariantId: string;
  supplierSku?: string | null;
  productVariant: { product: { canonicalName: string } };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const dataTypes = [
  "CATALOG",
  "PRICE",
  "INVENTORY",
  "ORDER",
  "RESERVATION",
  "SHIPMENT",
  "RETURN",
  "IMAGE",
];
const jobTypes = [
  "TEST_CONNECTION",
  "DISCOVER",
  "CATALOG_SYNC",
  "INCREMENTAL_SYNC",
  "PRICE_SYNC",
  "INVENTORY_SYNC",
  "RECONCILIATION",
];

function providerLabel(provider: string) {
  return provider === "ONE_C"
    ? "1С Agent"
    : provider === "MOYSKLAD"
      ? "МойСклад"
      : provider === "MOCK"
        ? "Mock"
        : provider;
}
function dateTime(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("ru-KZ", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "Нет данных";
}

export function IntegrationOperations() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [connectionId, setConnectionId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [oneTimeSecret, setOneTimeSecret] = useState<{
    title: string;
    lines: string[];
  } | null>(null);
  const [provider, setProvider] = useState("MOCK");
  const [mappingType, setMappingType] = useState<"WAREHOUSE" | "VARIANT">(
    "WAREHOUSE",
  );

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: { ...adminAuthHeaders(), ...init?.headers },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string | string[];
        } | null;
        const detail = Array.isArray(payload?.message)
          ? payload.message.join(", ")
          : payload?.message;
        throw new Error(detail ?? `API вернул статус ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    [],
  );

  const loadDetails = useCallback(
    async (activeSupplierId: string, activeConnectionId: string) => {
      if (!activeConnectionId) {
        setJobs([]);
        setReconciliation([]);
        return;
      }
      const [jobData, reconciliationData] = await Promise.all([
        request<Job[]>(
          `/suppliers/${activeSupplierId}/integrations/${activeConnectionId}/jobs`,
        ),
        request<Reconciliation[]>(
          `/suppliers/${activeSupplierId}/integrations/${activeConnectionId}/reconciliation?limit=30`,
        ),
      ]);
      setJobs(jobData);
      setReconciliation(reconciliationData);
    },
    [request],
  );

  const loadSupplier = useCallback(
    async (activeSupplierId: string, preferredConnectionId?: string) => {
      const [connectionData, warehouseData, offerData] = await Promise.all([
        request<Connection[]>(`/suppliers/${activeSupplierId}/integrations`),
        request<Warehouse[]>(`/suppliers/${activeSupplierId}/warehouses`),
        request<Offer[]>(`/suppliers/${activeSupplierId}/offers`),
      ]);
      const activeConnectionId =
        preferredConnectionId &&
        connectionData.some(({ id }) => id === preferredConnectionId)
          ? preferredConnectionId
          : (connectionData[0]?.id ?? "");
      setConnections(connectionData);
      setWarehouses(warehouseData);
      setOffers(offerData);
      setConnectionId(activeConnectionId);
      await loadDetails(activeSupplierId, activeConnectionId);
    },
    [loadDetails, request],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supplierData = await request<Supplier[]>("/suppliers");
      const activeSupplierId =
        supplierId || supplierData[0]?.organizationId || "";
      setSuppliers(supplierData);
      if (!supplierId && activeSupplierId) setSupplierId(activeSupplierId);
      if (activeSupplierId) await loadSupplier(activeSupplierId, connectionId);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Интеграции недоступны.",
      );
    } finally {
      setLoading(false);
    }
  }, [connectionId, loadSupplier, request, supplierId]);

  useEffect(() => {
    void load();
  }, []);

  const selected = useMemo(
    () => connections.find(({ id }) => id === connectionId) ?? null,
    [connectionId, connections],
  );
  const counts = useMemo(
    () => ({
      active: connections.filter(({ status }) => status === "ACTIVE").length,
      queued: jobs.filter(({ status }) =>
        ["PENDING", "FAILED", "RUNNING"].includes(status),
      ).length,
      dead: jobs.filter(({ status }) => status === "DEAD_LETTER").length,
      mismatches: reconciliation.filter(
        ({ status }) => status !== "MATCHED" && status !== "RESOLVED",
      ).length,
    }),
    [connections, jobs, reconciliation],
  );

  async function act(
    action: () => Promise<unknown>,
    success: string,
    preferredConnectionId = connectionId,
  ) {
    if (!supplierId) return;
    setWorking(true);
    try {
      await action();
      await loadSupplier(supplierId, preferredConnectionId);
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Операция не выполнена.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function createConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const token = String(data.get("accessToken") ?? "").trim();
    const enableWebhook = data.get("enableWebhook") === "on";
    setWorking(true);
    try {
      const result = await request<CreateResult>(
        `/suppliers/${supplierId}/integrations`,
        {
          method: "POST",
          body: JSON.stringify({
            provider,
            mode:
              provider === "ONE_C" ? "AGENT" : enableWebhook ? "HYBRID" : "API",
            displayName: data.get("displayName"),
            ...(token ? { credentials: { accessToken: token } } : {}),
            enableWebhook,
            configuration: provider === "MOCK" ? { mockCatalog: [] } : {},
          }),
        },
      );
      const lines = result.enrollment
        ? [
            `Agent ID: ${result.enrollment.agentId}`,
            `Enrollment token: ${result.enrollment.enrollmentToken}`,
            `Действует до: ${dateTime(result.enrollment.expiresAt)}`,
          ]
        : result.webhook
          ? [
              `Endpoint: ${result.webhook.endpointPath}`,
              `Signing secret: ${result.webhook.signingSecret}`,
            ]
          : [];
      setOneTimeSecret(
        lines.length ? { title: "Сохраните данные сейчас", lines } : null,
      );
      form.reset();
      await loadSupplier(supplierId, result.connection.id);
      setMessage(
        "Подключение создано. Первичная проверка поставлена в очередь.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Подключение не создано.",
      );
    } finally {
      setWorking(false);
    }
  }

  function createBinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const scope = String(data.get("scope") ?? "global");
    const scoped = scope.startsWith("warehouse:")
      ? { warehouseId: scope.slice(10) }
      : scope.startsWith("offer:")
        ? { offerId: scope.slice(6) }
        : {};
    return act(
      () =>
        request(
          `/suppliers/${supplierId}/integrations/${selected.id}/bindings`,
          {
            method: "POST",
            body: JSON.stringify({
              dataType: data.get("dataType"),
              priority: Number(data.get("priority") || 100),
              ...scoped,
            }),
          },
        ),
      "Привязка данных создана.",
    );
  }

  function upsertMapping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    const form = event.currentTarget;
    return act(async () => {
      await request(
        `/suppliers/${supplierId}/integrations/${selected.id}/mappings`,
        {
          method: "POST",
          body: JSON.stringify({
            entityType: mappingType,
            externalId: data.get("externalId"),
            internalId: data.get("internalId"),
          }),
        },
      );
      form.reset();
    }, "Маппинг внешней сущности сохранён.");
  }

  function enqueueJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const type = String(new FormData(event.currentTarget).get("jobType"));
    return act(
      () =>
        request(`/suppliers/${supplierId}/integrations/${selected.id}/jobs`, {
          method: "POST",
          body: JSON.stringify({
            type,
            idempotencyKey: `ui-${type.toLowerCase()}-${Date.now()}`,
          }),
        }),
      "Задание добавлено в надёжную очередь.",
    );
  }

  function changeStatus(status: "ACTIVE" | "PAUSED" | "REVOKED") {
    if (!selected) return;
    return act(
      () =>
        request(`/suppliers/${supplierId}/integrations/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ version: selected.version, status }),
        }),
      status === "PAUSED"
        ? "Подключение приостановлено."
        : status === "ACTIVE"
          ? "Подключение активно."
          : "Доступ подключения отозван.",
    );
  }

  async function rotateEnrollment() {
    if (!selected) return;
    setWorking(true);
    try {
      const result = await request<{
        agentId: string;
        enrollmentToken: string;
        expiresAt: string;
      }>(
        `/suppliers/${supplierId}/integrations/${selected.id}/agent/enrollment`,
        { method: "POST" },
      );
      setOneTimeSecret({
        title: "Новый enrollment token",
        lines: [
          `Agent ID: ${result.agentId}`,
          `Enrollment token: ${result.enrollmentToken}`,
          `Действует до: ${dateTime(result.expiresAt)}`,
        ],
      });
      await loadSupplier(supplierId, selected.id);
      setMessage("Токен агента перевыпущен. Старый токен недействителен.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Токен не перевыпущен.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section
      id="integration-operations"
      className={styles.section}
      aria-label="Интеграции поставщика"
    >
      <div className={styles.heading}>
        <div>
          <h2>Интеграции и внешние резервы</h2>
          <p>
            МойСклад, 1С Agent, очереди синхронизации, webhooks и сверка
            расхождений.
          </p>
        </div>
        <div className={styles.toolbar}>
          <label>
            Поставщик
            <select
              value={supplierId}
              onChange={(event) => {
                const id = event.target.value;
                setSupplierId(id);
                void loadSupplier(id);
              }}
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
          </label>
          <Button
            appearance="outline"
            icon={<ArrowClockwise20Regular />}
            onClick={() => void load()}
            disabled={working}
          >
            Обновить
          </Button>
        </div>
      </div>

      {message && (
        <div className={styles.notice} role="status">
          {message}
        </div>
      )}
      {oneTimeSecret && (
        <div className={styles.secret} role="alert">
          <Key20Regular />
          <div>
            <strong>{oneTimeSecret.title}</strong>
            {oneTimeSecret.lines.map((line) => (
              <code key={line}>{line}</code>
            ))}
          </div>
          <button
            aria-label="Закрыть данные подключения"
            onClick={() => setOneTimeSecret(null)}
          >
            Закрыть
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.loading} aria-label="Загрузка интеграций">
          <i />
          <i />
          <i />
        </div>
      ) : (
        <>
          <div className={styles.metrics}>
            <div>
              <span>Активные</span>
              <strong>{counts.active}</strong>
            </div>
            <div>
              <span>В очереди</span>
              <strong>{counts.queued}</strong>
            </div>
            <div>
              <span>Dead-letter</span>
              <strong>{counts.dead}</strong>
            </div>
            <div>
              <span>Расхождения</span>
              <strong>{counts.mismatches}</strong>
            </div>
          </div>
          <div className={styles.layout}>
            <div className={styles.connectionPane}>
              <form
                className={styles.createForm}
                onSubmit={(event) => void createConnection(event)}
              >
                <header>
                  <div>
                    <h3>Новое подключение</h3>
                    <p>Секреты шифруются и не возвращаются повторно.</p>
                  </div>
                  <Add20Regular />
                </header>
                <label>
                  Провайдер
                  <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value)}
                  >
                    <option value="MOCK">Mock для проверки</option>
                    <option value="MOYSKLAD">МойСклад API</option>
                    <option value="ONE_C">1С Connector Agent</option>
                  </select>
                </label>
                <label>
                  Название
                  <input
                    name="displayName"
                    required
                    minLength={2}
                    placeholder="Основной склад"
                  />
                </label>
                {provider === "MOYSKLAD" && (
                  <label className={styles.full}>
                    Access token
                    <input
                      name="accessToken"
                      type="password"
                      required
                      autoComplete="new-password"
                    />
                  </label>
                )}
                <label className={`${styles.check} ${styles.full}`}>
                  <input name="enableWebhook" type="checkbox" /> Создать webhook
                  endpoint
                </label>
                <Button
                  className={styles.full}
                  type="submit"
                  appearance="primary"
                  icon={<Link20Regular />}
                  disabled={working}
                >
                  Подключить
                </Button>
              </form>

              <div className={styles.connectionList}>
                <header>
                  <h3>Подключения</h3>
                  <span>{connections.length}</span>
                </header>
                {connections.length === 0 ? (
                  <div className={styles.empty}>
                    Подключений пока нет. Создайте первый источник данных.
                  </div>
                ) : (
                  connections.map((connection) => (
                    <button
                      key={connection.id}
                      className={
                        connection.id === connectionId
                          ? styles.connectionActive
                          : ""
                      }
                      onClick={() => {
                        setConnectionId(connection.id);
                        void loadDetails(supplierId, connection.id);
                      }}
                    >
                      <span>
                        <strong>{connection.displayName}</strong>
                        <small>
                          {providerLabel(connection.provider)} /{" "}
                          {connection.mode}
                        </small>
                      </span>
                      <em data-status={connection.status}>
                        {connection.status}
                      </em>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className={styles.detailPane}>
              {!selected ? (
                <div className={styles.empty}>
                  Выберите подключение для управления.
                </div>
              ) : (
                <>
                  <header className={styles.detailHeader}>
                    <div>
                      <h3>{selected.displayName}</h3>
                      <p>
                        {providerLabel(selected.provider)}. Последний успех:{" "}
                        {dateTime(selected.lastSuccessAt)}
                      </p>
                    </div>
                    <div className={styles.statusActions}>
                      {selected.status === "PAUSED" ? (
                        <Button
                          appearance="primary"
                          onClick={() => void changeStatus("ACTIVE")}
                          disabled={working}
                        >
                          Возобновить
                        </Button>
                      ) : (
                        selected.status !== "REVOKED" && (
                          <Button
                            appearance="outline"
                            onClick={() => void changeStatus("PAUSED")}
                            disabled={working}
                          >
                            Пауза
                          </Button>
                        )
                      )}
                      {selected.status !== "REVOKED" && (
                        <Button
                          appearance="subtle"
                          onClick={() => void changeStatus("REVOKED")}
                          disabled={working}
                        >
                          Отозвать
                        </Button>
                      )}
                    </div>
                  </header>
                  {selected.lastError && (
                    <div className={styles.error}>
                      <strong>Последняя ошибка</strong>
                      <span>{selected.lastError}</span>
                    </div>
                  )}
                  {selected.agent && (
                    <div className={styles.agent}>
                      <span>
                        <strong>1С Agent</strong>
                        <small>{selected.agent.agentId}</small>
                      </span>
                      <span>
                        <b>{selected.agent.status}</b>
                        <small>
                          Heartbeat: {dateTime(selected.agent.lastHeartbeatAt)}
                        </small>
                      </span>
                      <Button
                        icon={<Key20Regular />}
                        appearance="outline"
                        onClick={() => void rotateEnrollment()}
                        disabled={working}
                      >
                        Новый token
                      </Button>
                    </div>
                  )}

                  <div className={styles.controls}>
                    <form onSubmit={(event) => void createBinding(event)}>
                      <h4>Привязать поток</h4>
                      <label>
                        Тип данных
                        <select name="dataType">
                          {dataTypes.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Область
                        <select name="scope">
                          <option value="global">Весь поставщик</option>
                          {warehouses.map((warehouse) => (
                            <option
                              key={warehouse.id}
                              value={`warehouse:${warehouse.id}`}
                            >
                              Склад: {warehouse.name}
                            </option>
                          ))}
                          {offers.map((offer) => (
                            <option key={offer.id} value={`offer:${offer.id}`}>
                              Оффер:{" "}
                              {offer.supplierSku ??
                                offer.productVariant.product.canonicalName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Приоритет
                        <input
                          name="priority"
                          type="number"
                          min="0"
                          defaultValue="100"
                        />
                      </label>
                      <Button
                        type="submit"
                        appearance="outline"
                        disabled={working}
                      >
                        Добавить
                      </Button>
                    </form>
                    <form onSubmit={(event) => void enqueueJob(event)}>
                      <h4>Запустить задание</h4>
                      <label>
                        Операция
                        <select name="jobType">
                          {jobTypes.map((type) => (
                            <option key={type}>{type}</option>
                          ))}
                        </select>
                      </label>
                      <Button
                        type="submit"
                        appearance="primary"
                        icon={<Play20Regular />}
                        disabled={working}
                      >
                        В очередь
                      </Button>
                    </form>
                    <form onSubmit={(event) => void upsertMapping(event)}>
                      <h4>Сопоставить внешний ID</h4>
                      <label>
                        Сущность
                        <select
                          value={mappingType}
                          onChange={(event) =>
                            setMappingType(
                              event.target.value as "WAREHOUSE" | "VARIANT",
                            )
                          }
                        >
                          <option value="WAREHOUSE">Склад</option>
                          <option value="VARIANT">Вариант товара</option>
                        </select>
                      </label>
                      <label>
                        Внешний ID
                        <input
                          name="externalId"
                          required
                          placeholder={
                            mappingType === "WAREHOUSE"
                              ? "store UUID"
                              : "product UUID"
                          }
                        />
                      </label>
                      <label>
                        Внутренняя сущность
                        <select name="internalId" required>
                          {mappingType === "WAREHOUSE"
                            ? warehouses.map((warehouse) => (
                                <option key={warehouse.id} value={warehouse.id}>
                                  {warehouse.name} / {warehouse.code}
                                </option>
                              ))
                            : offers.map((offer) => (
                                <option
                                  key={offer.productVariantId}
                                  value={offer.productVariantId}
                                >
                                  {offer.productVariant.product.canonicalName} /{" "}
                                  {offer.supplierSku ?? "без SKU"}
                                </option>
                              ))}
                        </select>
                      </label>
                      <Button
                        type="submit"
                        appearance="outline"
                        disabled={working}
                      >
                        Сохранить
                      </Button>
                    </form>
                  </div>

                  <section className={styles.bindings}>
                    <header>
                      <h4>Потоки данных</h4>
                      <span>{selected.bindings.length}</span>
                    </header>
                    {selected.bindings.length === 0 ? (
                      <div className={styles.empty}>
                        Нет привязок. Данные не будут импортироваться или
                        экспортироваться.
                      </div>
                    ) : (
                      <div>
                        {selected.bindings.map((binding) => (
                          <span key={binding.id}>
                            <b>{binding.dataType}</b>
                            <small>priority {binding.priority}</small>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className={styles.bindings}>
                    <header>
                      <h4>Маппинги</h4>
                      <span>{selected.mappings.length}</span>
                    </header>
                    {selected.mappings.length === 0 ? (
                      <div className={styles.empty}>
                        Нет маппингов. Для нескольких складов и неоднозначных
                        товаров укажите соответствия.
                      </div>
                    ) : (
                      <div>
                        {selected.mappings.map((mapping) => (
                          <span key={mapping.id}>
                            <b>{mapping.entityType}</b>
                            <small>
                              {mapping.externalId} →{" "}
                              {mapping.internalId?.slice(0, 8) ?? "metadata"}
                            </small>
                          </span>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className={styles.activityGrid}>
                    <section>
                      <header>
                        <h4>Очередь заданий</h4>
                        <span>{jobs.length}</span>
                      </header>
                      {jobs.length === 0 ? (
                        <div className={styles.empty}>Заданий нет.</div>
                      ) : (
                        <div className={styles.rows}>
                          {jobs.slice(0, 8).map((job) => (
                            <div key={job.id}>
                              <span>
                                <b>{job.type}</b>
                                <small>
                                  {job.trigger} / попытка {job.attempt} из{" "}
                                  {job.maxAttempts}
                                </small>
                              </span>
                              <em data-status={job.status}>{job.status}</em>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      <header>
                        <h4>Сверка</h4>
                        <span>{reconciliation.length}</span>
                      </header>
                      {reconciliation.length === 0 ? (
                        <div className={styles.empty}>
                          Расхождений не обнаружено.
                        </div>
                      ) : (
                        <div className={styles.rows}>
                          {reconciliation.slice(0, 8).map((entry) => (
                            <div key={entry.id}>
                              <span>
                                <b>{entry.kind}</b>
                                <small>{dateTime(entry.detectedAt)}</small>
                              </span>
                              <em data-status={entry.status}>{entry.status}</em>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
