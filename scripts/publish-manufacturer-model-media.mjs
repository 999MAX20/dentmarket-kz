import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const exec = promisify(execFile);
const root = path.resolve(process.cwd());
const inputPath = path.join(root, "data/manufacturer-model-media.csv");
const brandMediaDirectory = path.join(root, "data/catalog-media");
const manifestPath = path.join(
  root,
  "apps/buyer-web/app/data/public-catalog-media.json",
);
const publicDirectory = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const rejectedAsset =
  /(logo|favicon|icon|sprite|avatar|cart|basket|loading|pixel|captcha|placeholder|no[-_]?image|default[-_]?image)/i;
const onlyMissing = process.argv.includes("--only-missing");

const brandMediaPaths = await fs
  .readdir(brandMediaDirectory)
  .then((entries) =>
    entries
      .filter((entry) => entry.endsWith(".csv"))
      .sort()
      .map((entry) => path.join(brandMediaDirectory, entry)),
  )
  .catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
const records = (
  await Promise.all(
    [inputPath, ...brandMediaPaths].map((mediaPath) =>
      fs.readFile(mediaPath).then((content) =>
        parse(content, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
        }),
      ),
    ),
  )
).flat();
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const entries = { ...(manifest.entries ?? {}) };
const temporaryDirectory = await fs.mkdtemp(
  path.join(os.tmpdir(), "dentmarket-manufacturer-media-"),
);
let published = 0;

try {
  await fs.mkdir(publicDirectory, { recursive: true });
  for (const [index, record] of records.entries()) {
    const { sourcePageUrl, sourceImageUrl, productName, rightsStatus } = record;
    if (!sourcePageUrl || !sourceImageUrl || !productName)
      throw new Error(`Media row ${index + 2} is incomplete`);
    if (onlyMissing && entries[sourcePageUrl]) continue;
    if (rejectedAsset.test(sourceImageUrl))
      throw new Error(`Rejected non-product asset: ${sourceImageUrl}`);
    new URL(sourcePageUrl);
    new URL(sourceImageUrl);

    const response = await fetch(sourceImageUrl, {
      headers: { "user-agent": "DentMarket catalog curator/1.0" },
      redirect: "follow",
    });
    if (!response.ok)
      throw new Error(`${productName}: image returned ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.startsWith("image/"))
      throw new Error(
        `${productName}: expected image but received ${contentType}`,
      );

    const digest = crypto
      .createHash("sha256")
      .update(sourcePageUrl)
      .digest("hex")
      .slice(0, 32);
    const sourcePath = path.join(temporaryDirectory, `${digest}.source`);
    const outputName = `${digest}.png`;
    const outputPath = path.join(publicDirectory, outputName);
    await fs.writeFile(sourcePath, Buffer.from(await response.arrayBuffer()));
    await exec("ffmpeg", [
      "-y",
      "-i",
      sourcePath,
      "-vf",
      "scale=1200:1200:force_original_aspect_ratio=decrease",
      "-c:v",
      "png",
      outputPath,
    ]);
    const { stdout } = await exec("sips", [
      "-g",
      "pixelWidth",
      "-g",
      "pixelHeight",
      outputPath,
    ]);
    const width = Number(stdout.match(/pixelWidth:\s*(\d+)/)?.[1] ?? 1200);
    const height = Number(stdout.match(/pixelHeight:\s*(\d+)/)?.[1] ?? 1200);
    const storageKey = `catalog/products/${outputName}`;
    entries[sourcePageUrl] = {
      id: `manufacturer-${digest}`,
      sourceUrl: sourceImageUrl,
      securePath: `/${storageKey}`,
      normalizedStorageKey: storageKey,
      mimeType: "image/png",
      altText: productName,
      width,
      height,
      metadata: {
        exactProductPhoto: true,
        rightsStatus: rightsStatus || "official_manufacturer_catalog",
        sourcePageUrl,
        sourceImageUrl,
      },
    };
    published += 1;
  }
} finally {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

await fs.writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      total: Object.keys(entries).length,
      entries,
    },
    null,
    2,
  )}\n`,
);
console.log(
  JSON.stringify(
    {
      published,
      skipped: records.length - published,
      manifestTotal: Object.keys(entries).length,
      manifestPath,
    },
    null,
    2,
  ),
);
