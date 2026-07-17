import Link from "next/link";
import styles from "./page.module.css";

const clinicBenefits = ["Сравнение цены за базовую единицу", "Актуальные остатки и сроки поставки", "Бюджеты, согласования и повтор закупки", "Документы и уведомления в одном контуре"];
const supplierBenefits = ["Единая витрина предложений и остатков", "Импорт из CSV, API, ERP и 1С", "Акции и аналитика продаж", "Доступ после договора с ЭЦП"];

export default function AboutPage() {
  return <main className={styles.page}>
    <header className={styles.header}><Link className={styles.brand} href="/"><span>DM</span><strong>DentMarket <small>KZ</small></strong></Link><nav><Link href="/">В магазин</Link><a href="#clinics">Клиникам</a><a href="#suppliers">Поставщикам</a><Link href="/login">Войти</Link></nav></header>
    <section className={styles.hero}><p className={styles.eyebrow}>О платформе</p><h1>Профессиональная закупка для стоматологии Казахстана</h1><p>DentMarket объединяет каталог, сравнение предложений, остатки, заказы, документы и контроль исполнения. Сам магазин открыт без регистрации; аккаунт нужен при оформлении заказа и работе с кабинетом.</p><div><Link className={styles.primary} href="/">Перейти в магазин</Link><a className={styles.secondary} href="https://dentmarket-about.vercel.app/register?role=buyer">Зарегистрировать клинику</a></div></section>
    <section className={styles.section} id="clinics"><p className={styles.eyebrow}>Для клиник</p><h2>Закупка без цепочки звонков</h2><div className={styles.grid}>{clinicBenefits.map((benefit, index) => <article key={benefit}><span>0{index + 1}</span><h3>{benefit}</h3></article>)}</div></section>
    <section className={styles.supplier} id="suppliers"><div><p className={styles.eyebrow}>Для поставщиков</p><h2>Один канал продаж и исполнения</h2><p>Ассортимент, остатки, заказы, интеграции и юридический контур собраны в одном кабинете.</p><a className={styles.light} href="https://dentmarket-supplier.vercel.app">Кабинет поставщика</a></div><ol>{supplierBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ol></section>
    <section className={styles.legal}><p className={styles.eyebrow}>Юридический контур</p><h2>Договор с ЭЦП появляется только тогда, когда нужен</h2><p>После двух проверенных подписей договор действует 12 месяцев. Пока он активен, повторное окно подписи недоступно; новый цикл запускается при завершении срока или обязательном изменении условий.</p></section>
    <footer className={styles.footer}><Link href="/">DentMarket KZ · Магазин</Link><span>© 2026</span></footer>
  </main>;
}
