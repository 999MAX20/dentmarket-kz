import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = path.resolve(process.cwd());
const files = process.argv.slice(2);
const startIndex = Number(process.env.IMPORT_START_INDEX || 0);
const inputFiles = files.length
  ? files
  : [
      "data/imports/medstom-catalog.csv",
      "data/imports/kazdentservice-catalog.csv",
    ];
const industryCode = process.env.CANONICAL_INDUSTRY_CODE || "dentistry-kz";
const industry = await prisma.industry.findUniqueOrThrow({
  where: { code: industryCode },
});
const units = new Map(
  (await prisma.unitOfMeasure.findMany()).flatMap((unit) => [
    [unit.code, unit],
    [unit.symbol, unit],
  ]),
);
const unitFor = (value) =>
  units.get(
    String(value || "")
      .trim()
      .toLowerCase(),
  ) ??
  units.get("piece") ??
  units.get("шт");
const slug = (source, externalId) =>
  `${source}-${String(externalId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)}`;
const canonicalKey = (row) =>
  [row.gtin, row.name, row.brand, row.manufacturer, row.category]
    .map((value) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("ru"),
    )
    .filter(Boolean)
    .join("|");
const canonicalSlug = (row) =>
  `canonical-${crypto.createHash("sha256").update(canonicalKey(row)).digest("hex").slice(0, 32)}`;
const code = (value) =>
  String(
    value ||
      (industryCode === "beauty-kz"
        ? "professional-cosmetics"
        : "стоматология"),
  )
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "стоматология";
const productType = (name) =>
  /установ|рентген|сканер|компрессор|автоклав|печь|фрезер|оборудован/i.test(
    name,
  )
    ? "equipment"
    : "consumable";
const beautyCategory = (value) => {
  const input = String(value || "").toLocaleLowerCase("ru");
  if (industryCode !== "beauty-kz") return value;
  if (/волос|шампун|кондиционер|укладк|лакс/i.test(input)) return "hair-care";
  if (/тело|ног|рук|дезодорант|скраб|масл/i.test(input)) return "body-care";
  if (/лиц|крем|сыворот|пилинг|маск|губ/i.test(input)) return "face-care";
  if (/мужчин|брит/i.test(input)) return "professional-cosmetics";
  return "professional-cosmetics";
};
async function safeBrand(name) {
  if (!name) return null;
  const existing = await prisma.brand.findUnique({ where: { name } });
  if (existing) return existing;
  try {
    return await prisma.brand.create({ data: { name } });
  } catch {
    return prisma.brand.findUnique({ where: { name } });
  }
}
async function safeManufacturer(name) {
  if (!name) return null;
  const existing = await prisma.manufacturer.findUnique({ where: { name } });
  if (existing) return existing;
  try {
    return await prisma.manufacturer.create({ data: { name } });
  } catch {
    return prisma.manufacturer.findUnique({ where: { name } });
  }
}
const categoryCache = new Map();
async function safeCategory(categoryCode, nameRu) {
  const existing = await prisma.category.findUnique({
    where: { industryId_code: { industryId: industry.id, code: categoryCode } },
  });
  if (existing) return existing;
  if (categoryCache.has(categoryCode)) return categoryCache.get(categoryCode);
  const created = await (async () => {
    try {
      return await prisma.category.create({
        data: {
          industryId: industry.id,
          code: categoryCode,
          nameRu,
          nameKk: nameRu,
          path: categoryCode,
        },
      });
    } catch {
      return prisma.category.findUnique({
        where: {
          industryId_code: { industryId: industry.id, code: categoryCode },
        },
      });
    }
  })();
  categoryCache.set(categoryCode, created);
  return created;
}

let created = 0;
let updated = 0;
let variants = 0;
for (const relative of inputFiles) {
  const source = path
    .basename(relative, path.extname(relative))
    .replace(/-catalog$/, "");
  const rows = parse(await fs.readFile(path.resolve(root, relative)), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  });
  const processRow = async (row) => {
    const name = String(row.name || "")
      .replace(/\s+/g, " ")
      .trim();
    const externalId = String(row.externalId || "").trim();
    if (!name || !externalId) return;
    const saleUnit = unitFor(row.unit);
    const categoryCode = code(beautyCategory(row.category));
    const category = await safeCategory(
      categoryCode,
      row.category || "Стоматология",
    );
    const brand = await safeBrand(String(row.brand || "").trim());
    const manufacturer = await safeManufacturer(
      String(row.manufacturer || "").trim(),
    );
    const productSlug = canonicalSlug(row);
    const existing = await prisma.product.findUnique({
      where: { slug: productSlug },
      select: { id: true, externalMetadata: true },
    });
    const existingBySource = await prisma.product.findFirst({
      where: {
        AND: [
          { externalMetadata: { path: ["source"], equals: source } },
          { externalMetadata: { path: ["externalId"], equals: externalId } },
        ],
      },
      select: { id: true, externalMetadata: true },
    });
    const previousProduct = existingBySource ?? existing;
    const previousMetadata =
      previousProduct?.externalMetadata &&
      typeof previousProduct.externalMetadata === "object" &&
      !Array.isArray(previousProduct.externalMetadata)
        ? previousProduct.externalMetadata
        : {};
    const sourceRecord = {
      source,
      externalId,
      sourceUrl: row.sourceUrl || null,
    };
    const previousSourceRecords = Array.isArray(previousMetadata.sourceRecords)
      ? previousMetadata.sourceRecords
      : [];
    const mergedMetadata = {
      ...previousMetadata,
      canonicalKey: canonicalKey(row),
      source,
      externalId,
      sourceUrl: row.sourceUrl || null,
      sourceUpdatedAt: row.sourceUpdatedAt || null,
      sourceRecords: [
        ...previousSourceRecords.filter(
          (item) => JSON.stringify(item) !== JSON.stringify(sourceRecord),
        ),
        sourceRecord,
      ],
      imageSources: [
        ...(Array.isArray(previousMetadata.imageSources)
          ? previousMetadata.imageSources
          : []),
        row.imageUrl,
        row.image_url,
        row.image,
        row.photoUrl,
      ]
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
      importedAsCanonicalDraft: true,
    };
    const productData = {
      canonicalName: name,
      description: row.description || null,
      descriptionSources: row.description
        ? {
            source,
            sourceUrl: row.sourceUrl || null,
            collectedAt: new Date().toISOString(),
          }
        : undefined,
      status: "DRAFT",
      productType: productType(name),
      brandId: brand?.id ?? null,
      manufacturerId: manufacturer?.id ?? null,
      baseUnitId: saleUnit?.id ?? null,
      externalMetadata: mergedMetadata,
    };
    const product = existingBySource
      ? await prisma.product.update({
          where: { id: existingBySource.id },
          data: productData,
        })
      : await prisma.product.upsert({
          where: { slug: productSlug },
          update: productData,
          create: { ...productData, slug: productSlug },
        });
    if (existingBySource || existing) updated += 1;
    else created += 1;
    try {
      await prisma.productIndustry.upsert({
        where: {
          productId_industryId: {
            productId: product.id,
            industryId: industry.id,
          },
        },
        update: {},
        create: { productId: product.id, industryId: industry.id },
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
    try {
      await prisma.productCategory.upsert({
        where: {
          productId_categoryId: {
            productId: product.id,
            categoryId: category.id,
          },
        },
        update: {},
        create: { productId: product.id, categoryId: category.id },
      });
    } catch (error) {
      if (error?.code !== "P2002") throw error;
    }
    const variant = await prisma.productVariant.findFirst({
      where: {
        productId: product.id,
        ...(row.supplierSku || row.gtin
          ? {
              OR: [
                { sku: row.supplierSku || undefined },
                { gtin: row.gtin || undefined },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    if (variant)
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          status: "DRAFT",
          sku: row.supplierSku || null,
          gtin: row.gtin || null,
          saleUnitId: saleUnit?.id ?? null,
          externalMetadata: {
            source,
            externalId,
            sourceUrl: row.sourceUrl || null,
          },
        },
      });
    else
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: row.supplierSku || null,
          gtin: row.gtin || null,
          saleUnitId: saleUnit?.id ?? null,
          status: "DRAFT",
          externalMetadata: {
            source,
            externalId,
            sourceUrl: row.sourceUrl || null,
          },
        },
      });
    variants += 1;
    const imageUrl = String(row.imageUrl || "").trim();
    if (imageUrl) {
      const existingMedia = await prisma.productMedia.findFirst({
        where: { productId: product.id, sourceUrl: imageUrl },
        select: { id: true },
      });
      if (existingMedia) {
        await prisma.productMedia.update({
          where: { id: existingMedia.id },
          data: {
            status: "PENDING",
            altText: name,
            metadata: { source, sourceUrl: row.sourceUrl || null },
          },
        });
      } else {
        await prisma.productMedia.create({
          data: {
            productId: product.id,
            sourceUrl: imageUrl,
            status: "PENDING",
            altText: name,
            metadata: { source, sourceUrl: row.sourceUrl || null },
          },
        });
      }
    }
    await prisma.productSearchDocument.upsert({
      where: { productId: product.id },
      update: {
        searchableText: [
          name,
          row.brand,
          row.manufacturer,
          row.supplierSku,
          row.gtin,
        ]
          .filter(Boolean)
          .join(" "),
        normalizedText: [name, row.brand, row.manufacturer]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru"),
        facets: { source, category: row.category || "" },
      },
      create: {
        productId: product.id,
        searchableText: [
          name,
          row.brand,
          row.manufacturer,
          row.supplierSku,
          row.gtin,
        ]
          .filter(Boolean)
          .join(" "),
        normalizedText: [name, row.brand, row.manufacturer]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("ru"),
        facets: { source, category: row.category || "" },
      },
    });
  };
  for (let index = startIndex; index < rows.length; index += 8)
    await Promise.all(rows.slice(index, index + 8).map(processRow));
}
console.log(
  JSON.stringify({ ok: true, inputFiles, created, updated, variants }, null, 2),
);
await prisma.$disconnect();
