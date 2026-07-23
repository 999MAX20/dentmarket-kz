import { NextRequest, NextResponse } from "next/server";
import {
  readPublishedCatalog,
  type PublishedCatalogProduct,
} from "../../lib/published-catalog-server";

export const runtime = "nodejs";

const normalize = (value: string | null | undefined) =>
  String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru")
    .replace(/ё/gu, "е")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim();

const synonymGroups = [
  ["имплант", "implant"],
  ["апекслокатор", "apexlocator", "apex locator"],
  ["эндомотор", "endomotor", "endo motor"],
  ["наконечник", "handpiece"],
  ["адгезив", "adhesive", "бондинг", "bond"],
  ["композит", "composite"],
  ["цемент", "cement"],
  ["бор", "буры", "bur", "burs"],
  ["скейлер", "scaler"],
  ["лампа", "lamp", "light"],
  ["перчатки", "gloves"],
  ["автоклав", "autoclave", "sterilizer"],
  ["электрод", "electrode"],
  ["щетка", "brush"],
  ["матрица", "matrix"],
  ["слепочный", "слепочная", "impression"],
  ["коффердам", "rubber dam"],
  ["гуттаперча", "gutta percha"],
  ["файл", "files"],
] as const;

const aliasesFor = (term: string) => {
  const group = synonymGroups.find((items) =>
    items.some((item) => {
      const normalizedItem = normalize(item);
      return (
        normalizedItem === term ||
        normalizedItem.startsWith(term) ||
        term.startsWith(normalizedItem)
      );
    }),
  );
  return group ? group.map((item) => normalize(item)) : [term];
};

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

const searchableText = (product: PublishedCatalogProduct) =>
  normalize(
    [
      product.name,
      product.description,
      product.brand,
      product.manufacturer,
      product.category,
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
  termAliases: string[][],
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
  for (const aliases of termAliases) {
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

const toSearchProduct = (product: PublishedCatalogProduct) => ({
  ...product,
  placement: productPlacement(product),
  media: product.imageUrl
    ? [
        {
          id: `catalog-media-${product.id}`,
          sourceUrl: product.imageUrl,
          securePath: null,
          normalizedStorageKey: null,
          altText: `${product.name} — фото товара`,
          width: null,
          height: null,
          metadata: {
            exactProductPhoto: true,
            sourceImageUrl: product.imageUrl,
            rightsStatus: "public_exact_product_source",
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
});

export async function GET(request: NextRequest) {
  const catalog = await readPublishedCatalog();
  const params = request.nextUrl.searchParams;
  const normalizedQuery = normalize(params.get("q"));
  const terms = normalizedQuery.split(" ").filter(Boolean);
  const termAliases = terms.map(aliasesFor);
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const limit = Math.min(120, Math.max(1, Number(params.get("limit") ?? 60) || 60));
  const sort = params.get("sort") ?? "RELEVANCE";
  const placement =
    params.get("placement") === "promotion" ? "promotion" : "catalog";

  const filtered = catalog.products
    .filter((product) => productPlacement(product) === placement)
    .filter((product) => {
      if (!terms.length) return true;
      const text = searchableText(product);
      return termAliases.every((aliases) =>
        aliases.some((alias) => containsAlias(text, alias)),
      );
    });

  filtered.sort((left, right) => {
    if (sort === "NAME_DESC") return right.name.localeCompare(left.name, "ru");
    if (sort === "RELEVANCE" && normalizedQuery) {
      const difference =
        relevanceScore(right, normalizedQuery, termAliases) -
        relevanceScore(left, normalizedQuery, termAliases);
      if (difference) return difference;
    }
    return left.name.localeCompare(right.name, "ru");
  });

  return NextResponse.json(
    {
      total: filtered.length,
      offset,
      limit,
      items: filtered.slice(offset, offset + limit).map(toSearchProduct),
      interpretedQuery: [
        ...new Set(termAliases.flat().filter((term) => !terms.includes(term))),
      ],
      facets: { categories: [], suppliers: [] },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
