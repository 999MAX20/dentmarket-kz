import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const queue = JSON.parse(
  await fs.readFile(
    path.join(root, "data/reports/product-image-restoration-queue.json"),
    "utf8",
  ),
);
const canonical = JSON.parse(
  await fs.readFile(
    path.join(root, "data/reports/canonical-manufacturer-intake.json"),
    "utf8",
  ),
);
const outputPath = path.join(
  root,
  "data/catalog-evidence/ray-official-product-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/ray-official-product-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const rejectedNonProductVisualNames = new Set([
  "5D Solution",
  "RAYSCAN α+",
]);
let previousEvidence = { products: [] };
try {
  previousEvidence = JSON.parse(await fs.readFile(outputPath, "utf8"));
} catch {
  // First recovery run.
}
const archiveRecoveryByProduct = new Map([
  ["RAYSCAN α 3D", { resourceTitle: "RAYSCAN_Alpha_Images", maxBytes: 30_000_000 }],
  ["RIOSensor+", { resourceTitle: "RIOSensor+product image", maxBytes: 15_000_000 }],
  ["RAYFace200", { resourceTitle: "RAYFace_Perspective_R", maxBytes: 350_000_000 }],
  ["RAYQuantum", { resourceTitle: "RAYQuantum_Images", maxBytes: 350_000_000 }],
  ["RAYSCAN S", { resourceTitle: "RAYScan_S_Images", maxBytes: 350_000_000 }],
  ["RIOScan", { resourceTitle: "Rioscan_Images", maxBytes: 350_000_000 }],
  ["RIOSensor", { resourceTitle: "RioSener_Images", maxBytes: 350_000_000 }],
]);
const directResourceByProduct = new Map([
  [
    "RAYDENT Studio",
    {
      resourcePageUrl:
        "https://connect.raymedical.com/en/resources/61fbb9ef-1bc1-4240-a45b-c671fc1b7332",
      resourceTitle: "RAYDENT_Images",
      filename: "RAYDENT_Images.zip",
      maxBytes: 60_000_000,
    },
  ],
  [
    "RAYPreMiere",
    {
      resourcePageUrl:
        "https://connect.raymedical.com/en/resources/b7adc8a1-5abe-49e2-81ac-df117ab7478c",
      resourceTitle: "RAYPreMiere_Images",
      filename: "RAYPreMiere_Images.zip",
      maxBytes: 350_000_000,
    },
  ],
  [
    "RAYMill C",
    {
      resourcePageUrl:
        "https://connect.raymedical.com/en/resources/16a1c7db-6723-4723-9ba8-c05169129de8",
      resourceTitle: "RAYMill_Images",
      filename: "RAYMill_Images.zip",
      maxBytes: 350_000_000,
    },
  ],
]);

const clean = (value) =>
  String(value ?? "")
    .replace(/&amp;/giu, "&")
    .replace(/&#x2f;/giu, "/")
    .replace(/\s+/gu, " ")
    .trim();
const slug = (value) =>
  clean(value)
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 100) || "product";
const canonicalById = new Map(
  canonical.products.map((product) => [product.canonicalProductId, product]),
);
const queueTargets = queue.items
  .filter(
    (item) =>
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" && item.brand === "RAY",
  )
  .map((item) => ({ item, product: canonicalById.get(item.canonicalProductId) }))
  .filter(({ product }) => product);
const retainedTargets = canonical.products
  .filter((product) =>
    product.sourceEvidenceFiles?.includes(path.basename(outputPath)),
  )
  .map((product) => ({
    item: {
      canonicalProductId: product.canonicalProductId,
      sourcePageUrl: product.sourcePageUrl,
    },
    product,
  }))
  .filter(({ item }) => item.sourcePageUrl);
const targets = [
  ...new Map(
    [...retainedTargets, ...queueTargets].map((target) => [
      target.product.canonicalProductId,
      target,
    ]),
  ).values(),
];
const recovered = [];
const review = [];
const previousRecoveredByProductId = new Map(
  (previousEvidence.products ?? []).map((product) => [
    product.officialProductId,
    product,
  ]),
);
await fs.mkdir(publicDir, { recursive: true });

for (const { item, product } of targets) {
  const officialProductId = `RAY-PHOTO-${product.canonicalProductId}`;
  if (previousRecoveredByProductId.has(officialProductId)) continue;
  const imagesPageUrl = `${item.sourcePageUrl.replace(/\/$/u, "")}/Images`;
  try {
    const directResource = directResourceByProduct.get(product.name);
    const archiveRecovery = archiveRecoveryByProduct.get(product.name);
    let resource;
    if (directResource) {
      resource = {
        href: directResource.resourcePageUrl,
        title: directResource.resourceTitle,
        description: directResource.filename,
      };
    } else {
      if (!archiveRecovery) {
        review.push({
          canonicalProductId: product.canonicalProductId,
          brand: product.brand,
          name: product.name,
          sourcePageUrl: item.sourcePageUrl,
          imagesPageUrl,
          reason: "CURRENT_STABLE_OFFICIAL_RESOURCE_REQUIRED",
        });
        continue;
      }
      const imagesResponse = await fetch(imagesPageUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
        headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
      });
      if (!imagesResponse.ok) throw new Error(`HTTP ${imagesResponse.status}`);
      const html = await imagesResponse.text();
      const resources = [
        ...html.matchAll(
          /<a[^>]+href="([^"]*\/resources\/[^"]+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<p[^>]*>([^<]+)<\/p>/giu,
        ),
      ]
        .map((match) => ({
          href: new URL(clean(match[1]), imagesPageUrl).href,
          title: clean(match[2]),
          description: clean(match[3]),
        }))
        .sort((left, right) => {
          const preference = (candidate) =>
            /(?:main|composite|perspective)/iu.test(candidate.title)
              ? 3
              : /(?:side|front)/iu.test(candidate.title)
                ? 2
                : 1;
          return preference(right) - preference(left);
        });
      const directResources = resources.filter((candidate) =>
        /\.(?:png|jpe?g|webp)$/iu.test(candidate.description),
      );
      resource =
        directResources[0] ??
        (archiveRecovery
          ? resources.find(
              (candidate) =>
                candidate.title === archiveRecovery.resourceTitle &&
                /\.zip$/iu.test(candidate.description),
            )
          : null);
    }
    if (!resource) {
      review.push({
        canonicalProductId: product.canonicalProductId,
        brand: product.brand,
        name: product.name,
        sourcePageUrl: item.sourcePageUrl,
        imagesPageUrl,
        reason: "NO_DIRECT_OFFICIAL_PRODUCT_IMAGE_RESOURCE",
      });
      continue;
    }
    const resourceHtml = await (
      await fetch(resource.href, {
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
        headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
      })
    ).text();
    const download = resourceHtml.match(
      /<a href="([^"]+)" download="([^"]+)"/iu,
    );
    if (!download) throw new Error("official resource download link missing");
    const originalImageUrl = clean(download[1]);
    const isArchive = /\.zip$/iu.test(resource.description);
    const effectiveArchiveRecovery =
      directResource ?? archiveRecovery;
    const imageResponse = await fetch(originalImageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(isArchive ? 180_000 : 30_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!imageResponse.ok) throw new Error(`HTTP ${imageResponse.status}`);
    const responseContentType =
      imageResponse.headers.get("content-type") ?? "";
    const announcedBytes = Number(
      imageResponse.headers.get("content-length") ?? 0,
    );
    if (
      isArchive &&
      (!effectiveArchiveRecovery ||
        (announcedBytes &&
          announcedBytes > effectiveArchiveRecovery.maxBytes))
    ) {
      await imageResponse.body?.cancel();
      throw new Error(
        `official archive exceeds bounded recovery limit (${announcedBytes || "unknown"} bytes)`,
      );
    }
    if (!isArchive && !responseContentType.startsWith("image/"))
      throw new Error(
        `unsupported ${responseContentType || "content type"}`,
      );
    const downloadedBuffer = Buffer.from(await imageResponse.arrayBuffer());
    if (
      isArchive &&
      effectiveArchiveRecovery &&
      downloadedBuffer.length > effectiveArchiveRecovery.maxBytes
    )
      throw new Error("official archive exceeds bounded recovery limit");
    const extracted = isArchive
      ? spawnSync(
          process.env.DENTMARKET_PYTHON || "python3",
          [
            "-c",
            `
import io
import os
import sys
import zipfile
from PIL import Image

archive = zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
candidates = []
for name in archive.namelist():
    if name.endswith("/") or not name.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        continue
    lowered = os.path.basename(name).lower()
    if any(token in lowered for token in ("logo", "icon", "thumb", "thumbnail")):
        continue
    try:
        payload = archive.read(name)
        image = Image.open(io.BytesIO(payload))
        width, height = image.size
        if width < 500 or height < 500:
            continue
        filename_score = (
            4 if any(token in lowered for token in ("perspective", "main", "product", "front")) else
            2 if any(token in lowered for token in ("side", "right", "left")) else
            1
        )
        candidates.append((filename_score, width * height, min(width, height), name, payload))
    except Exception:
        continue
if not candidates:
    raise SystemExit("no sufficiently large product image in archive")
_, _, _, selected_name, payload = max(candidates)
source = Image.open(io.BytesIO(payload)).convert("RGBA")
canvas = Image.new("RGB", (1200, 1200), "white")
source.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
canvas.paste(source, ((1200 - source.width) // 2, (1200 - source.height) // 2), source)
output = io.BytesIO()
canvas.save(output, "PNG", optimize=True)
sys.stdout.buffer.write(output.getvalue())
sys.stderr.write(selected_name)
`,
          ],
          {
            input: downloadedBuffer,
            maxBuffer: 40_000_000,
            encoding: null,
          },
        )
      : null;
    if (isArchive && extracted?.status !== 0)
      throw new Error(
        `official archive extraction failed: ${clean(extracted?.stderr)}`,
      );
    const buffer = isArchive ? Buffer.from(extracted.stdout) : downloadedBuffer;
    if (buffer.length < 4_000) throw new Error("image payload too small");
    const contentType = buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
      ? "image/png"
      : buffer[0] === 0xff && buffer[1] === 0xd8
        ? "image/jpeg"
        : responseContentType;
    if (!contentType.startsWith("image/"))
      throw new Error("archive first member is not an image");
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const extension =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
    const filename = `official-ray-${slug(product.name)}-${hash.slice(0, 10)}.${extension}`;
    await fs.writeFile(path.join(publicDir, filename), buffer);
    const imageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId,
      brand: product.brand,
      manufacturer: product.manufacturer,
      name: product.name,
      manufacturerRef: product.manufacturerRef,
      manufacturerRefs: product.manufacturerRefs,
      model: product.model,
      variantCount: product.variantCount,
      variants: product.variants,
      categoryPath: product.categoryPath,
      description: product.description,
      sourceImageUrl: imageUrl,
      imageUrls: imageUrl,
      imageCount: 1,
      sourcePageUrl: product.sourcePageUrl,
      kzEvidence: product.kzEvidence,
      status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
      photoEvidence: {
        method: isArchive
          ? "OFFICIAL_RAYCONNECT_BOUNDED_PRODUCT_IMAGE_ARCHIVE"
          : "OFFICIAL_RAYCONNECT_DIRECT_IMAGE_RESOURCE",
        imagesPageUrl,
        resourcePageUrl: resource.href,
        resourceTitle: resource.title,
        originalImageUrl,
        archiveBytes: isArchive ? downloadedBuffer.length : undefined,
        archiveSelection: isArchive
          ? "BEST_LARGE_PRODUCT_IMAGE_FROM_PRODUCT_SPECIFIC_OFFICIAL_ARCHIVE"
          : undefined,
        archiveMember: isArchive
          ? clean(extracted?.stderr?.toString("utf8"))
          : undefined,
        sha256: hash,
        bytes: buffer.length,
        contentType,
      },
    });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: item.sourcePageUrl,
      imagesPageUrl,
      reason: "OFFICIAL_IMAGE_RESOURCE_RECOVERY_FAILED",
      error: String(error?.message ?? error),
    });
  }
}

const historicalRecovered = canonical.products
  .filter((product) =>
    product.sourceEvidenceFiles?.includes(path.basename(outputPath)),
  )
  .map((product) => ({
    officialProductId:
      product.sourceProductIds?.find((id) => id.startsWith("RAY-PHOTO-")) ??
      `RAY-PHOTO-${product.canonicalProductId}`,
    brand: product.brand,
    manufacturer: product.manufacturer,
    name: product.name,
    manufacturerRef: product.manufacturerRef,
    manufacturerRefs: product.manufacturerRefs,
    model: product.model,
    variantCount: product.variantCount,
    variants: product.variants,
    categoryPath: product.categoryPath,
    description: product.description,
    sourceImageUrl: product.evidenceImageUrl || product.sourceImageUrl,
    imageUrls: product.evidenceImageUrl || product.sourceImageUrl,
    imageCount: product.evidenceImageUrl || product.sourceImageUrl ? 1 : 0,
    sourcePageUrl: product.sourcePageUrl,
    kzEvidence: product.kzEvidence,
    status: "RETAINED_PREVIOUS_OFFICIAL_IMAGE_RECOVERY",
  }))
  .filter((product) => product.sourceImageUrl);
const productKey = (product) =>
  `${clean(product.brand).toLocaleLowerCase("en")}\u0000${clean(
    product.name,
  ).toLocaleLowerCase("en")}\u0000${clean(product.manufacturerRefs)}`;
const mergedRecovered = [
  ...new Map(
    [
      ...historicalRecovered,
      ...(previousEvidence.products ?? []),
      ...recovered,
    ]
      .filter((product) => !rejectedNonProductVisualNames.has(product.name))
      .map((product) => [
      productKey(product),
      product,
      ]),
  ).values(),
].sort((left, right) => left.name.localeCompare(right.name, "en"));

const evidence = {
  brand: "RAY",
  manufacturer: "RAY Co., Ltd.",
  sourceType: "OFFICIAL_RAYCONNECT_DIRECT_IMAGE_RESOURCES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    exactOfficialProductResourcesOnly: true,
    boundedProductSpecificArchivesAllowed: true,
    defaultArchiveMaximumBytes: 30_000_000,
    approvedExactProductArchiveMaximumBytes: 350_000_000,
    largeArchivesRemainOnModeration: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: targets.length,
    recovered: mergedRecovered.length,
    recoveredThisRun: recovered.length,
    retainedFromPreviousRuns: [
      ...new Map(
        [
          ...historicalRecovered,
          ...(previousEvidence.products ?? []),
        ].map((product) => [productKey(product), product]),
      ).values(),
    ].length,
    reviewRequired: review.length,
  },
  products: mergedRecovered,
};
await Promise.all([
  fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`),
  fs.writeFile(
    reportPath,
    `${JSON.stringify({ ...evidence, review }, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify(evidence.totals, null, 2));
