import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { normalizeCatalogText } from "../imports/matching";
import { BackgroundQueueService } from "../../platform/jobs/background-queue.service";

function scalarValue(value: { valueText: string | null; valueInteger: bigint | null; valueDecimal: Prisma.Decimal | null; valueBoolean: boolean | null; valueDate: Date | null; valueOptionId: string | null; valueOptionIds: Prisma.JsonValue; rangeMin: Prisma.Decimal | null; rangeMax: Prisma.Decimal | null }) {
  if (value.valueText != null) return value.valueText;
  if (value.valueInteger != null) return value.valueInteger.toString();
  if (value.valueDecimal != null) return value.valueDecimal.toString();
  if (value.valueBoolean != null) return value.valueBoolean;
  if (value.valueDate != null) return value.valueDate.toISOString().slice(0, 10);
  if (value.valueOptionId != null) return value.valueOptionId;
  if (value.valueOptionIds != null) return value.valueOptionIds;
  if (value.rangeMin != null || value.rangeMax != null) return { min: value.rangeMin?.toString() ?? null, max: value.rangeMax?.toString() ?? null };
  return null;
}

@Injectable()
export class SearchProjectionService implements OnModuleInit {
  private readonly logger = new Logger(SearchProjectionService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly backgroundQueue: BackgroundQueueService) {}

  onModuleInit() { this.backgroundQueue.register("search.rebuild-changed", async () => this.runChangedRebuild()); }

  @Cron("*/30 * * * * *")
  async scheduledRebuild() {
    const slot = Math.floor(Date.now() / 30_000);
    if (await this.backgroundQueue.enqueue("search.rebuild-changed", {}, { jobId: `search-${slot}` })) return;
    await this.runChangedRebuild();
  }

  private async runChangedRebuild() {
    if (this.running) return;
    this.running = true;
    try { await this.rebuildChanged(); }
    catch (error) { this.logger.error("Search projection rebuild failed", error instanceof Error ? error.stack : undefined); }
    finally { this.running = false; }
  }

  async rebuildChanged() {
    const stale = await this.prisma.product.findMany({ where: { OR: [{ searchDocument: null }, { searchDocument: { is: { updatedAt: { lt: new Date(Date.now() - 30_000) } } } }] }, select: { id: true }, take: 250 });
    for (const { id } of stale) await this.rebuildProduct(id);
    return { rebuilt: stale.length };
  }

  async rebuildAll() {
    const products = await this.prisma.product.findMany({ select: { id: true }, orderBy: { id: "asc" } });
    for (const { id } of products) await this.rebuildProduct(id);
    return { rebuilt: products.length };
  }

  async rebuildProduct(productId: string) {
    const now = new Date();
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: {
      brand: true,
      manufacturer: true,
      categories: { include: { category: true } },
      industries: { include: { industry: true } },
      attributeValues: { include: { attribute: true } },
      variants: { include: {
        attributeValues: { include: { attribute: true } },
        packagings: { where: { status: "ACTIVE" }, include: { unit: true } },
        supplierOffers: { where: { status: "ACTIVE", publication: { is: { status: { in: ["PUBLISHED", "RESTRICTED"] }, marketplaceVisible: true } } }, include: {
          supplier: { include: { organization: true } },
          publication: true,
          packaging: { include: { unit: true } },
          saleUnit: true,
          prices: { where: { status: "ACTIVE", validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }], AND: [{ OR: [{ freshnessExpiresAt: null }, { freshnessExpiresAt: { gte: now } }] }] }, orderBy: { validFrom: "desc" }, take: 1 },
          inventoryBalances: { include: { warehouse: true } },
          deliveryOptions: { where: { status: "ACTIVE" } },
        } },
      } },
    } });
    if (!product) return null;
    const offers = product.variants.flatMap(({ supplierOffers }) => supplierOffers);
    const prices = offers.flatMap((offer) => offer.prices.map((price) => ({ amount: new Prisma.Decimal(price.amountMinor), normalized: new Prisma.Decimal(price.amountMinor).div(offer.packaging?.quantityInBaseUnit ?? offer.baseUnitsPerSaleUnit) })));
    const balances = offers.flatMap(({ inventoryBalances }) => inventoryBalances);
    const attributes = Object.fromEntries([
      ...product.attributeValues.map((value) => [value.attribute.code, scalarValue(value)]),
      ...product.variants.flatMap(({ attributeValues }) => attributeValues.map((value) => [value.attribute.code, scalarValue(value)])),
    ]);
    const texts = [
      product.canonicalName,
      product.brand?.name,
      product.manufacturer?.name,
      product.manufacturerSku,
      product.gtin,
      ...product.categories.map(({ category }) => `${category.nameRu} ${category.nameKk}`),
      ...product.industries.map(({ industry }) => `${industry.nameRu} ${industry.nameKk}`),
      ...product.variants.flatMap((variant) => [variant.sku, variant.gtin, ...variant.packagings.flatMap((packaging) => [packaging.name, packaging.code, packaging.gtin])]),
      ...offers.flatMap((offer) => [offer.supplierSku, offer.externalId, offer.supplier.organization.displayName]),
      ...Object.entries(attributes).flatMap(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
      product.externalMetadata && typeof product.externalMetadata === "object" ? JSON.stringify(product.externalMetadata) : null,
    ].filter((value): value is string => Boolean(value));
    const categoryIds = product.categories.map(({ categoryId }) => categoryId);
    const industryIds = product.industries.map(({ industryId }) => industryId);
    const supplierIds = [...new Set(offers.map(({ supplierOrganizationId }) => supplierOrganizationId))];
    const warehouseIds = [...new Set(balances.map(({ warehouseId }) => warehouseId))];
    const cityIds = [...new Set(balances.map(({ warehouse }) => warehouse.cityId).filter((id): id is string => Boolean(id)))];
    const deliveryMethods = [...new Set(offers.flatMap(({ deliveryOptions }) => deliveryOptions.map(({ method }) => method)))];
    const isAvailable = balances.some((balance) => balance.freshnessStatus === "FRESH" && Number(balance.quantityAvailable) > 0 && (!balance.freshnessExpiresAt || balance.freshnessExpiresAt >= now));
    const minPrice = prices.length ? prices.reduce((min, price) => price.amount.lt(min) ? price.amount : min, prices[0]!.amount) : null;
    const maxPrice = prices.length ? prices.reduce((max, price) => price.amount.gt(max) ? price.amount : max, prices[0]!.amount) : null;
    const minNormalized = prices.length ? prices.reduce((min, price) => price.normalized.lt(min) ? price.normalized : min, prices[0]!.normalized) : null;
    const maxNormalized = prices.length ? prices.reduce((max, price) => price.normalized.gt(max) ? price.normalized : max, prices[0]!.normalized) : null;
    const searchableText = texts.join(" ");
    return this.prisma.productSearchDocument.upsert({ where: { productId }, update: {
      searchableText,
      normalizedText: normalizeCatalogText(searchableText),
      facets: { attributes, categoryIds, industryIds, supplierIds, warehouseIds, cityIds, deliveryMethods, productType: product.productType, regulatoryClass: product.regulatoryClass },
      minPrice: minPrice?.div(100),
      maxPrice: maxPrice?.div(100),
      minPriceMinor: minPrice,
      maxPriceMinor: maxPrice,
      minNormalizedPriceMinor: minNormalized,
      maxNormalizedPriceMinor: maxNormalized,
      isAvailable,
      categoryIds,
      industryIds,
      supplierIds,
      warehouseIds,
      cityIds,
      deliveryMethods,
      projectionVersion: { increment: 1 },
    }, create: {
      productId,
      searchableText,
      normalizedText: normalizeCatalogText(searchableText),
      facets: { attributes, categoryIds, industryIds, supplierIds, warehouseIds, cityIds, deliveryMethods, productType: product.productType, regulatoryClass: product.regulatoryClass },
      minPrice: minPrice?.div(100),
      maxPrice: maxPrice?.div(100),
      minPriceMinor: minPrice,
      maxPriceMinor: maxPrice,
      minNormalizedPriceMinor: minNormalized,
      maxNormalizedPriceMinor: maxNormalized,
      isAvailable,
      categoryIds,
      industryIds,
      supplierIds,
      warehouseIds,
      cityIds,
      deliveryMethods,
    } });
  }
}
