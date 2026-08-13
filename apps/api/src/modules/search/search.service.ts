import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CompareOffersInput,
  SearchCatalogInput,
} from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { expandIndustrySearchQuery } from "./industry-search-lexicon";
import { SearchAnalyticsService } from "./search-analytics.service";
import { resolvePriceRules } from "../pricing/price-resolver";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { MediaAccessService } from "../../platform/storage/media-access.service";
import { scopeMatches } from "../promotions/promotion-engine";

type SearchRow = { productId: string; rank: number };
type PublicSearchPromotion = {
  id: string;
  supplierOrganizationId: string;
  name: string;
  percentageBasisPoints: number | null;
  scope: Prisma.JsonValue;
  endsAt: Date;
  sponsorshipLabel: string | null;
};
const publicVariant = (variant: {
  id: string;
  sku: string | null;
  gtin: string | null;
  externalMetadata: Prisma.JsonValue;
}) => {
  const metadata =
    variant.externalMetadata &&
    typeof variant.externalMetadata === "object" &&
    !Array.isArray(variant.externalMetadata)
      ? (variant.externalMetadata as Record<string, unknown>)
      : {};
  return {
    id: variant.id,
    sku: variant.sku,
    gtin: variant.gtin,
    label:
      typeof metadata.label === "string"
        ? metadata.label
        : variant.sku
          ? `REF ${variant.sku}`
          : "Стандартный вариант",
    attributes:
      metadata.attributes &&
      typeof metadata.attributes === "object" &&
      !Array.isArray(metadata.attributes)
        ? metadata.attributes
        : {},
  };
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SearchAnalyticsService,
    private readonly mediaAccess: MediaAccessService,
  ) {}

  async publicCities() {
    return this.prisma.city.findMany({
      select: { id: true, nameRu: true, region: { select: { nameRu: true } } },
      orderBy: [{ nameRu: "asc" }],
    });
  }

  private async assertBuyer(
    buyerOrganizationId: string,
    context: SupplierActorContext,
  ) {
    const operator = Boolean(
      await this.prisma.organizationCapability.findUnique({
        where: {
          organizationId_capability: {
            organizationId: context.organizationId,
            capability: "MARKETPLACE_OPERATOR",
          },
        },
      }),
    );
    if (buyerOrganizationId !== context.organizationId && !operator)
      throw new ForbiddenException(
        "Buyer search belongs to another organization",
      );
    const buyer = await this.prisma.organization.findUnique({
      where: { id: buyerOrganizationId },
      include: { capabilities: true, primaryIndustry: true },
    });
    if (
      !buyer ||
      !buyer.capabilities.some(({ capability }) => capability === "BUYER")
    )
      throw new NotFoundException("Buyer organization not found");
    return buyer;
  }

  async search(input: SearchCatalogInput, context: SupplierActorContext) {
    const buyer = await this.assertBuyer(input.buyerOrganizationId, context);
    const dentistry = await this.prisma.industry.findUnique({ where: { code: "dentistry-kz" }, select: { id: true } });
    const industryId = input.industryId ?? buyer.primaryIndustryId ?? dentistry?.id;
    if (input.industryId && buyer.primaryIndustryId && input.industryId !== buyer.primaryIndustryId)
      throw new ForbiddenException("Catalog industry does not match buyer organization");
    const searchIntent = expandIndustrySearchQuery(buyer.primaryIndustry?.code, input.q);
    const q = searchIntent.normalizedQuery;
    const expandedQuery = searchIntent.expandedQuery;
    let attributeFilters: Record<string, unknown> = {};
    if (input.attributeFilters) {
      try {
        const parsed: unknown = JSON.parse(input.attributeFilters);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("not an object");
        attributeFilters = parsed as Record<string, unknown>;
      } catch {
        throw new BadRequestException("attributeFilters must be a JSON object");
      }
    }
    const where: Prisma.Sql[] = [
      Prisma.sql`p.status = 'ACTIVE'`,
      Prisma.sql`EXISTS (SELECT 1 FROM "MarketplaceAgreement" ma WHERE ma.status IN ('ACTIVE', 'NON_RENEWING') AND ma."startsAt" <= NOW() AND ma."endsAt" > NOW() AND ma."supplierOrganizationId" = ANY(d."supplierIds"))`,
    ];
    if (q)
      where.push(
        Prisma.sql`(d."searchVector" @@ websearch_to_tsquery('simple', ${expandedQuery}) OR d."normalizedText" % ${q})`,
      );
    if (input.categoryId)
      where.push(
        Prisma.sql`CAST(${input.categoryId} AS uuid) = ANY(d."categoryIds")`,
      );
    if (industryId)
      where.push(
        Prisma.sql`CAST(${industryId} AS uuid) = ANY(d."industryIds")`,
      );
    if (input.brandId)
      where.push(Prisma.sql`p."brandId" = CAST(${input.brandId} AS uuid)`);
    if (input.manufacturerId)
      where.push(
        Prisma.sql`p."manufacturerId" = CAST(${input.manufacturerId} AS uuid)`,
      );
    if (input.supplierOrganizationId)
      where.push(
        Prisma.sql`CAST(${input.supplierOrganizationId} AS uuid) = ANY(d."supplierIds")`,
      );
    if (input.cityId)
      where.push(Prisma.sql`CAST(${input.cityId} AS uuid) = ANY(d."cityIds")`);
    if (input.warehouseId)
      where.push(
        Prisma.sql`CAST(${input.warehouseId} AS uuid) = ANY(d."warehouseIds")`,
      );
    if (input.deliveryMethod)
      where.push(
        Prisma.sql`${input.deliveryMethod} = ANY(d."deliveryMethods")`,
      );
    if (input.unit)
      where.push(
        Prisma.sql`d."normalizedText" ILIKE ${`%${this.normalizeFilter(input.unit)}%`}`,
      );
    if (input.packaging)
      where.push(
        Prisma.sql`d."normalizedText" ILIKE ${`%${this.normalizeFilter(input.packaging)}%`}`,
      );
    if (input.inStock !== undefined)
      where.push(Prisma.sql`d."isAvailable" = ${input.inStock}`);
    if (input.minNormalizedPriceMinor !== undefined)
      where.push(
        Prisma.sql`d."maxNormalizedPriceMinor" >= ${input.minNormalizedPriceMinor}`,
      );
    if (input.maxNormalizedPriceMinor !== undefined)
      where.push(
        Prisma.sql`d."minNormalizedPriceMinor" <= ${input.maxNormalizedPriceMinor}`,
      );
    if (Object.keys(attributeFilters).length > 0)
      where.push(
        Prisma.sql`(d.facets -> 'attributes') @> CAST(${JSON.stringify(attributeFilters)} AS jsonb)`,
      );
    const condition = Prisma.join(where, " AND ");
    const rank = q
      ? Prisma.sql`GREATEST(ts_rank(d."searchVector", websearch_to_tsquery('simple', ${expandedQuery})), similarity(d."normalizedText", ${q})) + CASE WHEN d."normalizedText" = ${q} THEN 1.0 WHEN d."normalizedText" ILIKE ${`%${q}%`} THEN 0.2 ELSE 0 END`
      : Prisma.sql`0::real`;
    const sort = (
      {
        RELEVANCE: Prisma.sql`rank DESC, d."isAvailable" DESC, d."updatedAt" DESC`,
        TOP: Prisma.sql`COALESCE((d.facets #>> '{ranking,score}')::numeric, 0) DESC, md5(d."productId"::text || CURRENT_DATE::text) DESC`,
        BEST_SELLER: Prisma.sql`COALESCE((d.facets #>> '{ranking,unitsSold30d}')::numeric, 0) DESC, COALESCE((d.facets #>> '{ranking,orders30d}')::numeric, 0) DESC, d."isAvailable" DESC`,
        BEST_PRICE: Prisma.sql`d."isAvailable" DESC, d."minNormalizedPriceMinor" ASC NULLS LAST`,
        PRICE_ASC: Prisma.sql`d."minNormalizedPriceMinor" ASC NULLS LAST, d."isAvailable" DESC`,
        PRICE_DESC: Prisma.sql`d."minNormalizedPriceMinor" DESC NULLS LAST, d."isAvailable" DESC`,
        NAME_ASC: Prisma.sql`p."canonicalName" ASC`,
        UPDATED_DESC: Prisma.sql`d."updatedAt" DESC`,
      } as const
    )[input.sort];
    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<SearchRow[]>(
        Prisma.sql`SELECT d."productId", ${rank} AS rank FROM "ProductSearchDocument" d JOIN "Product" p ON p.id = d."productId" WHERE ${condition} ORDER BY ${sort} LIMIT ${input.limit} OFFSET ${input.offset}`,
      ),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "ProductSearchDocument" d JOIN "Product" p ON p.id = d."productId" WHERE ${condition}`,
      ),
    ]);
    const products = await this.loadProducts(
      rows.map(({ productId }) => productId),
    );
    const supplierIds = [
      ...new Set(
        products.flatMap((product) =>
          product.variants.flatMap((variant) =>
            variant.supplierOffers.map((offer) => offer.supplierOrganizationId),
          ),
        ),
      ),
    ];
    const promotions: PublicSearchPromotion[] = supplierIds.length
      ? await this.prisma.promotion.findMany({
          where: {
            supplierOrganizationId: { in: supplierIds },
            status: "ACTIVE",
            kind: "PERCENTAGE",
            isPrivate: false,
            couponCodeHash: null,
            startsAt: { lte: new Date() },
            endsAt: { gt: new Date() },
          },
          select: {
            id: true,
            supplierOrganizationId: true,
            name: true,
            percentageBasisPoints: true,
            scope: true,
            endsAt: true,
            sponsorshipLabel: true,
          },
          orderBy: [{ percentageBasisPoints: "desc" }, { endsAt: "asc" }],
        })
      : [];
    const reviewSummary = await this.reviewSummaries(
      products.flatMap((product) => product.variants.map(({ id }) => id)),
    );
    const rankById = new Map(
      rows.map((row, index) => [
        row.productId,
        { rank: Number(row.rank), index },
      ]),
    );
    const items = products
      .map((product) =>
        this.toSearchItem(
          product,
          input,
          rankById.get(product.id)?.rank ?? 0,
          reviewSummary,
          promotions,
        ),
      )
      .sort(
        (left, right) =>
          (rankById.get(left.id)?.index ?? 0) -
          (rankById.get(right.id)?.index ?? 0),
      );
    const total = Number(countRows[0]?.count ?? 0);
    this.analytics.record(input.q, total, context);
    return {
      query: input.q,
      interpretedQuery: searchIntent.matchedAliases.length
        ? searchIntent.matchedAliases
        : undefined,
      total,
      offset: input.offset,
      limit: input.limit,
      items,
      facets: this.aggregateFacets(items),
    };
  }

  private normalizeFilter(value: string) {
    return value
      .toLocaleLowerCase("ru")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  async compare(input: CompareOffersInput, context: SupplierActorContext) {
    const buyer = await this.assertBuyer(input.buyerOrganizationId, context);
    const dentistry = await this.prisma.industry.findUnique({ where: { code: "dentistry-kz" }, select: { id: true } });
    const industryId = buyer.primaryIndustryId ?? dentistry?.id;
    const products = await this.loadProducts(
      [input.productId],
      input.buyerOrganizationId,
      input.quantity,
    );
    const product = products[0];
    if (!product) throw new NotFoundException("Marketplace product not found");
    if (industryId && !product.industries.some(({ industryId: productIndustryId }) => productIndustryId === industryId))
      throw new NotFoundException("Marketplace product is outside the buyer industry");
    const now = new Date();
    const selectedVariants = input.variantId
      ? product.variants.filter(({ id }) => id === input.variantId)
      : product.variants;
    if (input.variantId && !selectedVariants.length)
      throw new NotFoundException("Product variant not found");
    const offers = selectedVariants
      .flatMap((variant) =>
        variant.supplierOffers.map((offer) => {
          const decision = resolvePriceRules({
            quantity: input.quantity,
            at: now,
            contracts: offer.contractPrices.map((price) => ({
              id: price.id,
              amountMinor: price.amountMinor.toString(),
              currency: price.currency,
              minimumQuantity: price.minimumQuantity.toString(),
              validFrom: price.validFrom,
              validTo: price.validTo,
              priority: price.priority,
            })),
            tiers: offer.priceTiers.map((price) => ({
              id: price.id,
              amountMinor: price.unitPriceMinor.toString(),
              currency: price.currency,
              minimumQuantity: price.minimumQuantity.toString(),
              maximumQuantity: price.maximumQuantity?.toString(),
              validFrom: price.validFrom,
              validTo: price.validTo,
            })),
            base: offer.prices[0]
              ? {
                  id: offer.prices[0].id,
                  amountMinor: offer.prices[0].amountMinor.toString(),
                  currency: offer.prices[0].currency,
                  validFrom: offer.prices[0].validFrom,
                  validTo: offer.prices[0].validTo,
                }
              : null,
          });
          if (decision.source === "UNAVAILABLE" || !decision.amountMinor)
            return null;
          const baseUnits = new Prisma.Decimal(
            offer.packaging?.quantityInBaseUnit ?? offer.baseUnitsPerSaleUnit,
          );
          const normalizedPriceMinor = new Prisma.Decimal(
            decision.amountMinor,
          ).div(baseUnits);
          const balances = offer.inventoryBalances.filter(
            (balance) =>
              (!input.cityId || balance.warehouse.cityId === input.cityId) &&
              balance.freshnessStatus === "FRESH" &&
              Number(balance.quantityAvailable) > 0,
          );
          const delivery = offer.deliveryOptions.filter(
            (option) =>
              !input.cityId ||
              option.method === "NATIONWIDE" ||
              option.method === "CARRIER" ||
              balances.some(
                ({ warehouseId }) => warehouseId === option.warehouseId,
              ),
          );
          const latestCompliance = offer.complianceChecks[0] ?? null;
          const regulatory =
            offer.supplier.regulatoryDetails &&
            typeof offer.supplier.regulatoryDetails === "object" &&
            !Array.isArray(offer.supplier.regulatoryDetails)
              ? (offer.supplier.regulatoryDetails as Record<string, unknown>)
              : {};
          return {
            offerId: offer.id,
            variantId: variant.id,
            supplier: {
              organizationId: offer.supplierOrganizationId,
              name: offer.supplier.organization.displayName,
            },
            supplierSku: offer.supplierSku,
            price: {
              amountMinor: decision.amountMinor,
              currency: decision.currency,
              source: decision.source,
              normalizedPriceMinor: normalizedPriceMinor.toFixed(6),
              baseUnits: baseUnits.toString(),
              normalizedUnit: product.baseUnit?.symbol ?? "base unit",
            },
            packaging: offer.packaging
              ? {
                  id: offer.packaging.id,
                  name: offer.packaging.name,
                  level: offer.packaging.level,
                  quantityInBaseUnit:
                    offer.packaging.quantityInBaseUnit.toString(),
                  unit:
                    offer.saleUnit?.symbol ??
                    product.baseUnit?.symbol ??
                    null,
                }
              : {
                  name: offer.saleUnit?.nameRu ?? "Единица продажи",
                  quantityInBaseUnit: offer.baseUnitsPerSaleUnit.toString(),
                  unit: offer.saleUnit?.symbol ?? null,
                },
            minimumOrderQuantity: offer.minimumOrderQuantity.toString(),
            orderIncrement: offer.orderIncrement.toString(),
            availability: balances.map((balance) => ({
              warehouseId: balance.warehouseId,
              warehouse: balance.warehouse.name,
              cityId: balance.warehouse.cityId,
              quantityAvailable: balance.quantityAvailable.toString(),
              updatedAt: balance.lastSuccessfulSyncAt,
              freshnessExpiresAt: balance.freshnessExpiresAt,
            })),
            delivery: delivery.map((option) => ({
              method: option.method,
              priceType: option.priceType,
              fixedAmountMinor: option.fixedAmountMinor?.toString() ?? null,
              minLeadTimeHours: option.minLeadTimeHours,
              maxLeadTimeHours: option.maxLeadTimeHours,
              temperatureControlled: option.temperatureControlled,
              installationRequired: option.installationRequired,
            })),
            markers: {
              verifiedDocuments: latestCompliance?.status === "PASSED",
              complianceRisk: latestCompliance?.riskLevel ?? null,
              officialDistributor: regulatory.officialDistributor === true,
              supplierWarranty: regulatory.supplierWarranty === true,
              requiresConfirmation:
                offer.confirmationMode === "MANUAL" || balances.length === 0,
            },
          };
        }),
      )
      .filter((offer): offer is NonNullable<typeof offer> => Boolean(offer))
      .sort(
        (left, right) =>
          Number(left.price.normalizedPriceMinor) -
          Number(right.price.normalizedPriceMinor),
      );
    const reviewSummary = await this.reviewSummaries(
      selectedVariants.map(({ id }) => id),
    );
    const summary = this.productReviewSummary(
      selectedVariants.map(({ id }) => id),
      reviewSummary,
    );
    return {
      product: {
        id: product.id,
        name: product.canonicalName,
        description: product.description,
        brand: product.brand?.name ?? null,
        manufacturer: product.manufacturer?.name ?? null,
        category: product.categories[0]?.category.nameRu ?? null,
        media: product.media.map((media) => {
          const metadata =
            media.metadata &&
            typeof media.metadata === "object" &&
            !Array.isArray(media.metadata)
              ? (media.metadata as Record<string, unknown>)
              : {};
          const publicFallbackPath =
            typeof metadata.publicFallbackPath === "string"
              ? metadata.publicFallbackPath
              : null;
          return {
            sourceUrl: media.sourceUrl,
            securePath: media.normalizedStorageKey
              ? `/catalog/media/${media.id}?ticket=${this.mediaAccess.issue(media.id).token}`
              : publicFallbackPath,
            altText: media.altText,
            width: media.width,
            height: media.height,
            metadata,
          };
        }),
        baseUnit: product.baseUnit,
      },
      reviewSummary: summary,
      variants: product.variants.map(publicVariant),
      selectedVariantId: input.variantId ?? null,
      offers,
      comparisonAttributes: this.comparisonAttributes(product),
    };
  }

  private async reviewSummaries(variantIds: string[]) {
    if (!variantIds.length)
      return new Map<string, { count: number; averageRating: number | null }>();
    const rows = await this.prisma.$queryRaw<
      Array<{ productVariantId: string; overallRating: number }>
    >(
      Prisma.sql`SELECT "productVariantId", "overallRating" FROM "VerifiedReview" WHERE "productVariantId" IN (${Prisma.join(variantIds.map((id) => Prisma.sql`${id}::uuid`))}) AND "status" = 'PUBLISHED'`,
    );
    const grouped = new Map<string, number[]>();
    for (const row of rows)
      if (row.productVariantId)
        grouped.set(row.productVariantId, [
          ...(grouped.get(row.productVariantId) ?? []),
          row.overallRating,
        ]);
    return new Map(
      [...grouped.entries()].map(([variantId, ratings]) => [
        variantId,
        {
          count: ratings.length,
          averageRating:
            ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
        },
      ]),
    );
  }

  private productReviewSummary(
    variantIds: string[],
    summaries: Map<string, { count: number; averageRating: number | null }>,
  ) {
    const values = variantIds
      .map((id) => summaries.get(id))
      .filter(
        (value): value is { count: number; averageRating: number | null } =>
          Boolean(value),
      );
    const count = values.reduce((sum, value) => sum + value.count, 0);
    return {
      count,
      averageRating: count
        ? values.reduce(
            (sum, value) => sum + (value.averageRating ?? 0) * value.count,
            0,
          ) / count
        : null,
    };
  }

  private loadProducts(
    productIds: string[],
    buyerOrganizationId?: string,
    quantity = 1,
  ) {
    const now = new Date();
    return this.prisma.product.findMany({
      where: { id: { in: productIds }, status: "ACTIVE" },
      include: {
        brand: true,
        manufacturer: true,
        baseUnit: true,
        categories: { include: { category: true } },
        media: { where: { status: "READY" }, orderBy: { sortOrder: "asc" } },
        industries: { include: { industry: true } },
        attributeValues: { include: { attribute: true } },
        searchDocument: true,
        variants: {
          where: { status: "ACTIVE" },
          include: {
            saleUnit: true,
            attributeValues: { include: { attribute: true } },
            supplierOffers: {
              where: {
                status: "ACTIVE",
                publication: {
                  is: {
                    status: { in: ["PUBLISHED", "RESTRICTED"] },
                    marketplaceVisible: true,
                  },
                },
              },
              include: {
                supplier: { include: { organization: true } },
                publication: true,
                saleUnit: true,
                packaging: true,
                prices: {
                  where: {
                    status: "ACTIVE",
                    validFrom: { lte: now },
                    OR: [{ validTo: null }, { validTo: { gte: now } }],
                    AND: [
                      {
                        OR: [
                          { freshnessExpiresAt: null },
                          { freshnessExpiresAt: { gte: now } },
                        ],
                      },
                    ],
                  },
                  orderBy: { validFrom: "desc" },
                  take: 1,
                },
                priceTiers: {
                  where: {
                    minimumQuantity: { lte: quantity },
                    validFrom: { lte: now },
                    OR: [
                      { maximumQuantity: null },
                      { maximumQuantity: { gte: quantity } },
                    ],
                    AND: [
                      { OR: [{ validTo: null }, { validTo: { gte: now } }] },
                    ],
                  },
                },
                contractPrices: {
                  where: {
                    ...(buyerOrganizationId ? { buyerOrganizationId } : {}),
                    status: "ACTIVE",
                    minimumQuantity: { lte: quantity },
                    validFrom: { lte: now },
                    OR: [{ validTo: null }, { validTo: { gte: now } }],
                  },
                },
                inventoryBalances: {
                  include: { warehouse: true },
                  orderBy: { quantityAvailable: "desc" },
                },
                deliveryOptions: {
                  where: { status: "ACTIVE" },
                  include: { warehouse: true },
                },
                complianceChecks: { orderBy: { evaluatedAt: "desc" }, take: 1 },
              },
            },
          },
        },
      },
    });
  }

  private toSearchItem(
    product: Awaited<ReturnType<SearchService["loadProducts"]>>[number],
    input: SearchCatalogInput,
    rank: number,
    reviewSummaries: Map<
      string,
      { count: number; averageRating: number | null }
    >,
    promotions: PublicSearchPromotion[] = [],
  ) {
    const categoryIds = product.categories.map(({ categoryId }) => categoryId);
    const offers = product.variants.flatMap((variant) =>
      variant.supplierOffers
        .filter((offer) => {
          const allowedBuyers = offer.publication?.allowedBuyerIds;
          if (
            Array.isArray(allowedBuyers) &&
            allowedBuyers.length > 0 &&
            !allowedBuyers.includes(input.buyerOrganizationId)
          )
            return false;
          const allowedCities = offer.publication?.allowedCityIds;
          if (
            input.cityId &&
            Array.isArray(allowedCities) &&
            allowedCities.length > 0 &&
            !allowedCities.includes(input.cityId)
          )
            return false;
          if (
            input.supplierOrganizationId &&
            offer.supplierOrganizationId !== input.supplierOrganizationId
          )
            return false;
          if (
            input.warehouseId &&
            !offer.inventoryBalances.some(
              ({ warehouseId }) => warehouseId === input.warehouseId,
            )
          )
            return false;
          if (
            input.cityId &&
            !offer.inventoryBalances.some(
              ({ warehouse }) => warehouse.cityId === input.cityId,
            ) &&
            !offer.deliveryOptions.some(({ method }) =>
              ["NATIONWIDE", "CARRIER", "MARKETPLACE_LOGISTICS"].includes(
                method,
              ),
            )
          )
            return false;
          if (
            input.deliveryMethod &&
            !offer.deliveryOptions.some(
              ({ method }) => method === input.deliveryMethod,
            )
          )
            return false;
          return true;
        })
        .map((offer) => {
          const promotion = promotions.find((item) => {
            if (
              item.supplierOrganizationId !== offer.supplierOrganizationId ||
              !item.percentageBasisPoints
            )
              return false;
            const scope =
              item.scope &&
              typeof item.scope === "object" &&
              !Array.isArray(item.scope)
                ? (item.scope as Record<string, string[]>)
                : {};
            const locations = offer.inventoryBalances.length
              ? offer.inventoryBalances
              : [null];
            return locations.some((balance) =>
              scopeMatches(scope, {
                offerId: offer.id,
                productId: product.id,
                categoryIds,
                cityId: input.cityId ?? balance?.warehouse.cityId ?? null,
                warehouseId: balance?.warehouseId ?? null,
              }),
            );
          });
          return {
            id: offer.id,
            variantId: variant.id,
            supplier: {
              id: offer.supplierOrganizationId,
              name: offer.supplier.organization.displayName,
            },
            priceMinor: offer.prices[0]?.amountMinor.toString() ?? null,
            currency: offer.prices[0]?.currency ?? null,
            normalizedPriceMinor: offer.prices[0]
              ? new Prisma.Decimal(offer.prices[0].amountMinor)
                  .div(
                    offer.packaging?.quantityInBaseUnit ??
                      offer.baseUnitsPerSaleUnit,
                  )
                  .toFixed(6)
              : null,
            packaging: offer.packaging
              ? {
                  name: offer.packaging.name,
                  quantityInBaseUnit:
                    offer.packaging.quantityInBaseUnit.toString(),
                  unit:
                    offer.saleUnit?.symbol ??
                    product.baseUnit?.symbol ??
                    null,
                }
              : {
                  name: offer.saleUnit?.nameRu ?? null,
                  quantityInBaseUnit: offer.baseUnitsPerSaleUnit.toString(),
                  unit: offer.saleUnit?.symbol ?? null,
                },
            available: offer.inventoryBalances.some(
              (balance) =>
                balance.freshnessStatus === "FRESH" &&
                Number(balance.quantityAvailable) > 0,
            ),
            freshness: offer.inventoryBalances.map(
              ({ lastSuccessfulSyncAt, freshnessStatus, warehouse }) => ({
                status: freshnessStatus,
                updatedAt: lastSuccessfulSyncAt,
                cityId: warehouse.cityId,
              }),
            ),
            confirmationMode: offer.confirmationMode,
            deliveryMethods: offer.deliveryOptions.map(({ method }) => method),
            promotion: promotion
              ? {
                  label: promotion.sponsorshipLabel ?? promotion.name,
                  percentage: promotion.percentageBasisPoints! / 100,
                  endsAt: promotion.endsAt.toISOString(),
                }
              : null,
          };
        }),
    );
    const facets =
      product.searchDocument?.facets &&
      typeof product.searchDocument.facets === "object" &&
      !Array.isArray(product.searchDocument.facets)
        ? (product.searchDocument.facets as Record<string, unknown>)
        : {};
    const rawRanking =
      facets.ranking &&
      typeof facets.ranking === "object" &&
      !Array.isArray(facets.ranking)
        ? (facets.ranking as Record<string, unknown>)
        : {};
    const ranking = {
      source: "SUPPLIER_SIGNALS",
      score: Number(rawRanking.score ?? 0),
      sellerCount: Number(rawRanking.sellerCount ?? offers.length),
      orders30d: Number(rawRanking.orders30d ?? 0),
      unitsSold30d: Number(rawRanking.unitsSold30d ?? 0),
    };
    const badges = [
      ...(offers.some(({ promotion }) => Boolean(promotion)) ? ["Акция"] : []),
      ...(ranking.unitsSold30d > 0 ? ["Хит продаж"] : []),
      ...(input.sort === "BEST_PRICE" && offers.length ? ["Лучшая цена"] : []),
      ...(ranking.score > 0 && ranking.unitsSold30d === 0
        ? ["Популярное"]
        : []),
    ];
    return {
      id: product.id,
      slug: product.slug,
      name: product.canonicalName,
      description: product.description,
      descriptionSources: product.descriptionSources,
      brand: product.brand?.name ?? null,
      manufacturer: product.manufacturer?.name ?? null,
      productType: product.productType,
      regulatoryClass: product.regulatoryClass,
      media: product.media.map((media) => ({
        id: media.id,
        sourceUrl: media.sourceUrl,
        securePath: media.normalizedStorageKey
          ? `/catalog/media/${media.id}?ticket=${this.mediaAccess.issue(media.id).token}`
          : null,
        normalizedStorageKey: media.normalizedStorageKey,
        altText: media.altText,
        width: media.width,
        height: media.height,
        metadata: media.metadata,
      })),
      categories: product.categories.map(({ category }) => ({
        id: category.id,
        name: category.nameRu,
      })),
      minNormalizedPriceMinor:
        product.searchDocument?.minNormalizedPriceMinor?.toString() ?? null,
      maxNormalizedPriceMinor:
        product.searchDocument?.maxNormalizedPriceMinor?.toString() ?? null,
      isAvailable: product.searchDocument?.isAvailable ?? false,
      reviewSummary: this.productReviewSummary(
        product.variants.map(({ id }) => id),
        reviewSummaries,
      ),
      rank,
      ranking,
      badges,
      variants: product.variants.map(publicVariant),
      offers,
    };
  }

  private aggregateFacets(
    items: Array<ReturnType<SearchService["toSearchItem"]>>,
  ) {
    const categoryCounts = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    const suppliers = new Map<
      string,
      { id: string; name: string; count: number }
    >();
    for (const item of items) {
      for (const category of item.categories)
        categoryCounts.set(category.id, {
          ...category,
          count: (categoryCounts.get(category.id)?.count ?? 0) + 1,
        });
      for (const offer of item.offers)
        suppliers.set(offer.supplier.id, {
          ...offer.supplier,
          count: (suppliers.get(offer.supplier.id)?.count ?? 0) + 1,
        });
    }
    return {
      categories: [...categoryCounts.values()].sort(
        (a, b) => b.count - a.count,
      ),
      suppliers: [...suppliers.values()].sort((a, b) => b.count - a.count),
    };
  }

  private comparisonAttributes(
    product: Awaited<ReturnType<SearchService["loadProducts"]>>[number],
  ) {
    return [
      ...product.attributeValues.map((value) => ({
        scope: "PRODUCT",
        code: value.attribute.code,
        name: value.attribute.nameRu,
        value: this.attributeValue(value),
      })),
      ...product.variants.flatMap((variant) =>
        variant.attributeValues.map((value) => ({
          scope: "VARIANT",
          variantId: variant.id,
          code: value.attribute.code,
          name: value.attribute.nameRu,
          value: this.attributeValue(value),
        })),
      ),
    ];
  }

  private attributeValue(value: {
    valueText: string | null;
    valueInteger: bigint | null;
    valueDecimal: Prisma.Decimal | null;
    valueBoolean: boolean | null;
    valueDate: Date | null;
    valueOptionId: string | null;
    valueOptionIds: Prisma.JsonValue;
    rangeMin: Prisma.Decimal | null;
    rangeMax: Prisma.Decimal | null;
  }) {
    return (
      value.valueText ??
      value.valueInteger?.toString() ??
      value.valueDecimal?.toString() ??
      value.valueBoolean ??
      value.valueDate?.toISOString().slice(0, 10) ??
      value.valueOptionId ??
      value.valueOptionIds ??
      (value.rangeMin || value.rangeMax
        ? {
            min: value.rangeMin?.toString() ?? null,
            max: value.rangeMax?.toString() ?? null,
          }
        : null)
    );
  }
}
