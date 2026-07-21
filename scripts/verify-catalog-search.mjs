import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const api = process.env.API_URL ?? "http://127.0.0.1:4012/api";
const importedCount =
  await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" p WHERE (p."externalMetadata" ->> 'importedAsCanonicalDraft') = 'true'`;
const indexedCount =
  await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" p JOIN "ProductSearchDocument" d ON d."productId" = p.id WHERE (p."externalMetadata" ->> 'importedAsCanonicalDraft') = 'true'`;
const exact =
  await prisma.$queryRaw`SELECT p.id, p."canonicalName", p.status, d."normalizedText" FROM "Product" p JOIN "ProductSearchDocument" d ON d."productId" = p.id WHERE (p."externalMetadata" ->> 'importedAsCanonicalDraft') = 'true' AND length(d."normalizedText") > 0 LIMIT 5`;
const missing =
  await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Product" p LEFT JOIN "ProductSearchDocument" d ON d."productId" = p.id WHERE (p."externalMetadata" ->> 'importedAsCanonicalDraft') = 'true' AND d."productId" IS NULL`;
const publicResponse = await fetch(
  `${api}/catalog/search?q=${encodeURIComponent("YouJoy EASE02")}&limit=20`,
  { signal: AbortSignal.timeout(30_000) },
);
const publicPayload = await publicResponse.json();
const report = {
  verified:
    importedCount[0].count === indexedCount[0].count &&
    exact.length > 0 &&
    missing[0].count === 0 &&
    publicResponse.ok,
  importedCanonicalDraftCards: importedCount[0].count,
  indexedCanonicalDraftCards: indexedCount[0].count,
  sampleIndexedCards: exact,
  missingIndexedCards: missing[0].count,
  publicSearchHttpStatus: publicResponse.status,
  publicSearchTotal: publicPayload.total ?? null,
  publicSearchVisibilityRule:
    "DRAFT canonical cards are indexed but hidden from public marketplace search until an eligible active offer is published",
};
console.log(JSON.stringify(report, null, 2));
await prisma.$disconnect();
