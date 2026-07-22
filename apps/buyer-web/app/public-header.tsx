import Link from "next/link";
import { loginUrl } from "./public-links";
import { CityLocation } from "./city-location";
import styles from "./public-header.module.css";

type PublicSection = "catalog" | "suppliers" | "about";

export function PublicHeader({ active }: { active: PublicSection }) {
  return (
    <header className={styles.header}>
      <Link className={styles.brand} href="/" aria-label="DentMarket, магазин">
        <span className={styles.mark}>DM</span>
        <span className={styles.brandCopy}>
          <strong>DentMarket</strong>
          <small>Закупки для стоматологий</small>
        </span>
      </Link>
      <nav className={styles.nav} aria-label="Основная навигация">
        <Link className={active === "catalog" ? styles.active : undefined} href="/">
          Каталог
        </Link>
        <Link className={active === "suppliers" ? styles.active : undefined} href="/suppliers">
          Поставщикам
        </Link>
        <Link className={active === "about" ? styles.active : undefined} href="/about">
          О DentMarket
        </Link>
      </nav>
      <a className={styles.login} href={loginUrl}>
        Войти
      </a>
      <CityLocation />
    </header>
  );
}
