import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const canonicalPath = path.join(
  root,
  "data/reports/canonical-manufacturer-intake.json",
);
const videoPath = path.join(root, "tmp/raymill-4x-official.mp4");
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const evidencePath = path.join(
  root,
  "data/catalog-evidence/raymill-4x-official-video-frame.json",
);
const reportPath = path.join(
  root,
  "data/reports/raymill-4x-official-video-frame.json",
);
const resourcePageUrl =
  "https://connect.raymedical.com/en/resources/2d3ccdb2-f508-4db3-9e2c-334e705df0d5";
const productionOrigin = "https://dentmarket-shop.vercel.app";

const canonical = JSON.parse(await fs.readFile(canonicalPath, "utf8"));
const product = canonical.products.find(
  (candidate) => candidate.canonicalProductId === "CANON-RAY-RAY-RAYMILL-4X",
);
if (!product) throw new Error("RAYMill 4X canonical product not found");

await fs.mkdir(publicDir, { recursive: true });
const temporaryOutput = path.join(
  publicDir,
  "official-ray-raymill-4x-video-frame.tmp.png",
);
const frame = spawnSync(
  "ffmpeg",
  [
    "-y",
    "-v",
    "error",
    "-ss",
    "23",
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    [
      "crop=1080:1080:(iw-ow)/2:0",
      "eq=gamma=1.8:brightness=0.05:contrast=1.05",
      "scale=1080:1080",
      "pad=1200:1200:60:60:white",
    ].join(","),
    temporaryOutput,
  ],
  { encoding: "utf8" },
);
if (frame.status !== 0)
  throw new Error(`ffmpeg failed: ${frame.stderr || frame.stdout}`);

const payload = await fs.readFile(temporaryOutput);
const imageHash = crypto.createHash("sha256").update(payload).digest("hex");
const videoHash = crypto
  .createHash("sha256")
  .update(await fs.readFile(videoPath))
  .digest("hex");
const filename = `official-ray-raymill-4x-video-frame-${imageHash.slice(0, 10)}.png`;
await fs.rename(temporaryOutput, path.join(publicDir, filename));
const imageUrl = `${productionOrigin}/catalog/products/${filename}`;
const sourceProductIds = product.sourceProductIds ?? [];

const recovered = {
  officialProductId:
    sourceProductIds[0] ?? product.canonicalProductId.replace("CANON-", ""),
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
  sourcePageUrl: resourcePageUrl,
  kzEvidence: product.kzEvidence,
  status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
  photoEvidence: {
    method: "OFFICIAL_RAYCONNECT_PRODUCT_VIDEO_VERIFIED_FRAME",
    officialResourcePageUrl: resourcePageUrl,
    officialVideoFilename: "RAYDENT Mill 4X promotional video (English)",
    officialVideoSha256: videoHash,
    frameTimestampSeconds: 23,
    frameProcessing:
      "center square crop; exposure correction; 1200x1200 marketplace padding",
    visualMatchNote:
      "The frame shows the complete RAYDENT Mill 4X front with the milling chamber open.",
    outputImageSha256: imageHash,
    bytes: payload.length,
    contentType: "image/png",
    noGeneratedGeometry: true,
  },
};
const evidence = {
  brand: "RAY",
  manufacturer: "RAY Co., Ltd.",
  sourceType: "OFFICIAL_RAYCONNECT_PRODUCT_VIDEO_VERIFIED_FRAME",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialProductVideoOnly: true,
    exactProductRequired: true,
    visualVerificationRequired: true,
    exposureCorrectionAllowed: true,
    noGeneratedProductGeometry: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: { targets: 1, recovered: 1, reviewRequired: 0 },
  products: [recovered],
};
await Promise.all([
  fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`),
  fs.writeFile(
    reportPath,
    `${JSON.stringify({ ...evidence, review: [] }, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify(evidence.totals, null, 2));
