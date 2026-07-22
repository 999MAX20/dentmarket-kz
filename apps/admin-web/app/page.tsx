"use client";

import { Button, Input, Select } from "@fluentui/react-components";
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
import { AgreementOperations } from "./agreement-operations";
import { CatalogQuality } from "./catalog-quality";
import { CommerceFoundation } from "./commerce-foundation";
import { CommerceSkeleton } from "./commerce-skeleton";
import { ConnectorReadinessRegistry } from "./connector-readiness-registry";
import { FoundationManagement } from "./foundation-management";
import { IntegrationOperations } from "./integration-operations";
import { LiveMetrics } from "./live-metrics";
import { OperationQueue } from "./operation-queue";
import { OrganizationQuickCreate } from "./organization-quick-create";
import { PlatformAssurance } from "./platform-assurance";
import { ResourceLists } from "./resource-lists";
import { SupplierControls } from "./supplier-controls";
import { SupplierOperations } from "./supplier-operations";
import { TrustOperations } from "./trust-operations";
import { ProductCorrectionQueue } from "./product-correction-queue";
import { clearAdminSession, isLocalAdminDevelopment, readAdminSession } from "./admin-auth";

type SectionId =
  | "overview"
  | "organizations"
  | "access"
  | "catalog"
  | "imports"
  | "orders"
  | "security"
  | "settings";

const navigation: Array<{ id: SectionId; label: string; icon: ReactNode }> = [
  { id: "overview", label: "Обзор", icon: <DocumentTable24Regular /> },
  { id: "organizations", label: "Организации", icon: <BuildingShop24Regular /> },
  { id: "access", label: "Пользователи и права", icon: <PeopleTeam24Regular /> },
  { id: "catalog", label: "Каталог", icon: <Cube24Regular /> },
  { id: "imports", label: "Загрузка товаров", icon: <Database24Regular /> },
  { id: "orders", label: "Заказы и договоры", icon: <Cart24Regular /> },
  { id: "security", label: "Контроль и доверие", icon: <ShieldLock24Regular /> },
];

const sectionMeta: Record<SectionId, { title: string; description: string }> = {
  overview: {
    title: "Обзор",
    description: "Главные показатели и задачи команды DentMarket.",
  },
  organizations: {
    title: "Организации",
    description: "Клиники, поставщики и их реквизиты.",
  },
  access: {
    title: "Пользователи и права",
    description: "Кто и что может делать в кабинетах.",
  },
  catalog: {
    title: "Каталог",
    description: "Карточки, категории, цены и предложения продавцов.",
  },
  imports: {
    title: "Загрузка товаров",
    description: "Как поставщики передают товары, цены и остатки.",
  },
  orders: {
    title: "Заказы и договоры",
    description: "Исполнение заказов поставщиками, договоры и подписи ЭЦП.",
  },
  security: {
    title: "Контроль и доверие",
    description: "Проверки поставщиков, рейтинг и ограничения.",
  },
  settings: {
    title: "Настройки DentMarket",
    description: "Основные настройки и доступность разделов.",
  },
};

const modules: Array<{ id: SectionId; title: string; description: string; icon: ReactNode }> = [
  { id: "organizations", title: "Организации", description: "Юридические профили и участники", icon: <BuildingShop24Regular /> },
  { id: "access", title: "Доступ", description: "Пользователи и права", icon: <ShieldLock24Regular /> },
  { id: "catalog", title: "Каталог", description: "Карточки и предложения", icon: <Cube24Regular /> },
  { id: "imports", title: "Загрузка товаров", description: "Файлы и учётные системы", icon: <Database24Regular /> },
];

export default function OperationsWorkspace() {
  const [authorized, setAuthorized] = useState(false);
  const [active, setActive] = useState<SectionId>("overview");

  useEffect(() => {
    if (readAdminSession() || isLocalAdminDevelopment()) setAuthorized(true);
    else window.location.replace("/login");
  }, []);

  if (!authorized) {
    return <main className={styles.authLoading}>Проверяем вход...</main>;
  }

  const meta = sectionMeta[active];

  const overview = (
    <>
      <section className={styles.statusPanel} aria-label="Состояние DentMarket">
        <div>
          <div className={styles.statusTitle}>Магазин работает</div>
          <div className={styles.statusText}>Поиск, корзина, заказы и документы доступны.</div>
        </div>
        <Button className={styles.buttonOutline} appearance="outline" onClick={() => setActive("orders")}>Открыть очередь</Button>
      </section>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Основные области</h2>
            <span className={styles.muted}>Быстрый переход</span>
          </div>
          <div className={styles.moduleGrid}>
            {modules.map((module) => (
              <button className={styles.module} key={module.id} type="button" onClick={() => setActive(module.id)}>
                <span className={styles.moduleTop}><strong>{module.title}</strong>{module.icon}</span>
                <span className={styles.moduleDescription}>{module.description}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2 className={styles.panelTitle}>Путь заказа</h2></div>
          <div className={styles.checklist}>
            {[
              ["Цена сохранена", "Условия поставщика фиксируются в корзине"],
              ["Заказ разделён", "Каждый поставщик получает свою часть"],
              ["Исполнение подтверждено", "Количество и срок проходят проверку"],
              ["Документы готовы", "Клиника и поставщик видят их в заказе"],
            ].map(([title, description]) => (
              <div className={styles.checkRow} key={title}>
                <div className={styles.checkMark}>✓</div>
                <div className={styles.checkCopy}><strong>{title}</strong><span className={styles.checkMeta}>{description}</span></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <LiveMetrics />
      <OperationQueue />
    </>
  );

  const content: Record<SectionId, ReactNode> = {
    overview,
    organizations: <><ResourceLists /><FoundationManagement /></>,
    access: <><SupplierControls /><PlatformAssurance /></>,
    catalog: <><ProductCorrectionQueue /><CatalogQuality /><CommerceFoundation /></>,
    imports: <><IntegrationOperations /><ConnectorReadinessRegistry /></>,
    orders: <><SupplierOperations /><AgreementOperations /></>,
    security: <TrustOperations />,
    settings: <CommerceSkeleton />,
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandName}>DentMarket</span>
          <span className={styles.brandMeta}>Для команды</span>
        </div>
        <nav className={styles.nav} aria-label="Основная навигация">
          {navigation.map((item) => (
            <button key={item.id} type="button" className={`${styles.navItem} ${active === item.id ? styles.navItemActive : ""}`} onClick={() => setActive(item.id)}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarFooter}>
          <button type="button" className={`${styles.navItem} ${active === "settings" ? styles.navItemActive : ""}`} onClick={() => setActive("settings")}>
            <Settings24Regular /><span>Настройки</span>
          </button>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.topbar}>
          <Select className={styles.mobileSection} value={active} onChange={(_, data) => setActive(data.value as SectionId)} aria-label="Раздел админки">
            {[...navigation, { id: "settings" as const, label: "Настройки", icon: null }].map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </Select>
          <Input className={styles.search} contentBefore={<Search24Regular />} placeholder="Поиск" aria-label="Поиск" />
          <Button className={styles.buttonSubtle} appearance="subtle" onClick={() => { clearAdminSession(); window.location.assign("/login"); }}>Выйти</Button>
        </header>

        <div className={styles.content}>
          <div className={styles.heading}>
            <div className={styles.headingCopy}>
              <h1 className={styles.pageTitle}>{meta.title}</h1>
              <span className={styles.muted}>{meta.description}</span>
            </div>
            {active === "organizations" ? <OrganizationQuickCreate /> : null}
          </div>
          <div className={styles.sectionStack}>{content[active]}</div>
        </div>
      </main>
    </div>
  );
}
