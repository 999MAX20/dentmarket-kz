import Link from "next/link";
import { PublicHeader } from "../public-header";
import { registrationUrl, supplierAppUrl } from "../public-links";
import styles from "./page.module.css";

const capabilities = [
  ["Каталог", "Загрузите товары файлом или из 1С."],
  ["Остатки", "Покупатель видит актуальное количество и реальный срок поставки."],
  ["Заказы", "Подтверждение, отгрузка, возвраты и документы живут в одной истории."],
  ["Аналитика", "Следите за спросом, качеством данных, акциями и исполнением заказов."],
];

const onboarding = [
  ["Заявка", "Заполните профиль компании и укажите категории."],
  ["Проверка", "Мы проверим реквизиты и разрешительные документы."],
  ["Договор", "Подпишите договор с DentMarket через ЭЦП."],
  ["Продажи", "Загрузите остатки и откройте предложения для клиник."],
];

export default function SuppliersPage() {
  return <main className={styles.page}>
    <PublicHeader active="suppliers" />

    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>Для поставщиков</p>
        <h1>Ваш каталог.<br /><em>Видимый клиникам.</em></h1>
        <p className={styles.lead}>Единый канал для ассортимента, остатков, заказов и документов без разрозненных заявок в мессенджерах.</p>
        <div className={styles.actions}><a className={styles.primary} href={registrationUrl("supplier")}>Стать поставщиком</a><a className={styles.textLink} href={supplierAppUrl}>Открыть кабинет</a></div>
      </div>
      <aside className={styles.heroAside}>
        <p>Продажи через DentMarket</p>
        <figure><img src="/catalog/illustrations/implantology-category.png" alt="Материалы поставщика в каталоге DentMarket" fetchPriority="high" /></figure>
        <strong>Цена → остаток → заказ → документ</strong>
        <dl><div><dt>География</dt><dd>Казахстан</dd></div><div><dt>Валюта</dt><dd>KZT</dd></div><div><dt>Договор</dt><dd>ЭЦП · 12 месяцев</dd></div></dl>
      </aside>
    </section>

    <section className={styles.capabilities}>
      <div className={styles.sectionHead}><p className={styles.eyebrow}>В одном кабинете</p><h2>От прайса до исполненного заказа</h2></div>
      <div className={styles.capabilityGrid}>{capabilities.map(([title, description]) => <article key={title}><h3>{title}</h3><p>{description}</p></article>)}</div>
    </section>

    <section className={styles.onboarding}>
      <div><p className={styles.eyebrow}>Подключение</p><h2>Четыре шага до первого заказа</h2></div>
      <ol>{onboarding.map(([title, description], index) => <li key={title}><b>0{index + 1}</b><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
    </section>

    <section className={styles.cta}><h2>Подключите ассортимент к новому каналу продаж</h2><a className={styles.primary} href={registrationUrl("supplier")}>Подать заявку</a></section>
    <footer className={styles.footer}><Link href="/">DentMarket KZ</Link><Link href="/about">О DentMarket</Link><span>© 2026</span></footer>
  </main>;
}
