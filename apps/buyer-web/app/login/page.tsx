"use client";

import { useEffect } from "react";
import { loginUrl } from "../public-links";
import styles from "./page.module.css";

export default function LoginRedirect() {
  useEffect(() => {
    window.location.replace(loginUrl);
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Единая точка входа</p>
          <h1>Переходим к входу в DentMarket</h1>
          <p className={styles.hint}>Клиники и поставщики входят через одну защищённую страницу.</p>
          <a className={styles.login} href={loginUrl}>Продолжить</a>
        </div>
      </section>
    </main>
  );
}
