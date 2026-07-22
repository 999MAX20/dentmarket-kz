import Link from "next/link";
import { PublicHeader } from "../public-header";
import { registrationUrl, supplierAppUrl } from "../public-links";
import styles from "./page.module.css";

const clinicBenefits = [
  ["Сравнение", "Цена приведена к базовой единице, фасовка и условия видны рядом."],
  ["Контроль", "Остатки, сроки поставки и подтверждение поставщика сохраняются в заказе."],
  ["Документы", "Счета, спецификации, подписи и статусы собраны в одной истории."],
  ["Повтор закупки", "Списки и бюджеты помогают клинике не собирать заказ заново."],
];

const trustFacts = [
  ["Открытый каталог", "Регистрация нужна только при оформлении"],
  ["Казахстан", "Поставщики, KZT и локальная география"],
  ["ЭЦП", "Проверяемый договор и история документов"],
];

export default function AboutPage() {
  return (
    <main className={styles.page}>
      <PublicHeader active="about" />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>О DentMarket</p>
          <h1>Закупки клиники под контролем</h1>
          <p>Каталог, условия поставщиков, заказ и документы работают как одна прозрачная цепочка.</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/">Открыть каталог</Link>
            <a className={styles.secondary} href={registrationUrl("buyer")}>Подключить клинику</a>
          </div>
        </div>
        <figure className={styles.heroVisual}>
          <img
            src="/catalog/illustrations/instruments-category.png"
            alt="Стоматологические инструменты из каталога DentMarket"
            fetchPriority="high"
          />
        </figure>
      </section>

      <section className={styles.proof} aria-label="Что даёт DentMarket">
        {trustFacts.map(([title, description]) => (
          <article key={title}>
            <strong>{title}</strong>
            <span>{description}</span>
          </article>
        ))}
      </section>

      <section className={styles.clinics} id="clinics">
        <div className={styles.sectionIntro}>
          <h2>От поиска до закрывающих документов</h2>
          <p>Покупатель видит не только карточку товара, но и условия конкретного поставщика.</p>
        </div>
        <div className={styles.benefitLayout}>
          <article className={styles.benefitLead}>
            <strong>Один заказ вместо переписки</strong>
            <p>Условия фиксируются при оформлении. Клиника понимает, кто поставляет товар, когда он будет доступен и какие документы приложены.</p>
            <Link href="/">Перейти к поиску</Link>
          </article>
          <div className={styles.benefitList}>
            {clinicBenefits.map(([title, description]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.supplier} id="suppliers">
        <figure>
          <img
            src="/catalog/illustrations/consumables-category.png"
            alt="Расходные материалы для стоматологической клиники"
            loading="lazy"
          />
        </figure>
        <div>
          <h2>Поставщик управляет данными, а не заявками в чатах</h2>
          <p>Ассортимент, цены, остатки, подтверждение заказа и документы доступны в одном кабинете.</p>
          <ul>
            <li>Загрузите прайс файлом или из 1С</li>
            <li>Контроль свежести цены и доступного количества</li>
            <li>История исполнения заказа и договор с ЭЦП</li>
          </ul>
          <a className={styles.primary} href={supplierAppUrl}>Открыть кабинет</a>
        </div>
      </section>

      <section className={styles.legal}>
        <p className={styles.eyebrow}>Проверка поставщиков</p>
        <h2>Коммерческий доступ появляется после проверки</h2>
        <p>Подпишите договор с DentMarket через ЭЦП. Готовый договор действует 12 месяцев и остаётся в кабинете.</p>
        <a href={registrationUrl("supplier")}>Стать поставщиком</a>
      </section>

      <footer className={styles.footer}>
        <Link href="/">DentMarket KZ</Link>
        <span>Закупки для стоматологий Казахстана</span>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
