import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const slugify = (value) => String(value || '').toLocaleLowerCase('ru').replace(/[^a-zа-я0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 64) || 'imported-catalog';

try {
  const [industry, unit] = await Promise.all([
    prisma.industry.findUniqueOrThrow({ where: { code: 'dentistry-kz' } }),
    prisma.unitOfMeasure.findUniqueOrThrow({ where: { code: 'piece' } }),
  ]);
  const categoryCache = new Map();
  const start = Number(process.env.REPAIR_START || 0);
  const limit = Number(process.env.REPAIR_LIMIT || 100000);
  const products = await prisma.product.findMany({
    where: { externalMetadata: { path: ['importedAsCanonicalDraft'], equals: true }, variants: { none: {} } },
    select: { id: true, canonicalName: true, externalMetadata: true },
  }).then((rows) => rows.slice(start, start + limit));
  let variants = 0;
  let industries = 0;
  let categories = 0;
  for (const product of products) {
    const metadata = product.externalMetadata && typeof product.externalMetadata === 'object' ? product.externalMetadata : {};
    const source = String(metadata.source || 'imported');
    const externalId = String(metadata.externalId || product.id);
    const sourceUrl = String(metadata.sourceUrl || '');
    const pathPart = sourceUrl.match(/\/catalog\/([^/?#]+)/i)?.[1];
    const categoryCode = `${slugify(source)}-${slugify(pathPart || 'stomatologiya')}`;
    let category = categoryCache.get(categoryCode);
    if (!category) {
      category = await prisma.category.upsert({
        where: { industryId_code: { industryId: industry.id, code: categoryCode } },
        update: {},
        create: { industryId: industry.id, code: categoryCode, nameRu: pathPart ? `Импорт: ${decodeURIComponent(pathPart).replace(/[-_]+/g, ' ')}` : 'Импортированный каталог', nameKk: 'Импортталған каталог', path: categoryCode },
      });
      categoryCache.set(categoryCode, category);
    }
    const result = await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({ data: { productId: product.id, saleUnitId: unit.id, status: 'DRAFT', externalMetadata: { source, externalId, sourceUrl, structureRepair: '2026-07-17' } } });
      const industryLink = await tx.productIndustry.upsert({ where: { productId_industryId: { productId: product.id, industryId: industry.id } }, update: {}, create: { productId: product.id, industryId: industry.id } });
      const categoryLink = await tx.productCategory.upsert({ where: { productId_categoryId: { productId: product.id, categoryId: category.id } }, update: {}, create: { productId: product.id, categoryId: category.id } });
      return { variant, industryLink, categoryLink };
    });
    variants += result.variant ? 1 : 0;
    industries += result.industryLink ? 1 : 0;
    categories += result.categoryLink ? 1 : 0;
    if ((variants + industries + categories) % 75 === 0) console.error(`repaired ${variants}/${products.length}`);
  }
  console.log(JSON.stringify({ scanned: products.length, variants, industries, categories }));
} finally {
  await prisma.$disconnect();
}
