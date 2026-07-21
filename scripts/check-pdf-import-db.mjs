import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rules = await prisma.complianceRule.findMany({
  where: { status: "ACTIVE" },
  select: { code: true, regulatoryClass: true },
  orderBy: { code: "asc" },
});
const columns = await prisma.$queryRawUnsafe(
  "SELECT column_name FROM information_schema.columns WHERE table_name = 'ImportBatch' AND column_name = 'extractionMetadata'",
);
const migrations = await prisma.$queryRawUnsafe(
  "SELECT migration_name, finished_at, rolled_back_at, logs FROM _prisma_migrations ORDER BY started_at DESC LIMIT 3",
);
console.log(
  JSON.stringify({
    rules,
    extractionMetadataColumn: Array.isArray(columns) && columns.length === 1,
    migrations,
  }),
);
await prisma.$disconnect();
