"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { formatAdminStatus } from "./admin-labels";
import styles from "./commerce-foundation.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Industry = { id: string; nameRu: string };
type Category = {
  id: string;
  industryId: string;
  nameRu: string;
  path: string;
};
type Unit = { id: string; nameRu: string; symbol: string };
type Product = {
  id: string;
  canonicalName: string;
  status: string;
  version: number;
  variants: Array<{ id: string; sku?: string | null }>;
};
type Role = { id: string; name: string; code: string };
type ApprovalPolicy = {
  id: string;
  name: string;
  priority: number;
  status: string;
  version: number;
};
type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  createdAt: string;
};
type AuditPage = {
  items: AuditLog[];
  total: number;
  page: number;
  pageCount: number;
};
type Evaluation = {
  requiresApproval: boolean;
  matchedPolicies: Array<{ id: string; name: string; priority: number }>;
  requiredSteps: Array<{
    policyId: string;
    sequence: number;
    approverRoleCodes: string[];
    minApprovals: number;
  }>;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const organizationId =
  process.env.NEXT_PUBLIC_DEV_ORGANIZATION_ID ??
  "00000000-0000-4000-8000-000000000001";

function optionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized === "" ? undefined : Number(normalized);
}

export function CommerceFoundation() {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [policies, setPolicies] = useState<ApprovalPolicy[]>([]);
  const [audit, setAudit] = useState<AuditPage>({
    items: [],
    total: 0,
    page: 1,
    pageCount: 0,
  });
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
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
      const [
        industryData,
        categoryData,
        unitData,
        productData,
        roleData,
        policyData,
        auditData,
      ] = await Promise.all([
        request<Industry[]>("/catalog/industries"),
        request<Category[]>("/catalog/categories"),
        request<Unit[]>("/catalog/units"),
        request<Product[]>("/catalog/products"),
        request<Role[]>(`/organizations/${organizationId}/roles`),
        request<ApprovalPolicy[]>(
          `/organizations/${organizationId}/approval-policies`,
        ),
        request<AuditPage>("/audit?page=1&pageSize=12"),
      ]);
      setIndustries(industryData);
      setCategories(categoryData);
      setUnits(unitData);
      setProducts(productData);
      setRoles(roleData);
      setPolicies(policyData);
      setAudit(auditData);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить операционные формы.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request("/catalog/products", {
        method: "POST",
        body: JSON.stringify({
          canonicalName: data.get("canonicalName"),
          slug: data.get("slug"),
          productType: data.get("productType"),
          industryIds: [data.get("industryId")],
          categoryIds: [data.get("categoryId")],
        }),
      });
      form.reset();
      await load();
      setMessage("Мастер-карточка создана в статусе DRAFT.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать товар.",
      );
    }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await request(`/catalog/products/${data.get("productId")}/variants`, {
        method: "POST",
        body: JSON.stringify({
          sku: String(data.get("sku") ?? "").trim() || null,
          saleUnitId: String(data.get("saleUnitId") ?? "").trim() || null,
          packageQuantity: optionalNumber(data.get("packageQuantity")) ?? null,
        }),
      });
      form.reset();
      await load();
      setMessage("Торговый вариант добавлен.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать вариант.",
      );
    }
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const product = products.find(({ id }) => id === data.get("productId"));
    if (!product) return;
    try {
      await request(`/catalog/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          version: product.version,
          status: data.get("status"),
        }),
      });
      await load();
      setMessage(
        `Статус обновлён; версия товара была ${product.version}, теперь ${product.version + 1}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось обновить товар.",
      );
    }
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const amountMinMinor = optionalNumber(data.get("amountMinMinor"));
    const amountMaxMinor = optionalNumber(data.get("amountMaxMinor"));
    const currency = String(data.get("currency") ?? "")
      .trim()
      .toUpperCase();
    try {
      await request(`/organizations/${organizationId}/approval-policies`, {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          priority: Number(data.get("priority")),
          status: "ACTIVE",
          conditions: {
            amountMinMinor,
            amountMaxMinor,
            currencies: currency ? [currency] : undefined,
          },
          approvalSteps: [
            {
              sequence: 1,
              approverRoleCodes: [data.get("roleCode")],
              minApprovals: 1,
            },
          ],
        }),
      });
      form.reset();
      await load();
      setMessage("Активная политика согласования создана.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать политику.",
      );
    }
  }

  async function evaluatePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await request<Evaluation>(
        `/organizations/${organizationId}/approval-policies/evaluate`,
        {
          method: "POST",
          body: JSON.stringify({
            amountMinor: Number(data.get("amountMinor")),
            currency: String(data.get("currency")).toUpperCase(),
            urgent: data.get("urgent") === "on",
          }),
        },
      );
      setEvaluation(result);
      setMessage("Политики вычислены по текущему контексту заказа.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Не удалось вычислить политики.",
      );
    }
  }

  async function filterAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const params = new URLSearchParams({ page: "1", pageSize: "12" });
    const entityType = String(data.get("entityType") ?? "").trim();
    const action = String(data.get("action") ?? "").trim();
    if (entityType) params.set("entityType", entityType);
    if (action) params.set("action", action);
    try {
      setAudit(await request<AuditPage>(`/audit?${params}`));
      setMessage("Фильтр журнала применён.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось загрузить аудит.",
      );
    }
  }

  return (
    <section
      id="control-plane"
      className={styles.section}
      aria-label="Товары, согласование и аудит"
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Каталог DentMarket</span>
          <h2>Товары, согласование и аудит</h2>
          <p>
            Рабочие формы поверх реальных API с версионным контролем изменений.
          </p>
        </div>
        <button onClick={() => void load()}>Синхронизировать</button>
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
      ) : (
        <>
          <div className={styles.grid}>
            <article className={styles.panel}>
              <div className={styles.panelTitle}>
                <span>01</span>
                <div>
                  <h3>Мастер-карточка</h3>
                  <p>Классификация обязательна до публикации.</p>
                </div>
              </div>
              <form className={styles.form} onSubmit={createProduct}>
                <label className={styles.wide}>
                  Наименование
                  <input
                    name="canonicalName"
                    required
                    placeholder="Композитный материал светового отверждения"
                  />
                </label>
                <label>
                  Slug
                  <input
                    name="slug"
                    required
                    pattern="[a-z0-9][a-z0-9-]{2,159}"
                    placeholder="light-cure-composite"
                  />
                </label>
                <label>
                  Тип
                  <input name="productType" required defaultValue="material" />
                </label>
                <label>
                  Индустрия
                  <select name="industryId" required>
                    <option value="">Выберите</option>
                    {industries.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nameRu}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Категория
                  <select name="categoryId" required>
                    <option value="">Выберите</option>
                    {categories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nameRu}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={styles.primary}>Создать товар</button>
              </form>
              <form className={styles.form} onSubmit={updateProduct}>
                <label>
                  Товар
                  <select name="productId" required>
                    <option value="">Выберите</option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.canonicalName} · v{item.version}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус
                  <select name="status" defaultValue="UNDER_REVIEW">
                    <option>DRAFT</option>
                    <option>UNDER_REVIEW</option>
                    <option>ACTIVE</option>
                    <option>BLOCKED</option>
                    <option>ARCHIVED</option>
                  </select>
                </label>
                <button className={styles.secondary}>Обновить по версии</button>
              </form>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelTitle}>
                <span>02</span>
                <div>
                  <h3>Торговый вариант</h3>
                  <p>SKU, единица продажи и количество в упаковке.</p>
                </div>
              </div>
              <form className={styles.form} onSubmit={createVariant}>
                <label className={styles.wide}>
                  Мастер-карточка
                  <select name="productId" required>
                    <option value="">Выберите</option>
                    {products.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.canonicalName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  SKU
                  <input name="sku" placeholder="DENT-COMP-A2-4G" />
                </label>
                <label>
                  Единица
                  <select name="saleUnitId">
                    <option value="">Не задана</option>
                    {units.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nameRu} ({item.symbol})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  В упаковке
                  <input
                    name="packageQuantity"
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    placeholder="1"
                  />
                </label>
                <button className={styles.primary}>Добавить вариант</button>
              </form>
              <div className={styles.records}>
                {products.slice(0, 6).map((product) => (
                  <div className={styles.record} key={product.id}>
                    <div>
                      <strong>{product.canonicalName}</strong>
                      <span>
                        Версия {product.version}. {formatAdminStatus(product.status)}
                      </span>
                    </div>
                    <b>{product.variants.length} SKU</b>
                  </div>
                ))}
              </div>
            </article>

            <article id="approval-policies" className={styles.panel}>
              <div className={styles.panelTitle}>
                <span>03</span>
                <div>
                  <h3>Политики согласования</h3>
                  <p>Детерминированные условия и последовательные роли.</p>
                </div>
              </div>
              <form className={styles.form} onSubmit={createPolicy}>
                <label className={styles.wide}>
                  Название
                  <input
                    name="name"
                    required
                    placeholder="Заказы свыше лимита филиала"
                  />
                </label>
                <label>
                  Приоритет
                  <input
                    name="priority"
                    type="number"
                    min="1"
                    defaultValue="100"
                    required
                  />
                </label>
                <label>
                  Роль согласующего
                  <select name="roleCode" required>
                    <option value="">Выберите</option>
                    {roles.map((role) => (
                      <option value={role.code} key={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Сумма от, тиын
                  <input
                    name="amountMinMinor"
                    type="number"
                    min="0"
                    placeholder="100000000"
                  />
                </label>
                <label>
                  Сумма до, тиын
                  <input name="amountMaxMinor" type="number" min="0" />
                </label>
                <label>
                  Валюта
                  <input
                    name="currency"
                    defaultValue="KZT"
                    pattern="[A-Za-z]{3}"
                  />
                </label>
                <button className={styles.primary}>Активировать</button>
              </form>
              <form className={styles.form} onSubmit={evaluatePolicy}>
                <label>
                  Сумма, тиын
                  <input
                    name="amountMinor"
                    type="number"
                    min="0"
                    required
                    defaultValue="150000000"
                  />
                </label>
                <label>
                  Валюта
                  <input
                    name="currency"
                    required
                    defaultValue="KZT"
                    pattern="[A-Za-z]{3}"
                  />
                </label>
                <label className={styles.check}>
                  <input name="urgent" type="checkbox" />
                  Срочный заказ
                </label>
                <button className={styles.secondary}>Вычислить</button>
              </form>
              {evaluation && (
                <div
                  className={
                    evaluation.requiresApproval
                      ? styles.decisionYes
                      : styles.decisionNo
                  }
                >
                  <strong>
                    {evaluation.requiresApproval
                      ? "Согласование требуется"
                      : "Можно продолжить без согласования"}
                  </strong>
                  <span>
                    Политик: {evaluation.matchedPolicies.length} · этапов:{" "}
                    {evaluation.requiredSteps.length}
                  </span>
                </div>
              )}
              <div className={styles.records}>
                {policies.slice(0, 6).map((policy) => (
                  <div className={styles.record} key={policy.id}>
                    <div>
                      <strong>{policy.name}</strong>
                      <span>
                        {formatAdminStatus(policy.status)}. Версия {policy.version}
                      </span>
                    </div>
                    <b>P{policy.priority}</b>
                  </div>
                ))}
              </div>
            </article>

            <article id="audit-log" className={styles.panel}>
              <div className={styles.panelTitle}>
                <span>04</span>
                <div>
                  <h3>Журнал аудита</h3>
                  <p>{audit.total} событий в активной организации.</p>
                </div>
              </div>
              <form className={styles.auditFilter} onSubmit={filterAudit}>
                <label>
                  Раздел
                  <input name="entityType" placeholder="Product" />
                </label>
                <label>
                  Действие
                  <input name="action" placeholder="updated" />
                </label>
                <button className={styles.secondary}>Фильтр</button>
              </form>
              <div className={styles.timeline}>
                {audit.items.length === 0 ? (
                  <p>События не найдены.</p>
                ) : (
                  audit.items.map((item) => (
                    <div className={styles.event} key={item.id}>
                      <i />
                      <div>
                        <strong>{item.action}</strong>
                        <span>
                          {item.entityType} · {item.entityId.slice(0, 8)}
                        </span>
                      </div>
                      <time>
                        {new Intl.DateTimeFormat("ru-KZ", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(item.createdAt))}
                      </time>
                    </div>
                  ))
                )}
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
