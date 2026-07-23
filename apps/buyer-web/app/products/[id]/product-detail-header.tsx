"use client";

import Link from "next/link";
import { Cart24Regular } from "@fluentui/react-icons";
import { useEffect, useState } from "react";
import { readDemoCart, type DemoCartItem } from "../../demo-cart";
import styles from "./page.module.css";

export default function ProductDetailHeader() {
  const [items, setItems] = useState<DemoCartItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readDemoCart());
    sync();
    window.addEventListener("dentmarket:demo-cart-updated", sync);
    return () => window.removeEventListener("dentmarket:demo-cart-updated", sync);
  }, []);

  const count = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <header className={styles.productHeader}>
      <Link className={styles.productBrand} href="/" aria-label="DentMarket, каталог">
        <span className={styles.productMark}>DM</span>
        <span><strong>DentMarket</strong><small>Закупки для стоматологий</small></span>
      </Link>
      <nav className={styles.productNav} aria-label="Навигация товара">
        <Link href="/">Каталог</Link>
        <Link href="/suppliers">Поставщикам</Link>
      </nav>
      <Link className={styles.productCart} href="/?cart=1">
        <Cart24Regular aria-hidden="true" />
        Корзина{count ? ` ${count}` : ""}
      </Link>
      <Link className={styles.productLogin} href="/login">Войти</Link>
    </header>
  );
}
