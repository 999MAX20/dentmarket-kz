import Link from "next/link";
import { Search24Regular } from "@fluentui/react-icons";
import type { FormEvent } from "react";
import { loginUrl } from "./public-links";
import { CityLocation } from "./city-location";
import styles from "./public-header.module.css";

type PublicSection = "catalog" | "suppliers" | "about";

type PublicHeaderProps = {
  active: PublicSection;
  query?: string;
  searching?: boolean;
  onQueryChange?: (value: string) => void;
  onSearch?: () => void;
};

export function PublicHeader({ active, query = "", searching = false, onQueryChange, onSearch }: PublicHeaderProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!onSearch) return;
    event.preventDefault();
    onSearch();
  };

  return (
    <header className={`${styles.header} ${onSearch ? styles.headerCatalog : styles.headerSimple}`}>
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
      {onSearch ? (
        <form className={styles.search} role="search" method="get" action="/" onSubmit={submit}>
          <Search24Regular aria-hidden="true" />
          <input
            type="search"
            name="q"
            value={query}
            onChange={(event) => onQueryChange?.(event.currentTarget.value)}
            placeholder="Найти товар, бренд или артикул"
            aria-label="Поиск по каталогу"
          />
          <button type="submit" disabled={searching}>
            {searching ? "Ищем" : "Найти"}
          </button>
        </form>
      ) : null}
      <CityLocation />
      <a className={styles.login} href={loginUrl}>
        Войти
      </a>
    </header>
  );
}
