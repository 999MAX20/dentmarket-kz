"use client";

import {
  Avatar,
  Button,
  FluentProvider,
  Spinner,
  Tag,
  Tooltip,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import {
  Dismiss24Regular,
  Navigation24Regular,
  SignOut24Regular,
  WeatherMoon24Regular,
  WeatherSunny24Regular,
} from "@fluentui/react-icons";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  mode: ThemeMode;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  toggle: () => undefined,
});

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("marketplace-theme");
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    if (stored === "light" || stored === "dark") setMode(stored);
    else setMode(media.matches ? "dark" : "light");
  }, []);

  const value = useMemo(
    () => ({
      mode,
      toggle: () =>
        setMode((current) => {
          const next = current === "light" ? "dark" : "light";
          window.localStorage.setItem("marketplace-theme", next);
          return next;
        }),
    }),
    [mode],
  );

  return (
    <ThemeContext.Provider value={value}>
      <FluentProvider
        className="mp-provider"
        theme={mode === "dark" ? webDarkTheme : webLightTheme}
      >
        {children}
      </FluentProvider>
    </ThemeContext.Provider>
  );
}

export type NavigationItem = {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: string;
};

type AppShellProps = {
  productName: string;
  productMark: string;
  workspaceLabel: string;
  userName: string;
  userMeta: string;
  navigation: NavigationItem[];
  activeNavigation: string;
  contextLabel?: string;
  onNavigate: (id: string) => void;
  onLogout?: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

export function AppShell({
  productName,
  productMark,
  workspaceLabel,
  userName,
  userMeta,
  navigation,
  activeNavigation,
  contextLabel,
  onNavigate,
  onLogout,
  actions,
  children,
}: AppShellProps) {
  const { mode, toggle } = useContext(ThemeContext);
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigate = (id: string) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <div className="mp-shell">
      <aside
        className={`mp-sidebar${mobileOpen ? " is-open" : ""}`}
        aria-label="Основная навигация"
      >
        <div className="mp-brand">
          <span className="mp-brand-mark" aria-hidden="true">
            {productMark}
          </span>
          <span>
            <strong>{productName}</strong>
            <small>{workspaceLabel}</small>
          </span>
          <Button
            className="mp-mobile-close"
            appearance="subtle"
            icon={<Dismiss24Regular />}
            aria-label="Закрыть меню"
            onClick={() => setMobileOpen(false)}
          />
        </div>

        <nav className="mp-navigation">
          {navigation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === activeNavigation ? "is-active" : ""}
              onClick={() => navigate(item.id)}
              aria-current={item.id === activeNavigation ? "page" : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge ? <small>{item.badge}</small> : null}
            </button>
          ))}
        </nav>

        <div className="mp-sidebar-footer">
          <Avatar name={userName} color="colorful" size={32} />
          <span>
            <strong>{userName}</strong>
            <small>{userMeta}</small>
          </span>
          {onLogout ? (
            <Button
              appearance="subtle"
              icon={<SignOut24Regular />}
              aria-label="Выйти"
              title="Выйти"
              onClick={onLogout}
            />
          ) : null}
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="mp-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="mp-workspace">
        <header className="mp-topbar">
          <Button
            className="mp-menu-button"
            appearance="subtle"
            icon={<Navigation24Regular />}
            aria-label="Открыть меню"
            onClick={() => setMobileOpen(true)}
          />
          <span className="mp-topbar-context">
            {contextLabel ?? navigation.find((item) => item.id === activeNavigation)?.label}
          </span>
          <div className="mp-topbar-actions">
            {actions}
            <Tooltip
              content={mode === "light" ? "Тёмная тема" : "Светлая тема"}
              relationship="label"
            >
              <Button
                appearance="subtle"
                icon={
                  mode === "light" ? (
                    <WeatherMoon24Regular />
                  ) : (
                    <WeatherSunny24Regular />
                  )
                }
                onClick={toggle}
              />
            </Tooltip>
          </div>
        </header>
        <main className="mp-content">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mp-page-header">
      <div>
        {eyebrow ? <span className="mp-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="mp-page-actions">{actions}</div> : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
}) {
  return (
    <article className="mp-metric">
      <span className="mp-metric-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
    </article>
  );
}

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export function StatusTag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  const appearance = tone === "neutral" ? "outline" : "filled";
  const color =
    tone === "danger"
      ? "danger"
      : tone === "warning"
        ? "warning"
        : tone === "success"
          ? "success"
          : "brand";
  return (
    <Tag
      className={`mp-status mp-status-${tone}`}
      appearance={appearance}
      shape="rounded"
      size="small"
      {...(tone === "neutral" ? {} : { color })}
    >
      {children}
    </Tag>
  );
}

export function LoadingState({
  label = "Загружаем данные",
}: {
  label?: string;
}) {
  return (
    <div className="mp-state">
      <Spinner size="medium" label={label} />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mp-state mp-empty">
      <span aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Не удалось загрузить данные",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mp-state mp-error">
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Section({
  title,
  description,
  action,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mp-section ${className}`.trim()}>
      {title || description || action ? (
        <header>
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function formatMoney(
  amountMinor: string | number | bigint | null | undefined,
  currency = "KZT",
) {
  if (amountMinor == null) return "По запросу";
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amountMinor) / 100);
}

export function formatDate(
  value: string | Date | null | undefined,
  withTime = false,
) {
  if (!value) return "Нет данных";
  return new Intl.DateTimeFormat(
    "ru-KZ",
    withTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  ).format(new Date(value));
}

const statusLabels: Record<string, string> = {
  ACTIVE: "Активно",
  AUTHORIZED: "Авторизовано",
  ARCHIVED: "В архиве",
  AWAITING_CONFIRMATION: "Ждёт подтверждения",
  AWAITING_SIGNATURE: "Ждёт подписи",
  BLOCKED: "Заблокировано",
  CANCELLED: "Отменено",
  CALCULATED: "Рассчитано",
  CAPTURED: "Оплачено",
  CLOSED: "Закрыто",
  COMPLETED: "Завершено",
  CONFIRMED: "Подтверждено",
  DEAD: "Исчерпаны попытки",
  DELIVERED: "Доставлено",
  DRAFT: "Черновик",
  EXPIRED: "Истёк срок",
  FAILED: "Ошибка",
  FRESH: "Актуально",
  GENERATED: "Сформировано",
  HIDDEN: "Скрыто",
  IN_PROGRESS: "В работе",
  MAPPED: "Сопоставлено",
  MATCHED: "Сопоставлено",
  OPEN: "Открыто",
  PARTIAL: "Частично готово",
  PARTIALLY_FULFILLED: "Частично исполнено",
  PARTIALLY_REFUNDED: "Частичный возврат",
  PAUSED: "Приостановлено",
  PARTIALLY_CONFIRMED: "Частично подтверждено",
  PARTIALLY_SIGNED: "Частично подписано",
  PASSED: "Проверка пройдена",
  PENDING: "Ожидает",
  PROCESSING: "Обрабатывается",
  PUBLISHED: "Опубликовано",
  READY: "Готово",
  RECALLED: "Отозвано",
  RECONCILIATION: "На сверке",
  REJECTED: "Отклонено",
  RESTRICTED: "С ограничениями",
  REVIEW_REQUIRED: "Нужна проверка",
  REVOKED: "Отозвано",
  SENT: "Отправлено",
  SIGNED: "Подписано",
  STALE: "Устарело",
  RUNNING: "Выполняется",
  SUPERSEDED: "Заменено версией",
  UNDER_REVIEW: "На проверке",
  UNKNOWN: "Неизвестно",
  VERIFIED: "Проверено",
};

export function formatStatus(value: string | null | undefined) {
  if (!value) return "Нет статуса";
  return (
    statusLabels[value] ?? value.toLocaleLowerCase("ru").replaceAll("_", " ")
  );
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Произошла неизвестная ошибка";
}
