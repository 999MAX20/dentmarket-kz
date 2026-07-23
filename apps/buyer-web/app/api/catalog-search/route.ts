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

const searchableText = (product: PublishedCatalogProduct) =>
  normalize(
    [
      product.name,
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

const toSearchProduct = (product: PublishedCatalogProduct) => ({
  ...product,
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
  const terms = normalize(params.get("q")).split(" ").filter(Boolean);
  const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
  const limit = Math.min(120, Math.max(1, Number(params.get("limit") ?? 60) || 60));
  const sort = params.get("sort") ?? "RELEVANCE";

  const filtered = terms.length
    ? catalog.products.filter((product) => {
        const text = searchableText(product);
        return terms.every((term) => text.includes(term));
      })
    : [...catalog.products];

  filtered.sort((left, right) => {
    if (sort === "NAME_DESC") return right.name.localeCompare(left.name, "ru");
    return left.name.localeCompare(right.name, "ru");
  });

  return NextResponse.json(
    {
      total: filtered.length,
      offset,
      limit,
      items: filtered.slice(offset, offset + limit).map(toSearchProduct),
      facets: { categories: [], suppliers: [] },
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    },
  );
}
