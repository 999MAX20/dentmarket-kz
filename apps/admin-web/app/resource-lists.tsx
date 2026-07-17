"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./resource-lists.module.css";
import { adminAuthHeaders } from "./admin-auth";

type Organization = {
  id: string;
  displayName: string;
  legalName: string;
  bin: string;
  capabilities: Array<{ capability: string }>;
};

type Product = {
  id: string;
  canonicalName: string;
  status: string;
  productType: string;
  variants: Array<{ id: string }>;
  categories: Array<{ category: { nameRu: string } }>;
};

type LoadState<T> = {
  status: "loading" | "ready" | "error";
  data: T;
  message?: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

const capabilityLabels: Record<string, string> = {
  BUYER: "Покупатель",
  SUPPLIER: "Поставщик",
  IMPORTER: "Импортёр",
  LOGISTICS_PROVIDER: "Логистика",
  SERVICE_PROVIDER: "Сервис",
  MARKETPLACE_OPERATOR: "Оператор",
  PAYMENT_PARTNER: "Платёжный партнёр",
};

export function ResourceLists() {
  const [organizations, setOrganizations] = useState<LoadState<Organization[]>>(
    { status: "loading", data: [] },
  );
  const [products, setProducts] = useState<LoadState<Product[]>>({
    status: "loading",
    data: [],
  });

  const load = useCallback(async () => {
    setOrganizations((current) => ({ ...current, status: "loading" }));
    setProducts((current) => ({ ...current, status: "loading" }));
    const loadResource = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        headers: adminAuthHeaders(false),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`API вернул статус ${response.status}`);
      return response.json() as Promise<T>;
    };
    const [organizationResult, productResult] = await Promise.allSettled([
      loadResource<Organization[]>("/organizations"),
      loadResource<Product[]>("/catalog/products"),
    ]);
    setOrganizations(
      organizationResult.status === "fulfilled"
        ? { status: "ready", data: organizationResult.value }
        : {
            status: "error",
            data: [],
            message:
              "Не удалось загрузить организации. Проверьте API и PostgreSQL.",
          },
    );
    setProducts(
      productResult.status === "fulfilled"
        ? { status: "ready", data: productResult.value }
        : {
            status: "error",
            data: [],
            message:
              "Не удалось загрузить каталог. Проверьте API и PostgreSQL.",
          },
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className={styles.section} aria-label="Операционные данные">
      <div className={styles.sectionHeader}>
        <div>
          <h2>Операционные данные</h2>
          <p>Последние организации и мастер-карточки из API.</p>
        </div>
        <button onClick={() => void load()} className={styles.refreshButton}>
          Обновить
        </button>
      </div>
      <div className={styles.columns}>
        <ResourcePanel
          title="Организации"
          state={organizations}
          empty="Организации пока не созданы."
        >
          {organizations.data.slice(0, 6).map((organization) => (
            <article className={styles.row} key={organization.id}>
              <div>
                <strong>{organization.displayName}</strong>
                <span>{organization.legalName}</span>
              </div>
              <div className={styles.rowMeta}>
                <span>БИН {organization.bin}</span>
                <span>
                  {organization.capabilities
                    .map(
                      ({ capability }) =>
                        capabilityLabels[capability] ?? capability,
                    )
                    .join(", ")}
                </span>
              </div>
            </article>
          ))}
        </ResourcePanel>
        <ResourcePanel
          title="Центральный каталог"
          state={products}
          empty="Мастер-карточки пока не созданы."
        >
          {products.data.slice(0, 6).map((product) => (
            <article className={styles.row} key={product.id}>
              <div>
                <strong>{product.canonicalName}</strong>
                <span>
                  {product.categories
                    .map(({ category }) => category.nameRu)
                    .join(", ") || "Без категории"}
                </span>
              </div>
              <div className={styles.rowMeta}>
                <span>{product.productType}</span>
                <span>Вариантов: {product.variants.length}</span>
              </div>
            </article>
          ))}
        </ResourcePanel>
      </div>
    </section>
  );
}

function ResourcePanel<T>({
  title,
  state,
  empty,
  children,
}: {
  title: string;
  state: LoadState<T[]>;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.panel} aria-busy={state.status === "loading"}>
      <div className={styles.panelHeader}>
        <h3>{title}</h3>
        <span>{state.status === "ready" ? state.data.length : ""}</span>
      </div>
      {state.status === "loading" && (
        <div className={styles.skeletons} aria-label="Загрузка">
          <i />
          <i />
          <i />
        </div>
      )}
      {state.status === "error" && (
        <div className={styles.error} role="alert">
          <strong>Источник недоступен</strong>
          <span>{state.message}</span>
        </div>
      )}
      {state.status === "ready" && state.data.length === 0 && (
        <div className={styles.empty}>
          <strong>Нет данных</strong>
          <span>{empty}</span>
        </div>
      )}
      {state.status === "ready" && state.data.length > 0 && (
        <div className={styles.rows}>{children}</div>
      )}
    </div>
  );
}
