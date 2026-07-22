"use client";

import { useState } from "react";
import styles from "./page.module.css";

type Offer = {
  supplier: { name: string };
  priceMinor: number | string | null;
  currency: string;
  packaging?: { name: string };
  available: boolean;
  deliveryMethods?: string[];
  verifiedDocuments?: boolean;
  officialDistributor?: boolean;
};

function formatPrice(minor: number | string | null, currency: string) {
  if (minor == null) return "Цена по запросу";
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(minor) / 100);
}

function deliveryLabel(methods: string[] = []) {
  if (methods.includes("CARRIER")) return "Курьерская доставка";
  if (methods.includes("NATIONWIDE")) return "Доставка по Казахстану";
  if (methods.includes("PICKUP")) return "Самовывоз";
  return "Условия уточняются";
}

export default function ProductOfferActions({ offers }: { offers: Offer[] }) {
  const [compareOpen, setCompareOpen] = useState(false);

  return (
    <>
      <button className={styles.compareButton} type="button" onClick={() => setCompareOpen(true)}>
        Сравнить предложения
      </button>
      {compareOpen ? (
        <div className={styles.compareBackdrop} role="presentation" onClick={() => setCompareOpen(false)}>
          <section className={styles.compareDrawer} role="dialog" aria-modal="true" aria-labelledby="compare-title" onClick={(event) => event.stopPropagation()}>
            <header className={styles.compareHeader}>
              <div><span className={styles.eyebrow}>Быстрое сравнение</span><h2 id="compare-title">Предложения поставщиков</h2></div>
              <button className={styles.closeButton} type="button" aria-label="Закрыть сравнение" onClick={() => setCompareOpen(false)}>×</button>
            </header>
            <div className={styles.compareList}>
              {offers.length ? offers.map((offer, index) => (
                <article className={styles.compareOffer} key={`${offer.supplier.name}-${index}`}>
                  <div className={styles.compareOfferMain}>
                    <strong>{offer.supplier.name}</strong>
                    <span>{offer.packaging?.name ? `Фасовка: ${offer.packaging.name}` : "Фасовка уточняется"}</span>
                    <span>{deliveryLabel(offer.deliveryMethods)}</span>
                  </div>
                  <div className={styles.compareOfferSide}>
                    <strong>{formatPrice(offer.priceMinor, offer.currency)}</strong>
                    <span className={offer.available ? styles.available : styles.onRequest}>{offer.available ? "В наличии" : "Под заказ"}</span>
                    {offer.verifiedDocuments ? <small>Документы проверены</small> : null}
                  </div>
                </article>
              )) : <p className={styles.muted}>Предложения ещё не добавлены.</p>}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
