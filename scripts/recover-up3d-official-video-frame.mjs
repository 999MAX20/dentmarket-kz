import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const canonical = JSON.parse(
  await fs.readFile(
    path.join(root, "data/reports/canonical-manufacturer-intake.json"),
    "utf8",
  ),
);
const outputPath = path.join(
  root,
  "data/catalog-evidence/up3d-official-video-frame.json",
);
const reportPath = path.join(
  root,
  "data/reports/up3d-official-video-frame.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const sourcePageUrl = "https://www.up3dtech.com/en/software-aidesign";
const sourceVideoUrl =
  "https://www.up3dtech.com/image/responsive/pc/login/up3d-ai-cad-dental-design-software-crown.mp4";
const evidenceFile = path.basename(outputPath);

const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const product =
  canonical.products.find(
    (candidate) =>
      candidate.brand === "UP3D" && clean(candidate.name) === "AI Design",
  ) ??
  canonical.products.find((candidate) =>
    candidate.sourceEvidenceFiles?.includes(evidenceFile),
  );
const review = [];
const recovered = [];

if (!product) {
  review.push({
    brand: "UP3D",
    name: "AI Design",
    reason: "CANONICAL_PRODUCT_NOT_FOUND",
  });
} else {
  try {
    const pageResponse = await fetch(sourcePageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!pageResponse.ok)
      throw new Error(`official page HTTP ${pageResponse.status}`);
    const html = await pageResponse.text();
    if (!html.includes(new URL(sourceVideoUrl).pathname))
      throw new Error("video is not referenced by the official product page");

    const videoResponse = await fetch(sourceVideoUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!videoResponse.ok)
      throw new Error(`official video HTTP ${videoResponse.status}`);
    if (!(videoResponse.headers.get("content-type") ?? "").includes("video/"))
      throw new Error("official source is not a video");
    const video = Buffer.from(await videoResponse.arrayBuffer());
    if (video.length < 100_000 || video.length > 25_000_000)
      throw new Error("official video is outside the bounded size policy");

    const videoHash = crypto
      .createHash("sha256")
      .update(video)
      .digest("hex");
    const temporaryVideoPath = path.join(
      os.tmpdir(),
      `dentmarket-up3d-${videoHash.slice(0, 12)}.mp4`,
    );
    await fs.writeFile(temporaryVideoPath, video);
    const frameResult = spawnSync(
      "ffmpeg",
      [
        "-v",
        "error",
        "-i",
        temporaryVideoPath,
        "-ss",
        "6",
        "-frames:v",
        "1",
        "-vf",
        "scale=1600:-2",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "pipe:1",
      ],
      {
        encoding: null,
        maxBuffer: 20_000_000,
      },
    );
    await fs.unlink(temporaryVideoPath).catch(() => {});
    if (frameResult.status !== 0)
      throw new Error(
        `official video frame extraction failed: ${clean(frameResult.stderr)}`,
      );
    const frame = Buffer.from(frameResult.stdout);
    if (
      frame.length < 20_000 ||
      !frame.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    )
      throw new Error("extracted frame is not a valid product screenshot");

    const hash = crypto.createHash("sha256").update(frame).digest("hex");
    const filename = `official-up3d-ai-design-${hash.slice(0, 10)}.png`;
    await fs.mkdir(publicDir, { recursive: true });
    await fs.writeFile(path.join(publicDir, filename), frame);
    const imageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId: "UP3D-SOFTWARE-AIDESIGN",
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
      sourcePageUrl,
      kzEvidence: product.kzEvidence,
      status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
      photoEvidence: {
        method: "OFFICIAL_PRODUCT_VIDEO_EXACT_UI_FRAME",
        sourceVideoUrl,
        frameTimestampSeconds: 6,
        sourceVideoBytes: video.length,
        sha256: hash,
        bytes: frame.length,
        contentType: "image/png",
      },
    });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl,
      sourceVideoUrl,
      reason: "OFFICIAL_VIDEO_FRAME_RECOVERY_FAILED",
      error: String(error?.message ?? error),
    });
  }
}

const historicalRecovered = canonical.products
  .filter((candidate) =>
    candidate.sourceEvidenceFiles?.includes(evidenceFile),
  )
  .map((candidate) => ({
    officialProductId: "UP3D-SOFTWARE-AIDESIGN",
    brand: candidate.brand,
    manufacturer: candidate.manufacturer,
    name: candidate.name,
    manufacturerRef: candidate.manufacturerRef,
    manufacturerRefs: candidate.manufacturerRefs,
    model: candidate.model,
    variantCount: candidate.variantCount,
    variants: candidate.variants,
    categoryPath: candidate.categoryPath,
    description: candidate.description,
    sourceImageUrl: candidate.evidenceImageUrl || candidate.sourceImageUrl,
    imageUrls: candidate.evidenceImageUrl || candidate.sourceImageUrl,
    imageCount: 1,
    sourcePageUrl: candidate.sourcePageUrl,
    kzEvidence: candidate.kzEvidence,
    status: "RETAINED_PREVIOUS_OFFICIAL_IMAGE_RECOVERY",
  }))
  .filter((candidate) => candidate.sourceImageUrl);
const mergedRecovered = [
  ...new Map(
    [...historicalRecovered, ...recovered].map((candidate) => [
      candidate.officialProductId,
      candidate,
    ]),
  ).values(),
];
const evidence = {
  brand: "UP3D",
  manufacturer: product?.manufacturer ?? "UP3D Tech",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_VIDEO",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialProductPageReferenceRequired: true,
    boundedOfficialVideoDownload: true,
    exactProductInterfaceFrameRequired: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: 1,
    recovered: mergedRecovered.length,
    recoveredThisRun: recovered.length,
    retainedFromPreviousRuns: historicalRecovered.length,
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
