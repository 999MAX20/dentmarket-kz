"use client";

import { Button, Input } from "@fluentui/react-components";
import {
  BuildingShop24Regular,
  Cart24Regular,
  Cube24Regular,
  Database24Regular,
  DocumentTable24Regular,
  PeopleTeam24Regular,
  Search24Regular,
  Settings24Regular,
  ShieldLock24Regular,
} from "@fluentui/react-icons";
import { useEffect, useState, type ReactNode } from "react";
import styles from "./page.module.css";
import { OrganizationQuickCreate } from "./organization-quick-create";
import { ResourceLists } from "./resource-lists";
import { FoundationManagement } from "./foundation-management";
import { LiveMetrics } from "./live-metrics";
import { CommerceFoundation } from "./commerce-foundation";
import { SupplierOperations } from "./supplier-operations";
import { SupplierControls } from "./supplier-controls";
import { CommerceSkeleton } from "./commerce-skeleton";
import { IntegrationOperations } from "./integration-operations";
import { PlatformAssurance } from "./platform-assurance";
import { TrustOperations } from "./trust-operations";
import { AgreementOperations } from "./agreement-operations";
import { ConnectorReadinessRegistry } from "./connector-readiness-registry";
import { CatalogQuality } from "./catalog-quality";
import { clearAdminSession, isLocalAdminDevelopment, readAdminSession } from "./admin-auth";

const navigation: Array<{ label: string; icon: ReactNode; active?: boolean }> =
  [
    { label: "Обзор", icon: <DocumentTable24Regular />, active: true },
    { label: "Организации", icon: <BuildingShop24Regular /> },
    { label: "Пользователи и права", icon: <PeopleTeam24Regular /> },
    { label: "Каталог", icon: <Cube24Regular /> },
    { label: "Импорт", icon: <Database24Regular /> },
    { label: "Заказы", icon: <Cart24Regular /> },
    { label: "Контроль доступа", icon: <ShieldLock24Regular /> },
  ];

const modules = [
  {
    title: "Организации",
    description: "Capabilities, memberships и юридические профили",
    icon: <BuildingShop24Regular />,
  },
  {
    title: "Доступ",
    description: "Роли, permissions и политики согласования",
    icon: <ShieldLock24Regular />,
  },
  {
    title: "Каталог",
    description: "Категории, товары, варианты и атрибуты",
    icon: <Cube24Regular />,
  },
  {
    title: "География",
    description: "Казахстан, регионы, города и адреса",
    icon: <Database24Regular />,
  },
];

export default function OperationsOverview() {
  const [authorized, setAuthorized] = useState(false);
  useEffect(() => {
    if (readAdminSession() || isLocalAdminDevelopment()) setAuthorized(true);
    else window.location.replace("/login");
  }, []);
  if (!authorized) return <main className={styles.authLoading}>Проверяем защищённую сессию…</main>;
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandName}>Marketplace Operations</span>
          <span className={styles.brandMeta}>B2B procurement platform</span>
        </div>
        <nav className={styles.nav} aria-label="Основная навигация">
          {navigation.map((item) => (
            <a
              key={item.label}
              href="#"
              className={`${styles.navItem} ${item.active ? styles.navItemActive : ""}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <a href="#" className={styles.navItem}>
            <Settings24Regular />
            <span>Настройки</span>
          </a>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <Input
            className={styles.search}
            contentBefore={<Search24Regular />}
            placeholder="Поиск по платформе"
            aria-label="Поиск по платформе"
          />
          <Button className={styles.buttonSubtle} appearance="subtle" onClick={() => { clearAdminSession(); window.location.assign("/login"); }}>
            Выйти
          </Button>
        </header>

        <div className={styles.content}>
          <div className={styles.heading}>
            <div className={styles.headingCopy}>
              <h1 className={styles.pageTitle}>Операционный контур</h1>
              <span className={styles.muted}>
                Полный контур: foundation, marketplace, платежи, логистика,
                документы, комплаенс и интеграции.
              </span>
            </div>
            <OrganizationQuickCreate />
          </div>

          <section className={styles.statusPanel} aria-label="Статус окружения">
            <div>
              <div className={styles.statusTitle}>
                B2B marketplace работает end-to-end
              </div>
              <div className={styles.statusText}>
                Поиск, split checkout, резервы, оплата, отгрузки, документы,
                комплаенс и уведомления связаны одним сценарием.
              </div>
            </div>
            <Button className={styles.buttonOutline} appearance="outline">
              Открыть документацию
            </Button>
          </section>

          <div className={styles.grid}>
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Модули foundation</h2>
                <span className={styles.muted}>4 области</span>
              </div>
              <div className={styles.moduleGrid}>
                {modules.map((module) => (
                  <article className={styles.module} key={module.title}>
                    <div className={styles.moduleTop}>
                      <strong>{module.title}</strong>
                      {module.icon}
                    </div>
                    <div className={styles.moduleDescription}>
                      {module.description}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h2 className={styles.panelTitle}>Транзакционный путь</h2>
              </div>
              <div className={styles.checklist}>
                {[
                  ["Cart pricing", "Snapshot цены и условий поставщика"],
                  ["Checkout split", "Группировка по поставщикам"],
                  ["Supplier orders", "Подтверждение и state machine"],
                  ["Mock payments", "Allocations и базовый ledger"],
                ].map(([title, meta]) => (
                  <div className={styles.checkRow} key={title}>
                    <div className={styles.checkMark}>✓</div>
                    <div className={styles.checkCopy}>
                      <strong>{title}</strong>
                      <span className={styles.checkMeta}>{meta}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <LiveMetrics />
          <CatalogQuality />
          <AgreementOperations />
          <PlatformAssurance />
          <TrustOperations />
          <ResourceLists />
          <FoundationManagement />
          <CommerceFoundation />
          <SupplierOperations />
          <SupplierControls />
          <IntegrationOperations />
          <ConnectorReadinessRegistry />
          <CommerceSkeleton />
        </div>
      </main>
    </div>
  );
}
