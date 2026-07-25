import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import catalog from "../../data/public-catalog-fallback.json";
import mediaCatalog from "../../data/public-catalog-media.json";
import styles from "./page.module.css";
import ProductOfferActions from "./product-offer-actions";
import VariantPicker from "./variant-picker";
import SafeProductImage from "../../components/safe-product-image";
import ProductDetailHeader from "./product-detail-header";
import {
  safeCatalogMediaSource,
  type CatalogMediaCandidate,
} from "../../lib/catalog-media";
import {
  readPublishedCatalog,
  type PublishedCatalogProduct,
} from "../../lib/published-catalog-server";
import { createProductPresentation } from "./product-presentation";

type CatalogProduct =
  | (typeof catalog.products)[number]
  | PublishedCatalogProduct;
type ProductVariant = {
  id: string;
  label: string;
  sku: string | null;
  gtin: string | null;
  attributes?: Record<string, unknown>;
  imageUrl?: string | null;
  sourceUrl?: string | null;
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

const detachedBrandOverlay = (imageUrl: string | null | undefined) => {
  try {
    return new Set([
      "denti.kz",
      "www.denti.kz",
      "img.waimaoniu.net",
      "dental-market.kz",
      "www.dental-market.kz",
    ]).has(new URL(String(imageUrl)).hostname.toLocaleLowerCase("en"));
  } catch {
    return false;
  }
};

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
  const publishedCatalog = await readPublishedCatalog();
  const catalogProduct =
    catalog.products.find((item) => item.id === id) ??
    publishedCatalog.products.find((item) => item.id === id);
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
      offers: [
        {
          id: "00000000-0000-4000-8000-000000000180",
          supplier: { name: "MedConsum" },
          supplierSku: "SAFETOUCH-ULTRA-100",
          priceMinor: "475000",
          currency: "KZT",
          packaging: { name: "Упаковка 100 штук" },
          available: true,
          deliveryMethods: ["CARRIER"],
          verifiedDocuments: true,
          officialDistributor: false,
        },
        {
          id: "00000000-0000-4000-8000-000000000150",
          supplier: { name: "Demo Dental Supply" },
          supplierSku: "SAFETOUCH-ULTRA-100",
          priceMinor: "490000",
          currency: "KZT",
          packaging: { name: "Упаковка 100 штук" },
          available: true,
          deliveryMethods: ["SUPPLIER_CITY"],
          verifiedDocuments: true,
          officialDistributor: false,
        },
      ],
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
  const presentation = product
    ? createProductPresentation(
        product,
        (product.attributes ?? []) as Array<[string, string]>,
      )
    : null;
  return product && presentation
    ? {
        title: `${presentation.title} | DentMarket`,
        description: presentation.summary,
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
  const isBracketSystem = /брекет/iu.test(product.category ?? "");
  const requiresPositionSkuMatrix =
    (product as PublishedCatalogProduct).commerceModel?.status ===
    "POSITION_SKU_MATRIX_REQUIRED";
  const selectedImageUrl =
    selectedVariant?.imageUrl ??
    ("imageUrl" in product ? product.imageUrl : null);
  const media =
    product.liveMedia ??
    (selectedImageUrl
      ? {
          sourceUrl: `/api/catalog-images/${encodeURIComponent(product.id)}?v=6${
            selectedVariant?.imageUrl
              ? `&variant=${encodeURIComponent(selectedVariant.id)}`
              : ""
          }`,
          securePath: null,
          altText: `${product.name} — фото выбранного варианта`,
          metadata: {
            exactProductPhoto: true,
            sourceImageUrl: selectedImageUrl,
            visualCompliance: "auto_corrected" as const,
            overlayCleanup: detachedBrandOverlay(selectedImageUrl)
              ? ("top_strip" as const)
              : ("none" as const),
          },
        }
      : undefined) ??
    (product.sourceUrl ? mediaEntries[product.sourceUrl] : undefined);
  const imageSource = safeCatalogMediaSource(media);
  const attributes = Object.entries(
    Object.fromEntries([
      ...((product.attributes ?? []) as Array<[string, string]>),
      ...Object.entries(selectedVariant?.attributes ?? {}),
    ]),
  )
    .filter(
      ([key]) =>
        !(
          key === "Артикулы производителя" &&
          selectedVariant?.attributes?.["Артикул производителя"]
        ),
    )
    .map(([key, value]) => [key, String(value)] as const);
  const presentation = createProductPresentation(
    product,
    attributes,
    selectedVariant?.sku,
  );
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
      <ProductDetailHeader />
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
              alt={presentation.title}
              className={
                media?.metadata?.overlayCleanup === "top_strip"
                  ? styles.productImageTopStrip
                  : undefined
              }
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
            <h1>{presentation.title}</h1>
            {product.brand ? (
              <p className={styles.brand}>
                <strong>{product.brand}</strong>
                {product.manufacturer &&
                product.manufacturer !== product.brand
                  ? ` · ${product.manufacturer}`
                  : ""}
              </p>
            ) : null}
            <p className={styles.description}>
              {shortDescription(presentation.summary)}
            </p>
            {presentation.originalName ? (
              <p className={styles.originalName}>
                Название производителя: {presentation.originalName}
              </p>
            ) : null}
            {presentation.facts.length ? (
              <dl className={styles.quickFacts}>
                {presentation.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {selectedVariant ? (
              <VariantPicker
                variants={variants}
                selectedVariantId={selectedVariant.id}
                requiresPositionSkuMatrix={requiresPositionSkuMatrix}
              />
            ) : null}
            <div className={styles.heroActions}>
              <ProductOfferActions
                offers={visibleOffers}
                productId={product.id}
                productName={presentation.title}
              />
              {visibleOffers.length ? (
                <span className={styles.trustNote}>
                  Заказ доступен после входа в кабинет клиники
                </span>
              ) : null}
            </div>
            <aside className={styles.orderGuide} aria-label="Как выбрать товар">
              <strong>Как заказать без ошибки</strong>
              {isBracketSystem ? (
                <ol>
                  <li>Выберите набор или отдельный брекет, затем челюсть и нужный зуб.</li>
                  <li>Проверьте пропись, размер паза, торк и наличие крючка.</li>
                  <li>Сравните продавцов только для выбранного варианта и положите его в корзину.</li>
                </ol>
              ) : variants.length > 1 ? (
                <ol>
                  <li>Выберите объём, фасовку, оттенок или другой вариант выше.</li>
                  <li>Сравните предложения именно для выбранного варианта.</li>
                  <li>Проверьте срок доставки и положите предложение поставщика в корзину.</li>
                </ol>
              ) : (
                <ol>
                  <li>Сверьте назначение и совместимость с вашим оборудованием.</li>
                  <li>Проверьте код производителя перед заказом.</li>
                  <li>Когда появятся предложения, сравните цену и срок доставки.</li>
                </ol>
              )}
            </aside>
          </div>
        </section>

        <section
          className={
            visibleOffers.length
              ? styles.contentGrid
              : `${styles.contentGrid} ${styles.contentGridSingle}`
          }
        >
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
          {visibleOffers.length ? (
            <div className={styles.panel}>
              <div className={styles.panelHeading}>
                <div>
                  <span className={styles.panelKicker}>
                    Коммерческие условия
                  </span>
                  <h2>Предложения поставщиков</h2>
                </div>
                <span className={styles.offerCount}>
                  {visibleOffers.length}
                </span>
              </div>
              <div className={styles.offers}>
                {visibleOffers.map((offer) => (
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
                ))}
              </div>
            </div>
          ) : null}
        </section>
        {product.description ? (
          <section className={styles.technicalPanel}>
            <details>
              <summary>Официальные данные производителя</summary>
              <div>
                {presentation.originalName ? (
                  <p>
                    <strong>Оригинальное название:</strong>{" "}
                    {presentation.originalName}
                  </p>
                ) : null}
                {presentation.originalDescription ? (
                  <p>{presentation.originalDescription}</p>
                ) : null}
                <small>
                  Это исходные данные производителя. Для заказа используйте
                  характеристики и код выбранного варианта выше.
                </small>
              </div>
            </details>
          </section>
        ) : null}
      </div>
    </main>
  );
}
