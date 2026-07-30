import { NextRequest, NextResponse } from "next/server";
import {
  readPublishedCatalog,
  type PublishedCatalogProduct,
} from "../../lib/published-catalog-server";
import {
  expandDentalSearchQuery,
  normalizeDentalSearchText,
} from "../../lib/dental-search";

export const runtime = "nodejs";

const normalize = normalizeDentalSearchText;
const DENTISTRY_INDUSTRY_CODE = "dentistry-kz";

const containsAlias = (text: string, alias: string) => {
  if (!alias) return false;
  if (alias.includes(" ")) return text.includes(alias);
  return text
    .split(" ")
    .some(
      (token) =>
        token === alias ||
        (alias.length >= 3 &&
          token.length >= 3 &&
          Math.abs(token.length - alias.length) <= 2 &&
          (token.startsWith(alias) || alias.startsWith(token))),
    );
};

const productPlacement = (product: PublishedCatalogProduct) =>
  product.placement ??
  (/\/(?:aktsii|promotions?|special-offers?)(?:\/|$)/iu.test(
    String(product.sourceUrl ?? ""),
  )
    ? "promotion"
    : "catalog");

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

const searchableText = (product: PublishedCatalogProduct) =>
  normalize(
    [
      product.name,
      product.description,
      product.brand,
      product.manufacturer,
      product.category,
      ...(product.attributes ?? []).flat(),
      ...(product.variants ?? []).flatMap((variant) => [
        variant.label,
        variant.sku,
        ...Object.values(variant.attributes ?? {}),
      ]),
    ].join(" "),
  );

const relevanceScore = (
  product: PublishedCatalogProduct,
  normalizedQuery: string,
  concepts: string[][],
) => {
  if (!normalizedQuery) return 0;
  const name = normalize(product.name);
  const brand = normalize(product.brand);
  const variants = normalize(
    (product.variants ?? [])
      .flatMap((variant) => [
        variant.label,
        variant.sku,
        ...Object.values(variant.attributes ?? {}),
      ])
      .join(" "),
  );
  const description = normalize(product.description);
  let score = 0;
  if (name === normalizedQuery) score += 1_000;
  else if (name.startsWith(normalizedQuery)) score += 700;
  else if (name.includes(normalizedQuery)) score += 500;
  if (brand === normalizedQuery) score += 450;
  if (variants.includes(normalizedQuery)) score += 420;
  for (const aliases of concepts) {
    const best = aliases.reduce((termScore, alias) => {
      if (name.startsWith(alias)) return Math.max(termScore, 180);
      if (containsAlias(name, alias)) return Math.max(termScore, 140);
      if (containsAlias(variants, alias)) return Math.max(termScore, 120);
      if (containsAlias(brand, alias)) return Math.max(termScore, 100);
      if (containsAlias(description, alias)) return Math.max(termScore, 45);
      return termScore;
    }, 0);
    score += best;
  }
  return score;
};

const stableDailyRank = (product: PublishedCatalogProduct) => {
  const date = new Date().toISOString().slice(0, 10);
  const value = `${date}:${product.id}`;
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const toSearchProduct = (product: PublishedCatalogProduct) => ({
  ...product,
  industryCodes: product.industryCodes ?? [DENTISTRY_INDUSTRY_CODE],
  industryCode: DENTISTRY_INDUSTRY_CODE,
  placement: productPlacement(product),
  media: product.imageUrl
    ? [
        {
          id: `catalog-media-${product.id}`,
          sourceUrl: `/api/catalog-images/${encodeURIComponent(product.id)}?v=4`,
          securePath: null,
          normalizedStorageKey: null,
          altText: `${product.name} — фото товара`,
          width: null,
          height: null,
          metadata: {
            exactProductPhoto: true,
            sourceImageUrl: product.imageUrl,
            rightsStatus: "public_exact_product_source",
            visualCompliance: "auto_corrected",
            overlayCleanup:
              productPlacement(product) === "catalog" &&
              detachedBrandOverlay(product.imageUrl)
                ? "top_strip"
                : "none",
          },
        },
      ]
    : [],
  categories: [
    {
      id: `published-category-${normalize(product.category).replaceAll(" ", "-")}`,
      name: product.category || "Стоматологические товары",
    },
  ],
  ranking: {
    source: "DAILY_ROTATION",
    score: stableDailyRank(product),
    sellerCount: product.offers.length,
    orders30d: 0,
    unitsSold30d: 0,
  },
  badges: ["В подборке"],
});

export async function GET(request: NextRequest) {
  const catalog = await readPublishedCatalog();
  const params = request.nextUrl.searchParams;
  const intent = expandDentalSearchQuery(params.get("q") ?? "");
  const normalizedQuery = intent.normalizedQuery;
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const limit = Math.min(120, Math.max(1, Number(params.get("limit") ?? 60) || 60));
  const sort = params.get("sort") ?? "RELEVANCE";
  const category = normalize(params.get("category") ?? "");
  const placement =
    params.get("placement") === "promotion" ? "promotion" : "catalog";

  const filtered = catalog.products
    .filter((product) => productPlacement(product) === placement)
    .filter((product) => !category || normalize(product.category).includes(category))
    .filter((product) => {
      if (!intent.concepts.length) return true;
      const text = searchableText(product);
      return intent.concepts.every((aliases) =>
        aliases.some((alias) => containsAlias(text, alias)),
      );
    })
    .filter((product) => {
      if (!normalizedQuery) return true;
      const directDescriptionMatch =
        normalizedQuery.includes(" ") &&
        normalize(product.description).includes(normalizedQuery);
      return (
        relevanceScore(product, normalizedQuery, intent.concepts) >= 100 ||
        directDescriptionMatch
      );
    });

  filtered.sort((left, right) => {
    if (sort === "NAME_DESC") return right.name.localeCompare(left.name, "ru");
    if (sort === "BEST_PRICE") {
      return (
        Number(left.minNormalizedPriceMinor ?? Number.MAX_SAFE_INTEGER) -
        Number(right.minNormalizedPriceMinor ?? Number.MAX_SAFE_INTEGER)
      );
    }
    if (sort === "TOP" || sort === "BEST_SELLER") {
      return stableDailyRank(right) - stableDailyRank(left);
    }
    if (sort === "RELEVANCE" && normalizedQuery) {
      const difference =
        relevanceScore(right, normalizedQuery, intent.concepts) -
        relevanceScore(left, normalizedQuery, intent.concepts);
      if (difference) return difference;
    }
    return left.name.localeCompare(right.name, "ru");
  });

  const categoryFacet = Array.from(
    filtered.reduce((counts, product) => {
      const name = product.category || "Стоматологические товары";
      counts.set(name, (counts.get(name) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  )
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"))
    .slice(0, 30)
    .map(([name, count]) => ({ id: `published-category-${normalize(name).replaceAll(" ", "-")}`, name, count }));

  return NextResponse.json(
    {
      total: filtered.length,
      offset,
      limit,
      items: filtered.slice(offset, offset + limit).map(toSearchProduct),
      interpretedQuery: intent.interpretedTerms,
      matchedAliases: intent.matchedAliases,
      facets: { categories: categoryFacet, suppliers: [] },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
