"use client";

import { Button, Spinner } from "@fluentui/react-components";
import {
  ArrowSync20Regular,
  Document20Regular,
  Money20Regular,
  Search20Regular,
  Send20Regular,
  ShieldCheckmark20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import styles from "./platform-assurance.module.css";
import { adminAuthHeaders } from "./admin-auth";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4012/api";
const buyerId = "00000000-0000-4000-8000-000000000030";
const operatorId = "00000000-0000-4000-8000-000000000001";

type Summary = {
  products: number;
  documents: number;
  signedDocuments: number;
  activeRules: number;
  blockedChecks: number;
  notifications: number;
  paymentProviders: number;
};

const initial: Summary = {
  products: 0,
  documents: 0,
  signedDocuments: 0,
  activeRules: 0,
  blockedChecks: 0,
  notifications: 0,
  paymentProviders: 0,
};

export function PlatformAssurance() {
  const [summary, setSummary] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${apiUrl}${path}`, {
        ...init,
        cache: "no-store",
        headers: { ...adminAuthHeaders(), ...init?.headers },
      });
      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) : null;
      if (!response.ok)
        throw new Error(
          typeof payload === "object" && payload && "message" in payload
            ? String(payload.message)
            : `Не удалось выполнить запрос (${response.status})`,
        );
      return payload as T;
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [search, documents, rules, checks, notifications, providers] =
        await Promise.all([
          request<{ total: number }>(
            `/marketplace/search?buyerOrganizationId=${buyerId}&q=&limit=100`,
          ),
          request<Array<{ status: string }>>("/documents?limit=200"),
          request<Array<{ status: string }>>("/compliance/rules"),
          request<Array<{ decision: string; status: string }>>(
            "/compliance/checks",
          ),
          request<Array<unknown>>(
            `/notifications/organizations/${operatorId}?limit=200`,
          ),
          request<Array<unknown>>("/payment-providers"),
        ]);
      setSummary({
        products: search.total,
        documents: documents.length,
        signedDocuments: documents.filter(({ status }) => status === "SIGNED")
          .length,
        activeRules: rules.filter(({ status }) => status === "ACTIVE").length,
        blockedChecks: checks.filter(
          ({ decision, status }) =>
            decision === "BLOCKED" || status === "FAILED",
        ).length,
        notifications: notifications.length,
        paymentProviders: providers.length,
      });
      setMessage("");
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : "Раздел контроля недоступен",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: "search" | "notifications") => {
    setWorking(action);
    setMessage("");
    setFailed(false);
    try {
      const result =
        action === "search"
          ? await request<unknown>("/marketplace/search/rebuild", {
              method: "POST",
            })
          : await request<unknown>("/notifications/process", {
              method: "POST",
            });
      setMessage(
        action === "search"
          ? "Поисковая проекция перестроена."
          : "Очередь уведомлений обработана.",
      );
      await load();
      void result;
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : "Операция завершилась ошибкой",
      );
    } finally {
      setWorking(null);
    }
  };

  const metrics: Array<[string, number | string]> = [
    ["Товары в поиске", summary.products],
    ["Документы", summary.documents],
    ["Подписано", summary.signedDocuments],
    ["Активные правила", summary.activeRules],
    ["Блокирующие проверки", summary.blockedChecks],
    ["Уведомления", summary.notifications],
  ];

  return (
    <section
      className={styles.section}
      aria-label="Готовность DentMarket"
    >
      <div className={styles.header}>
        <div>
          <h2>Готовность DentMarket</h2>
          <p>
            Поиск, документы, проверки, уведомления и платежи из действующего
            API.
          </p>
        </div>
        <div className={styles.actions}>
          <Button
            icon={
              working === "search" ? (
                <Spinner size="tiny" />
              ) : (
                <Search20Regular />
              )
            }
            onClick={() => void run("search")}
            disabled={Boolean(working)}
          >
            Перестроить поиск
          </Button>
          <Button
            icon={
              working === "notifications" ? (
                <Spinner size="tiny" />
              ) : (
                <Send20Regular />
              )
            }
            onClick={() => void run("notifications")}
            disabled={Boolean(working)}
          >
            Обработать очередь
          </Button>
          <Button
            appearance="subtle"
            icon={<ArrowSync20Regular />}
            onClick={() => void load()}
            disabled={loading}
          >
            Обновить
          </Button>
        </div>
      </div>
      <div className={styles.metrics}>
        {metrics.map(([label, value]) => (
          <div className={styles.metric} key={label}>
            <span>{label}</span>
            <strong>{loading ? "..." : value}</strong>
          </div>
        ))}
      </div>
      <div className={styles.systems}>
        <div className={styles.system}>
          <span className={styles.icon}>
            <Document20Regular />
          </span>
          <div>
            <strong>Документооборот</strong>
            <p>PDF и DOCX, версии, хэши, подписи и объектное хранилище.</p>
          </div>
        </div>
        <div className={styles.system}>
          <span className={styles.icon}>
            <ShieldCheckmark20Regular />
          </span>
          <div>
            <strong>Комплаенс</strong>
            <p>
              Версионируемые правила, credentials и автоматическая блокировка.
            </p>
          </div>
        </div>
        <div className={styles.system}>
          <span className={styles.icon}>
            <Send20Regular />
          </span>
          <div>
            <strong>Уведомления</strong>
            <p>Уведомления в кабинете, по email и SMS с повторной отправкой при ошибке.</p>
          </div>
        </div>
        <div className={styles.system}>
          <span className={styles.icon}>
            <Money20Regular />
          </span>
          <div>
            <strong>Платежи</strong>
            <p>
              {summary.paymentProviders} сервисов оплаты, распределение средств,
              журнал операций и выплаты.
            </p>
          </div>
        </div>
      </div>
      {message ? (
        <div
          className={`${styles.message} ${failed ? styles.error : ""}`}
          role={failed ? "alert" : "status"}
        >
          {message}
        </div>
      ) : null}
    </section>
  );
}
