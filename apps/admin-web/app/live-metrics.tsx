"use client";

import { useEffect, useState } from "react";
import styles from "./page.module.css";
import { adminAuthHeaders } from "./admin-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";

export function LiveMetrics() {
  const [values, setValues] = useState<Array<[string, string]>>([
    ["...", "Организаций"],
    ["...", "Товаров в каталоге"],
    ["...", "Доступных permissions"],
  ]);
  useEffect(() => {
    const headers = adminAuthHeaders(false);
    void Promise.all([
      fetch(`${apiUrl}/organizations`, { headers }).then((response) =>
        response.json(),
      ),
      fetch(`${apiUrl}/catalog/products`, { headers }).then((response) =>
        response.json(),
      ),
      fetch(`${apiUrl}/access-control/permissions`, { headers }).then(
        (response) => response.json(),
      ),
    ])
      .then(([organizations, products, permissions]) => {
        setValues([
          [String(organizations.length), "Организаций"],
          [String(products.length), "Товаров в каталоге"],
          [String(permissions.length), "Доступных permissions"],
        ]);
      })
      .catch(() =>
        setValues([
          ["-", "Организаций"],
          ["-", "Товаров в каталоге"],
          ["-", "Доступных permissions"],
        ]),
      );
  }, []);
  return (
    <section className={styles.lower} aria-label="Показатели данных">
      {values.map(([value, label]) => (
        <div className={styles.metric} key={label}>
          <span className={styles.metricHeading}>{label}</span>
          <div className={styles.metricValue}>{value}</div>
          <div className={styles.metricLabel}>Текущее локальное окружение</div>
        </div>
      ))}
    </section>
  );
}
