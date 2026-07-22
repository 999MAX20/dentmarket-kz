import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import catalog from "../../data/public-catalog-fallback.json";
import mediaCatalog from "../../data/public-catalog-media.json";
import styles from "./page.module.css";
import ProductOfferActions from "./product-offer-actions";
import VariantPicker from "./variant-picker";
import SafeProductImage from "../../components/safe-product-image";
import { safeCatalogMediaSource } from "../../lib/catalog-media";

type CatalogProduct = (typeof catalog.products)[number];
type ProductVariant = {
  id: string;
  label: string;
  sku: string | null;
  gtin: string | null;
  attributes?: Record<string, unknown>;
};
type ProductOffer = {
  id: string;
  variantId?: string | null;
  supplier: { name: string };
  supplierSku?: string | null;
  priceMinor: number | string | null;
  currency: string;
  packaging?: { name: string };
  available: boolean;
  deliveryMethods?: string[];
  verifiedDocuments?: boolean;
  officialDistributor?: boolean;
};

function getProduct(id: string): CatalogProduct | undefined {
  const catalogProduct = catalog.products.find((item) => item.id === id);
  if (catalogProduct) return catalogProduct;

  // The public search intentionally includes a small demo offer set while the
  // production API is being connected. Keep those IDs deep-linkable as well.
  if (id === "00000000-0000-4000-8000-000000000100") {
    return {
      id,
      name: "Перчатки нитриловые SafeTouch Ultra",
      description:
        "Нитриловые перчатки для стоматологической практики. Доступны в упаковке 100 штук.",
      brand: "SafeTouch",
      manufacturer: "SafeMed Industries",
      category: "Перчатки",
      sourceUrl: null,
      sourceUpdatedAt: null,
      attributes: [
        ["Категория", "Перчатки"],
        ["Бренд", "SafeTouch"],
        ["Производитель", "SafeMed Industries"],
        ["Фасовка", "100 шт."],
      ],
      variants: [],
      offers: [],
      minNormalizedPriceMinor: "4750",
      isAvailable: true,
    } as unknown as CatalogProduct;
  }

  return undefined;
}

function formatPrice(
  minor: number | string | null | undefined,
  currency = "KZT",
) {
  if (minor == null) return "Цена по запросу";
  return new Intl.NumberFormat("ru-KZ", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = getProduct(decodeURIComponent(id));
  return product
    ? {
        title: `${product.name} | DentMarket`,
        description: product.description,
      }
    : { title: "Карточка товара | DentMarket" };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string; returnTo?: string }>;
}) {
  const { id } = await params;
  const { variant: requestedVariantId, returnTo: requestedReturnTo } =
    await searchParams;
  const product = getProduct(decodeURIComponent(id));
  if (!product) notFound();

  const media = product.sourceUrl
    ? mediaCatalog.entries[
        product.sourceUrl as keyof typeof mediaCatalog.entries
      ]
    : undefined;
  const imageSource = safeCatalogMediaSource(media);
  const variants = ((product.variants ?? []) as ProductVariant[]).map(
    (variant) => ({
      ...variant,
      attributes: Object.fromEntries(
        Object.entries(variant.attributes ?? {}).map(([key, value]) => [
          key,
          String(value),
        ]),
      ),
    }),
  );
  const offers = product.offers as ProductOffer[];
  const selectedVariant =
    variants.find((variant) => variant.id === requestedVariantId) ??
    variants[0];
  const attributes = Object.entries(
    Object.fromEntries([
      ...((product.attributes ?? []) as Array<[string, string]>),
      ...Object.entries(selectedVariant?.attributes ?? {}),
    ]),
  ).map(([key, value]) => [key, String(value)] as const);
  const visibleOffers = selectedVariant
    ? offers.filter(
        (offer) =>
          offer.variantId === selectedVariant.id ||
          (!offer.variantId && variants.length <= 1),
      )
    : offers;
  const returnTo =
    requestedReturnTo &&
    requestedReturnTo.startsWith("/") &&
    !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "/";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href={returnTo}>
          ← Вернуться в каталог
        </Link>
        <div className={styles.breadcrumbs}>
          Каталог / {product.category || "Стоматологические товары"}
        </div>
        <section className={styles.hero}>
          <div className={styles.visual}>
            <SafeProductImage
              src={imageSource}
              alt={media?.altText ?? product.name}
              draggable={false}
              fallback={
                <span>
                  Фото товара
                  <br />
                  готовится
                </span>
              }
            />
          </div>
          <div className={styles.summary}>
            <span className={styles.eyebrow}>
              {product.category || "Стоматологические товары"}
            </span>
            <h1>{product.name}</h1>
            {product.brand ? (
              <p className={styles.brand}>
                {product.brand}
                {product.manufacturer ? ` · ${product.manufacturer}` : ""}
              </p>
            ) : null}
            <p className={styles.description}>
              {product.description ||
                "Карточка товара DentMarket с описанием, характеристиками и предложениями поставщиков."}
            </p>
            {selectedVariant ? (
              <VariantPicker
                variants={variants}
                selectedVariantId={selectedVariant.id}
              />
            ) : null}
            <div className={styles.facts}>
              <span>
                <strong>{visibleOffers.length}</strong>
                <small>предложений</small>
              </span>
              <span>
                <strong>
                  {product.isAvailable ? "В наличии" : "Под заказ"}
                </strong>
                <small>статус товара</small>
              </span>
              <span>
                <strong>{imageSource ? "Фото" : "Готовится"}</strong>
                <small>визуал</small>
              </span>
            </div>
            <div className={styles.heroActions}>
              <ProductOfferActions offers={visibleOffers} />
              <span className={styles.trustNote}>
                Заказ доступен после входа в кабинет клиники
              </span>
            </div>
          </div>
        </section>

        <section className={styles.contentGrid}>
          <div className={styles.panel}>
            <h2>Характеристики</h2>
            {attributes.length ? (
              <dl className={styles.attributes}>
                {attributes.map(([key, value]) => (
                  <div key={`${key}-${value}`}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className={styles.muted}>
                Характеристики будут дополнены после следующей выгрузки
                поставщика.
              </p>
            )}
            {product.sourceUrl ? (
              <a
                className={styles.source}
                href={product.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                Открыть источник карточки ↗
              </a>
            ) : null}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span className={styles.panelKicker}>Коммерческие условия</span>
                <h2>Предложения поставщиков</h2>
              </div>
              <span className={styles.offerCount}>{visibleOffers.length}</span>
            </div>
            <div className={styles.offers}>
              {visibleOffers.length ? (
                visibleOffers.map((offer) => (
                  <article
                    className={styles.offer}
                    key={`${offer.supplier.name}-${offer.supplierSku ?? "offer"}`}
                  >
                    <div>
                      <strong>{offer.supplier.name}</strong>
                      <span>
                        {offer.packaging?.name
                          ? `Фасовка: ${offer.packaging.name}`
                          : "Условия уточняются"}
                      </span>
                    </div>
                    <div className={styles.offerRight}>
                      <strong>
                        {formatPrice(offer.priceMinor, offer.currency)}
                      </strong>
                      <span
                        className={
                          offer.available ? styles.available : styles.onRequest
                        }
                      >
                        {offer.available ? "В наличии" : "Под заказ"}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.muted}>
                  Поставщики ещё не добавили предложение.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
