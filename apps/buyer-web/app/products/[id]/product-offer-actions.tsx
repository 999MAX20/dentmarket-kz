"use client";

import { useEffect, useState } from "react";
import {
  MarketplaceApiClient,
  parseSessionHandoff,
} from "@marketplace/api-client";
import { Cart24Regular } from "@fluentui/react-icons";
import { loginUrl } from "../../public-links";
import {
  addDemoCartItem,
  readDemoCart,
  setDemoCartQuantity,
  type DemoCartItem,
} from "../../demo-cart";
import styles from "./page.module.css";

type Offer = {
  id: string;
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

export default function ProductOfferActions({
  offers,
  productId,
  productName,
}: {
  offers: Offer[];
  productId: string;
  productName: string;
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [demoItems, setDemoItems] = useState<DemoCartItem[]>([]);

  useEffect(() => {
    setDemoItems(readDemoCart());
    const onCartUpdated = () => setDemoItems(readDemoCart());
    window.addEventListener("dentmarket:demo-cart-updated", onCartUpdated);
    return () =>
      window.removeEventListener("dentmarket:demo-cart-updated", onCartUpdated);
  }, []);

  const demoItem = (offer: Offer) =>
    demoItems.find((item) => item.offerId === offer.id);

  const saveDemoItem = (offer: Offer, quantity = 1) => {
    const items = addDemoCartItem(
      {
        id: `${productId}:${offer.id}`,
        offerId: offer.id,
        productId,
        productName,
        supplierName: offer.supplier.name,
        priceMinor: String(offer.priceMinor ?? "0"),
        currency: offer.currency || "KZT",
        packaging: offer.packaging?.name ?? "Фасовка уточняется",
      },
      quantity,
    );
    setDemoItems(items);
    setNotice("Позиция добавлена в демо-корзину");
  };

  const addToCart = async (offer: Offer) => {
    const session = parseSessionHandoff(
      window.sessionStorage.getItem("dentmarket:buyer-session"),
      "BUYER",
    );
    if (!session?.organizationId) {
      window.location.assign(
        `${loginUrl}?returnTo=${encodeURIComponent(window.location.href)}`,
      );
      return;
    }
    setBusyOfferId(offer.id);
    setNotice(null);
    try {
      const api = new MarketplaceApiClient(
        process.env.NEXT_PUBLIC_API_URL ??
          "https://dentmarket-api.vercel.app/api",
        session.accessToken
          ? { accessToken: session.accessToken }
          : {
              actorId: session.actorId,
              organizationId: session.organizationId,
            },
      );
      const carts = await api.get<Array<{ id: string; status: string }>>(
        `/buyers/${session.organizationId}/carts`,
      );
      const activeCart = carts.find((cart) => cart.status === "ACTIVE");
      const cart =
        activeCart ??
        (await api.post<{ id: string }>(
          `/buyers/${session.organizationId}/carts`,
          { currency: "KZT" },
        ));
      await api.post(`/carts/${cart.id}/items`, {
        offerId: offer.id,
        quantity: 1,
      });
      setNotice("Позиция добавлена в корзину");
    } catch {
      saveDemoItem(offer);
    } finally {
      setBusyOfferId(null);
    }
  };

  const addOrIncrease = (offer: Offer) => {
    if (demoItem(offer)) {
      const items = setDemoCartQuantity(
        demoItem(offer)!.id,
        demoItem(offer)!.quantity + 1,
      );
      setDemoItems(items);
      setNotice("Количество увеличено");
      return;
    }
    void addToCart(offer);
  };

  const renderQuantity = (offer: Offer) => {
    const item = demoItem(offer);
    if (!item) return null;
    return (
      <div className={styles.quantityControl} aria-label={`Количество ${item.productName}`}>
        <button
          type="button"
          aria-label="Уменьшить количество"
          onClick={() => {
            const items = setDemoCartQuantity(item.id, item.quantity - 1);
            setDemoItems(items);
          }}
        >
          −
        </button>
        <strong>{item.quantity}</strong>
        <button
          type="button"
          aria-label="Увеличить количество"
          onClick={() => {
            const items = setDemoCartQuantity(item.id, item.quantity + 1);
            setDemoItems(items);
          }}
        >
          +
        </button>
      </div>
    );
  };

  return (
    <>
      {offers.find((offer) => offer.available && offer.verifiedDocuments !== false) ? (
        <button
          className={styles.primaryCartButton}
          type="button"
          onClick={() => {
            const offer = offers.find(
              (item) => item.available && item.verifiedDocuments !== false,
            );
            if (offer) addOrIncrease(offer);
          }}
          disabled={busyOfferId !== null}
        >
          <Cart24Regular aria-hidden="true" />
          {busyOfferId
            ? "Добавляем"
            : demoItem(
                  offers.find(
                    (item) => item.available && item.verifiedDocuments !== false,
                  )!,
                )
              ? "Добавить ещё"
              : "В корзину"}
        </button>
      ) : null}
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
                    {renderQuantity(offer)}
                    <button
                      className={styles.addToCartButton}
                      type="button"
                      disabled={
                        busyOfferId === offer.id ||
                        !offer.available ||
                        offer.verifiedDocuments === false
                      }
                      onClick={() => addOrIncrease(offer)}
                    >
                      <Cart24Regular aria-hidden="true" />
                      {busyOfferId === offer.id ? "Добавляем" : demoItem(offer) ? "Добавить ещё" : "В корзину"}
                    </button>
                  </div>
                </article>
              )) : <p className={styles.muted}>Предложения ещё не добавлены.</p>}
            </div>
            {notice ? <p className={styles.cartNotice} role="status">{notice}</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
