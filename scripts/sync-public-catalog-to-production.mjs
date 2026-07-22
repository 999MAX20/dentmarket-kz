import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "../apps/api/node_modules/@prisma/client/index.js";

const root = path.resolve(process.cwd());
const apply = process.argv.includes("--apply");
const catalog = JSON.parse(
  await fs.readFile(
    path.join(root, "apps/buyer-web/app/data/public-catalog-fallback.json"),
    "utf8",
  ),
);
const mediaManifest = JSON.parse(
  await fs.readFile(
    path.join(root, "apps/buyer-web/app/data/public-catalog-media.json"),
    "utf8",
  ),
);
const prisma = new PrismaClient();

const normalize = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
const code = (value) =>
  normalize(value)
    .toLocaleLowerCase("ru")
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "stomatology";
const canonicalKey = (product) =>
  [product.brand || "Без бренда", product.name]
    .map(normalize)
    .join("|")
    .toLocaleLowerCase("ru");
const slugFor = (product) =>
  `canonical-${crypto.createHash("sha256").update(canonicalKey(product)).digest("hex").slice(0, 32)}`;
const productType = (name) =>
  /установ|рентген|сканер|компрессор|автоклав|печь|фрезер|оборудован/i.test(
    name,
  )
    ? "equipment"
    : "consumable";
const batch = (items, size = 100) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  await prisma.$queryRaw`SELECT 1`;
  const industry = await prisma.industry.findUnique({
    where: { code: "dentistry-kz" },
  });
  if (!industry)
    throw new Error(
      "Industry dentistry-kz is missing; run Prisma migrations and seed first",
    );
  const units = new Map(
    (await prisma.unitOfMeasure.findMany()).flatMap((unit) => [
      [unit.code, unit],
      [unit.symbol, unit],
    ]),
  );
  const fallbackUnit = units.get("piece") ?? units.get("шт") ?? null;
  const categoryCache = new Map();
  const brandCache = new Map();
  const manufacturerCache = new Map();
  const getCategory = async (name) => {
    const categoryCode = code(name);
    if (categoryCache.has(categoryCode)) return categoryCache.get(categoryCode);
    const existing = await prisma.category.findUnique({
      where: {
        industryId_code: { industryId: industry.id, code: categoryCode },
      },
    });
    const category =
      existing ??
      (apply
        ? await prisma.category.create({
            data: {
              industryId: industry.id,
              code: categoryCode,
              nameRu: name,
              nameKk: name,
              path: categoryCode,
            },
          })
        : { id: `dry-run-${categoryCode}`, code: categoryCode });
    categoryCache.set(categoryCode, category);
    return category;
  };

  const getBrand = async (name) => {
    const normalizedName = normalize(name);
    if (!normalizedName) return null;
    if (brandCache.has(normalizedName)) return brandCache.get(normalizedName);
    const existing = await prisma.brand.findUnique({
      where: { name: normalizedName },
    });
    const brand =
      existing ??
      (apply
        ? await prisma.brand.create({ data: { name: normalizedName } })
        : {
            id: `dry-run-brand-${code(normalizedName)}`,
            name: normalizedName,
          });
    brandCache.set(normalizedName, brand);
    return brand;
  };
  const getManufacturer = async (name) => {
    const normalizedName = normalize(name);
    if (!normalizedName) return null;
    if (manufacturerCache.has(normalizedName))
      return manufacturerCache.get(normalizedName);
    const existing = await prisma.manufacturer.findUnique({
      where: { name: normalizedName },
    });
    const manufacturer =
      existing ??
      (apply
        ? await prisma.manufacturer.create({ data: { name: normalizedName } })
        : {
            id: `dry-run-manufacturer-${code(normalizedName)}`,
            name: normalizedName,
          });
    manufacturerCache.set(normalizedName, manufacturer);
    return manufacturer;
  };

  const summary = {
    sourceCards: catalog.products.length,
    existing: 0,
    created: 0,
    variantsEnsured: 0,
    categoriesEnsured: 0,
    brandsEnsured: 0,
    manufacturersEnsured: 0,
    mediaLinked: 0,
    searchDocumentsEnsured: 0,
    mode: apply ? "apply" : "dry-run",
  };
  for (const productInput of catalog.products) {
    const product = {
      ...productInput,
      name: normalize(productInput.name),
      category: normalize(productInput.category) || "Стоматология",
      slug: slugFor(productInput),
    };
    const category = await getCategory(product.category);
    const brand = await getBrand(product.brand);
    const manufacturer = await getManufacturer(product.manufacturer);
    const media = mediaManifest.entries[product.sourceUrl ?? ""];
    const description =
      product.description ||
      [
        product.name,
        `Категория: ${product.category}.`,
        product.brand ? `Бренд: ${product.brand}.` : null,
        product.manufacturer ? `Производитель: ${product.manufacturer}.` : null,
      ]
        .filter(Boolean)
        .join(" ");
    const metadata = {
      source: "public-catalog-fallback",
      sourceId: product.id,
      sourceUrl: product.sourceUrl ?? null,
      sourceUpdatedAt: product.sourceUpdatedAt ?? null,
      photoStatus: product.photoStatus ?? "category_illustration",
      catalogAliases: product.aliases ?? [],
      importedAsCanonicalDraft: true,
    };
    if (!apply) {
      const existing = await prisma.product.findUnique({
        where: { slug: product.slug },
        select: { id: true },
      });
      if (existing) summary.existing += 1;
      else summary.created += 1;
      summary.categoriesEnsured += category.id.startsWith("dry-run-") ? 1 : 0;
      summary.mediaLinked += media ? 1 : 0;
      summary.variantsEnsured += product.variants?.length || 1;
      summary.searchDocumentsEnsured += 1;
      continue;
    }
    const existing = await prisma.product.findUnique({
      where: { slug: product.slug },
      select: { id: true, externalMetadata: true },
    });
    const saved = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        canonicalName: product.name,
        description,
        descriptionSources: {
          source: "supplier-catalog",
          sourceUrl: product.sourceUrl ?? null,
        },
        productType: productType(product.name),
        brandId: brand?.id ?? null,
        manufacturerId: manufacturer?.id ?? null,
        status: product.catalogSource === "manufacturer" ? "ACTIVE" : "DRAFT",
        externalMetadata: {
          ...(existing?.externalMetadata &&
          typeof existing.externalMetadata === "object"
            ? existing.externalMetadata
            : {}),
          ...metadata,
        },
      },
      create: {
        canonicalName: product.name,
        slug: product.slug,
        description,
        descriptionSources: {
          source: "supplier-catalog",
          sourceUrl: product.sourceUrl ?? null,
        },
        productType: productType(product.name),
        brandId: brand?.id ?? null,
        manufacturerId: manufacturer?.id ?? null,
        status: product.catalogSource === "manufacturer" ? "ACTIVE" : "DRAFT",
        externalMetadata: metadata,
      },
    });
    if (existing) summary.existing += 1;
    else summary.created += 1;
    await prisma.productIndustry.upsert({
      where: {
        productId_industryId: { productId: saved.id, industryId: industry.id },
      },
      update: {},
      create: { productId: saved.id, industryId: industry.id },
    });
    await prisma.productCategory.upsert({
      where: {
        productId_categoryId: { productId: saved.id, categoryId: category.id },
      },
      update: {},
      create: { productId: saved.id, categoryId: category.id },
    });
    const desiredVariants = product.variants?.length
      ? product.variants
      : [{ sku: null, gtin: null, label: "Стандартный вариант", attributes: {} }];
    const existingVariants = await prisma.productVariant.findMany({
      where: { productId: saved.id },
      include: { _count: { select: { supplierOffers: true } } },
      orderBy: { createdAt: "asc" },
    });
    for (const [variantIndex, desired] of desiredVariants.entries()) {
      let variant = desired.sku
        ? existingVariants.find(
            (candidate) =>
              candidate.sku?.toLocaleLowerCase("ru") ===
              desired.sku.toLocaleLowerCase("ru"),
          )
        : existingVariants.find((candidate) => !candidate.sku && !candidate.gtin);
      if (
        !variant &&
        variantIndex === 0 &&
        desired.sku &&
        existingVariants[0] &&
        !existingVariants[0].sku &&
        !existingVariants[0].gtin &&
        existingVariants[0]._count.supplierOffers === 0
      )
        variant = existingVariants[0];
      const variantData = {
        status: product.catalogSource === "manufacturer" ? "ACTIVE" : "DRAFT",
        sku: desired.sku ?? null,
        gtin: desired.gtin ?? null,
        saleUnitId: fallbackUnit?.id ?? null,
        externalMetadata: {
          ...(variant?.externalMetadata &&
          typeof variant.externalMetadata === "object"
            ? variant.externalMetadata
            : {}),
          sourceId: product.id,
          sourceUrl: product.sourceUrl ?? null,
          label: desired.label,
          attributes: desired.attributes ?? {},
          manufacturerReference: desired.sku ?? null,
        },
      };
      if (variant)
        await prisma.productVariant.update({
          where: { id: variant.id },
          data: variantData,
        });
      else
        await prisma.productVariant.create({
          data: { productId: saved.id, ...variantData },
        });
      summary.variantsEnsured += 1;
    }
    if (media) {
      const existingMedia = await prisma.productMedia.findFirst({
        where: { productId: saved.id, sourceUrl: media.sourceUrl },
      });
      if (existingMedia)
        await prisma.productMedia.update({
          where: { id: existingMedia.id },
          data: {
            altText: media.altText,
            width: media.width,
            height: media.height,
            metadata: {
              ...media.metadata,
              publicFallbackPath: media.securePath,
            },
            status: existingMedia.normalizedStorageKey ? "READY" : "PENDING",
          },
        });
      else
        await prisma.productMedia.create({
          data: {
            productId: saved.id,
            sourceUrl: media.sourceUrl,
            altText: media.altText,
            width: media.width,
            height: media.height,
            mimeType: media.mimeType ?? "image/webp",
            status: "PENDING",
            metadata: {
              ...media.metadata,
              publicFallbackPath: media.securePath,
            },
          },
        });
      summary.mediaLinked += 1;
    }
    const terms = [
      product.name,
      product.brand,
      product.manufacturer,
      product.category,
      ...(product.attributes ?? []).flat(),
      ...(product.aliases ?? []),
    ]
      .filter(Boolean)
      .join(" ");
    await prisma.productSearchDocument.upsert({
      where: { productId: saved.id },
      update: {
        searchableText: terms,
        normalizedText: terms.toLocaleLowerCase("ru"),
        facets: {
          source: "public-catalog-fallback",
          category: product.category,
          brand: product.brand ?? null,
        },
        categoryIds: [category.id],
        industryIds: [industry.id],
        isAvailable: false,
      },
      create: {
        productId: saved.id,
        searchableText: terms,
        normalizedText: terms.toLocaleLowerCase("ru"),
        facets: {
          source: "public-catalog-fallback",
          category: product.category,
          brand: product.brand ?? null,
        },
        categoryIds: [category.id],
        industryIds: [industry.id],
        isAvailable: false,
      },
    });
    summary.searchDocumentsEnsured += 1;
  }
  summary.brandsEnsured = brandCache.size;
  summary.manufacturersEnsured = manufacturerCache.size;
  console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
} finally {
  await prisma.$disconnect();
}
