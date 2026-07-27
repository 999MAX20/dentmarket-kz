"use client";

import type { MouseEvent } from "react";
import styles from "./page.module.css";

type ProductBackLinkProps = {
  href: string;
};

export default function ProductBackLink({ href }: ProductBackLinkProps) {
  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;

    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (
        referrer?.origin === window.location.origin &&
        referrer.pathname === "/"
      ) {
        event.preventDefault();
        window.history.back();
      }
    } catch {
      // The href remains a complete fallback when referrer data is unavailable.
    }
  };

  return (
    <a className={styles.back} href={href} onClick={goBack}>
      ← Вернуться в каталог
    </a>
  );
}
