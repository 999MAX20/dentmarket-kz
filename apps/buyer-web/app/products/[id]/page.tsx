import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import catalog from "../../data/public-catalog-fallback.json";
import approvedCatalog from "../../data/production-approved-catalog.json";
import mediaCatalog from "../../data/public-catalog-media.json";
import styles from "./page.module.css";
import ProductOfferActions from "./product-offer-actions";
import VariantPicker from "./variant-picker";
import SafeProductImage from "../../components/safe-product-image";
import {
  safeCatalogMediaSource,
  type CatalogMediaCandidate,
} from "../../lib/catalog-media";

type CatalogProduct =
  | (typeof catalog.products)[number]
  | (typeof approvedCatalog.products)[number];
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
type ProductMedia = CatalogMediaCandidate & { altText?: string };
const mediaEntries = mediaCatalog.entries as Record<string, ProductMedia>;
type DisplayProduct = CatalogProduct & { liveMedia?: ProductMedia };

type PublicCompareResponse = {
  product: {
    id: string;
    name: string;
    description?: string | null;
    brand: string | null;
    manufacturer: string | null;
    category?: string | null;
    media?: ProductMedia[];
  };
  variants: ProductVariant[];
  offers: Array<{ offerId: string; variantId: string; supplier: { name: string }; supplierSku?: string | null; price: { amountMinor: string; currency: string }; packaging?: { name: string }; availability: unknown[]; delivery: Array<{ method: string }>; markers: { verifiedDocuments: boolean; officialDistributor: boolean } }>;
  comparisonAttributes?: Array<{ scope: string; name: string; value: unknown }>;
};

const getProduct = cache(async (id: string): Promise<DisplayProduct | undefined> => {
  const catalogProduct = [...catalog.products, ...approvedCatalog.products].find(
    (item) => item.id === id,
  );
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
    } as unknown as DisplayProduct;
  }

  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "https://dentmarket-api.vercel.app/api";
    const response = await fetch(`${apiBase}/catalog/products/${encodeURIComponent(id)}/compare?quantity=1`, {
      next: { revalidate: 30 },
    });
    if (!response.ok) return undefined;
    const live = (await response.json()) as PublicCompareResponse;
    if (!live.product?.id) return undefined;
    return {
      id: live.product.id,
      name: live.product.name,
      description:
        live.product.description ??
        "Характеристики товара и предложения поставщиков в DentMarket.",
      brand: live.product.brand,
      manufacturer: live.product.manufacturer,
      category: live.product.category ?? "Стоматологические товары",
      sourceUrl: null,
      sourceUpdatedAt: null,
      attributes: (live.comparisonAttributes ?? [])
        .filter((attribute) => attribute.scope === "PRODUCT")
        .map((attribute) => [attribute.name, String(attribute.value)]),
      variants: live.variants ?? [],
      offers: live.offers.map((offer) => ({ id: offer.offerId, variantId: offer.variantId, supplier: offer.supplier, supplierSku: offer.supplierSku, priceMinor: offer.price.amountMinor, currency: offer.price.currency, packaging: offer.packaging, available: offer.availability.length > 0, deliveryMethods: offer.delivery.map((item) => item.method), verifiedDocuments: offer.markers.verifiedDocuments, officialDistributor: offer.markers.officialDistributor })),
      minNormalizedPriceMinor: live.offers[0]?.price.amountMinor ?? null,
      isAvailable: live.offers.some((offer) => offer.availability.length > 0),
      liveMedia: live.product.media?.[0],
    } as unknown as CatalogProduct;
  } catch {
    return undefined;
  }
});

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

function shortDescription(value: string | null | undefined) {
  const text = String(value ?? "").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
  if (!text) return "Здесь собраны характеристики товара и предложения поставщиков.";
  if (text.length <= 360) return text;
  const clipped = text.slice(0, 357).replace(/\s+\S*$/u, "").trim();
  return `${clipped}…`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(decodeURIComponent(id));
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
  const product = await getProduct(decodeURIComponent(id));
  if (!product) notFound();

  const media =
    product.liveMedia ??
    (product.sourceUrl ? mediaEntries[product.sourceUrl] : undefined);
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
              loading="eager"
              fetchPriority="high"
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
              {shortDescription(product.description)}
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
              <ProductOfferActions
                offers={visibleOffers}
                productId={product.id}
                productName={product.name}
              />
              <span className={styles.trustNote}>
                Заказ доступен после входа в кабинет клиники
              </span>
            </div>
            <aside className={styles.orderGuide} aria-label="Как выбрать товар">
              <strong>Как заказать без ошибки</strong>
              <ol>
                <li>Выберите объём, фасовку, оттенок или другой вариант выше.</li>
                <li>Сравните предложения именно для выбранного варианта.</li>
                <li>Проверьте срок доставки и положите предложение поставщика в корзину.</li>
              </ol>
            </aside>
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
        {product.description ? (
          <section className={styles.technicalPanel}>
            <details>
              <summary>Полное техническое описание</summary>
              <div>
                <p>{String(product.description).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim()}</p>
                <small>Описание относится к товарной семье. Точные объём, оттенок, размер и комплектацию смотрите в выбранном варианте.</small>
              </div>
            </details>
          </section>
        ) : null}
      </div>
    </main>
  );
}
