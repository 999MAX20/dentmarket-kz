#!/usr/bin/env node

import crypto from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const root = resolve(process.cwd());
const localDir = join(root, ".local-storage/catalog/products/beauty-kz");
const manifestPath = join(
  root,
  "data/reports/beauty-kz/media-normalization-manifest.json",
);
const args = new Map(
  process.argv.slice(2).flatMap((value, index, values) => {
    if (!value.startsWith("--")) return [];
    return [
      [
        value.slice(2),
        values[index + 1]?.startsWith("--")
          ? "true"
          : (values[index + 1] ?? "true"),
      ],
    ];
  }),
);
const limit = Number(args.get("limit") ?? Number.POSITIVE_INFINITY);
const concurrency = Math.max(1, Number(args.get("concurrency") ?? 6));
const sharpPackage = (await readdir(join(root, "node_modules/.pnpm"))).find(
  (name) => name.startsWith("sharp@"),
);
if (!sharpPackage) throw new Error("sharp is not installed");
const requireSharp = createRequire(
  join(
    root,
    "node_modules/.pnpm",
    sharpPackage,
    "node_modules/sharp/package.json",
  ),
);
const sharp = requireSharp("sharp");

const absoluteUrl = (value) => {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};
const imageSource = (item) =>
  absoluteUrl(item.sourceUrl) || absoluteUrl(item.metadata?.sourceImageUrl);
const normalize = async (bytes) =>
  sharp(bytes)
    .autoOrient()
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 10 })
    .resize(1000, 1000, { fit: "contain", background: "#ffffff" })
    .extend({
      top: 100,
      right: 100,
      bottom: 100,
      left: 100,
      background: "#ffffff",
    })
    .webp({ quality: 88, effort: 4 })
    .toBuffer({ resolveWithObject: true });

const industry = await prisma.industry.findUniqueOrThrow({
  where: { code: "beauty-kz" },
});
const media = await prisma.productMedia.findMany({
  where: {
    status: "PENDING",
    product: {
      industries: { some: { industryId: industry.id } },
      externalMetadata: { path: ["source"], equals: "ucg-kz" },
    },
  },
  include: { product: { select: { id: true, canonicalName: true } } },
  orderBy: { createdAt: "asc" },
});
const jobs = media.slice(0, limit);
await mkdir(localDir, { recursive: true });
const results = [];
let cursor = 0;
let completed = 0;
let failed = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= jobs.length) return;
    const item = jobs[index];
    const sourceUrl = imageSource(item);
    try {
      if (!sourceUrl) throw new Error("missing source URL");
      const response = await fetch(sourceUrl, {
        headers: { "user-agent": "DentMarket local catalog normalizer/1.0" },
      });
      if (!response.ok) throw new Error(`image ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength < 2_000) throw new Error("image is too small");
      const normalized = await normalize(bytes);
      const checksum = crypto
        .createHash("sha256")
        .update(normalized.data)
        .digest("hex");
      const storageKey = `catalog/products/beauty-kz/${item.product.id}.webp`;
      await writeFile(
        join(root, ".local-storage", storageKey),
        normalized.data,
      );
      await prisma.productMedia.update({
        where: { id: item.id },
        data: {
          normalizedStorageKey: storageKey,
          originalStorageKey: sourceUrl,
          mimeType: "image/webp",
          checksumSha256: checksum,
          width: normalized.info.width,
          height: normalized.info.height,
          status: "READY",
          metadata: {
            ...(item.metadata ?? {}),
            sourceImageUrl: sourceUrl,
            normalizedFormat: "webp",
            normalizedSize: "1200x1200",
            background: "#ffffff",
            rightsStatus: "SOURCE_UNVERIFIED",
            protectedDelivery: "frontend-friction-only",
          },
        },
      });
      results.push({
        mediaId: item.id,
        productId: item.product.id,
        productName: item.product.canonicalName,
        sourceUrl,
        storageKey,
        status: "READY",
        width: normalized.info.width,
        height: normalized.info.height,
        checksumSha256: checksum,
      });
    } catch (error) {
      failed += 1;
      results.push({
        mediaId: item.id,
        productId: item.product.id,
        productName: item.product.canonicalName,
        sourceUrl,
        status: "FAILED",
        error: error.message,
      });
    } finally {
      completed += 1;
      if (completed % 25 === 0 || completed === jobs.length)
        console.log(`${completed}/${jobs.length} processed; failed=${failed}`);
    }
  }
}
await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length || 1) }, worker),
);
await prisma.$disconnect();
await mkdir(join(root, "data/reports/beauty-kz"), { recursive: true });
await writeFile(
  manifestPath,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      scope: "local-only",
      source: "ucg-kz",
      format: "webp",
      canvas: "1200x1200",
      background: "#ffffff",
      rightsStatus: "SOURCE_UNVERIFIED",
      summary: {
        candidates: jobs.length,
        ready: results.filter((item) => item.status === "READY").length,
        failed: results.filter((item) => item.status === "FAILED").length,
      },
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    {
      ok: true,
      manifestPath,
      ...JSON.parse(
        await (await import("node:fs/promises")).readFile(manifestPath, "utf8"),
      ).summary,
    },
    null,
    2,
  ),
);
