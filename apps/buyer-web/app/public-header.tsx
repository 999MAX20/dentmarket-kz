"use client";

import Link from "next/link";
import { Search24Regular } from "@fluentui/react-icons";
import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { loginUrl } from "./public-links";
import { CityLocation } from "./city-location";
import styles from "./public-header.module.css";

type PublicSection = "catalog" | "suppliers" | "about";

type PublicHeaderProps = {
  active: PublicSection;
  query?: string;
  searching?: boolean;
  onQueryChange?: (value: string) => void;
  onSearch?: (value?: string) => void;
  recentSearches?: string[];
};

const searchSuggestions = [
  "перчатки",
  "перчатки нитриловые",
  "перчатки хирургические",
  "маски медицинские",
  "текучий композит",
  "композит",
  "гуттаперча",
  "силер",
  "эндодонтические файлы",
  "стоматологические боры",
  "слюноотсосы",
  "стерилизация",
  "импланты",
  "абатменты",
  "светильник",
  "лампа",
  "композит",
  "коффердам",
  "гуттаперча",
  "карпула",
  "эндомотор",
];

const searchAliases: Record<string, string[]> = {
  светник: ["светильник", "лампа"],
  текучка: ["композит", "текучий композит"],
  коффер: ["коффердам"],
  гутта: ["гуттаперча"],
  карпулы: ["карпула", "анестезия"],
  эндошка: ["эндодонтия", "эндомотор"],
};

export function PublicHeader({ active, query = "", searching = false, onQueryChange, onSearch, recentSearches = [] }: PublicHeaderProps) {
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const searchRef = useRef<HTMLFormElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  const aliasMatches = Object.entries(searchAliases)
    .filter(([alias]) => alias.includes(normalizedQuery) || normalizedQuery.includes(alias))
    .flatMap(([, values]) => values);
  const suggestions = normalizedQuery.length < 2
    ? recentSearches.slice(0, 4)
    : [...new Set([...aliasMatches, ...searchSuggestions])]
        .filter((suggestion) => suggestion.includes(normalizedQuery) && suggestion !== normalizedQuery)
        .slice(0, 6);
  useEffect(() => {
    if (!suggestionsOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setSuggestionsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSuggestionsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [suggestionsOpen]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (!onSearch) return;
    event.preventDefault();
    setSuggestionsOpen(false);
    onSearch(query);
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
        <form ref={searchRef} className={styles.search} role="search" method="get" action="/" onSubmit={submit}>
          <Search24Regular aria-hidden="true" />
          <input
            type="search"
            name="q"
            value={query}
            list="dentmarket-search-suggestions"
            onFocus={() => setSuggestionsOpen(true)}
            onChange={(event) => onQueryChange?.(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSuggestionsOpen(false);
                return;
              }
              if (event.key === "ArrowDown" && suggestions.length) {
                event.preventDefault();
                (event.currentTarget.parentElement?.querySelector("[role='option']") as HTMLElement | null)?.focus();
              }
            }}
            placeholder="Найти товар, бренд или артикул"
            aria-label="Поиск по каталогу"
          />
          <button type="submit" disabled={searching}>
            {searching ? "Ищем" : "Найти"}
          </button>
          <datalist id="dentmarket-search-suggestions">
            {[...new Set([...searchSuggestions, ...recentSearches])].map((suggestion) => <option key={suggestion} value={suggestion} />)}
          </datalist>
          {suggestionsOpen && suggestions.length ? (
            <div className={styles.suggestions} role="listbox" aria-label="Подсказки поиска">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  role="option"
                  tabIndex={0}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onQueryChange?.(suggestion);
                    setSuggestionsOpen(false);
                    onSearch?.(suggestion);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onQueryChange?.(suggestion);
                      setSuggestionsOpen(false);
                      onSearch?.(suggestion);
                    }
                    if (event.key === "Escape") {
                      (event.currentTarget.closest("form")?.querySelector("input[name='q']") as HTMLInputElement | null)?.focus();
                    }
                  }}
                >
                  <Search24Regular aria-hidden="true" />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          ) : null}
        </form>
      ) : null}
      <CityLocation />
      <a className={styles.login} href={loginUrl}>
        Войти
      </a>
    </header>
  );
}
