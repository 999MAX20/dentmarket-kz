import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const products = await prisma.product.findMany({
  where: {
    externalMetadata: { path: ["importedAsCanonicalDraft"], equals: true },
  },
  select: {
    id: true,
    canonicalName: true,
    externalMetadata: true,
    brand: { select: { name: true } },
    manufacturer: { select: { name: true } },
  },
});
let done = 0;
for (let i = 0; i < products.length; i += 32) {
  await Promise.all(
    products.slice(i, i + 32).map(async (p) => {
      const m =
        p.externalMetadata && typeof p.externalMetadata === "object"
          ? p.externalMetadata
          : {};
      const source = String(m.source || "");
      const text = [
        p.canonicalName,
        p.brand?.name,
        p.manufacturer?.name,
        m.externalId,
      ]
        .filter(Boolean)
        .join(" ");
      await prisma.productSearchDocument.upsert({
        where: { productId: p.id },
        update: {
          searchableText: text,
          normalizedText: text.toLocaleLowerCase("ru"),
          facets: { source },
        },
        create: {
          productId: p.id,
          searchableText: text,
          normalizedText: text.toLocaleLowerCase("ru"),
          facets: { source },
        },
      });
      done++;
    }),
  );
}
console.log(JSON.stringify({ backfilled: done }));
await prisma.$disconnect();
