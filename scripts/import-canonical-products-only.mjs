import fs from "node:fs/promises";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const files = process.argv.slice(2);
const start = Number(process.env.IMPORT_START_INDEX || 0);
const slug = (source, id) =>
  `${source}-${String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)}`;
const type = (name) =>
  /установ|рентген|сканер|компрессор|автоклав|печь|фрезер|оборудован/i.test(
    name,
  )
    ? "equipment"
    : "consumable";
let created = 0,
  updated = 0;
for (const file of files) {
  const rows = parse(await fs.readFile(file), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  });
  for (let i = start; i < rows.length; i += 16) {
    await Promise.all(
      rows.slice(i, i + 16).map(async (r) => {
        const name = String(r.name || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!name || !r.externalId) return;
        const s = slug(r.source, r.externalId);
        const exists = await prisma.product.findUnique({
          where: { slug: s },
          select: { id: true },
        });
        await prisma.product.upsert({
          where: { slug: s },
          update: {
            canonicalName: name,
            status: "DRAFT",
            productType: type(name),
            externalMetadata: {
              source: r.source,
              externalId: r.externalId,
              sourceUrl: r.sourceUrl || null,
              importedAsCanonicalDraft: true,
            },
          },
          create: {
            canonicalName: name,
            slug: s,
            status: "DRAFT",
            productType: type(name),
            externalMetadata: {
              source: r.source,
              externalId: r.externalId,
              sourceUrl: r.sourceUrl || null,
              importedAsCanonicalDraft: true,
            },
          },
        });
        exists ? updated++ : created++;
      }),
    );
  }
}
console.log(JSON.stringify({ created, updated }));
await prisma.$disconnect();
