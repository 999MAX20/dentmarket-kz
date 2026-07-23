import crypto from "node:crypto";
import fs from "node:fs/promises";
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
  "data/catalog-evidence/shining3d-manufacturer-official-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/shining3d-manufacturer-official-images.json",
);
const publicDir = path.join(root, "apps/buyer-web/public/catalog/products");
const productionOrigin = "https://dentmarket-shop.vercel.app";
const evidenceFile = path.basename(outputPath);
const targets = [
  {
    name: "SHINING 3D AccuFab-D1s",
    officialProductId: "AccuFab-D1s",
    slug: "accufab-d1s",
    pageUrl:
      "https://support.shining3ddental.com/en/support/solutions/articles/60000700411-accufab-d1s-installation-and-using-guide",
    imageUrl:
      "https://i.ytimg.com/vi/j2cZ3fr_ma4/maxresdefault.jpg",
    pageReference: "j2cZ3fr_ma4",
    hash: "cb5129a972257871b4c277b489b0bb8dc8dec041ff9047b434cbd11dce5b37f6",
    extension: "jpg",
    visualScope: "FULL_PRODUCT_OFFICIAL_SUPPORT_VIDEO_COVER",
  },
  {
    name: "SHINING 3D AutoScan-DS-EX Pro(C)",
    officialProductId: "AutoScan-DS-EX Pro(C)",
    slug: "autoscan-ds-ex-pro-c",
    pageUrl:
      "https://www.shining3ddental.com/solution/ds-ex-pro-lab-sacnner/",
    imageUrl:
      "https://www.shining3ddental.com/hs-fs/hubfs/website-S3D-dental/images/Desk%20scanner/Desk%20scanner-C/20251218%20AutoScan-DS-EX%20Pro(C)_650.png?width=1000&name=20251218%20AutoScan-DS-EX%20Pro(C)_650.png",
    hash: "8ca795265be2626603ffc1825e429bf680aa4841a341dd20f2d0e8302999b889",
    extension: "png",
    visualScope: "FULL_PRODUCT",
  },
  {
    name: "SHINING 3D AutoScan-DS-EX Pro(H)",
    officialProductId: "AutoScan-DS-EX Pro(H)",
    slug: "autoscan-ds-ex-pro-h",
    pageUrl:
      "https://www.shining3ddental.com/solution/autoscan-ds-ex-pro-h",
    imageUrl:
      "https://www.shining3ddental.com/hs-fs/hubfs/website-S3D-dental/images/3.%203D%20print/EPH/EPH%E7%BD%91%E9%A1%B5_03-2-scaled.jpg?width=1516&height=1120&name=EPH%E7%BD%91%E9%A1%B5_03-2-scaled.jpg",
    hash: "d6c2a1de52e793439c766850acce831a236014a155d09e7fed6582fce88e0d38",
    extension: "jpg",
    visualScope: "EXACT_PRODUCT_SCAN_CHAMBER",
  },
  {
    name: "SHINING 3D MetiSmile-MR",
    officialProductId: "MetiSmile-MR",
    slug: "metismile-mr",
    pageUrl:
      "https://www.shining3ddental.com/blog/shining-3d-dental-metismile-mr-face-scanner-for-tmj-disorder-treatment",
    imageUrl:
      "https://www.shining3ddental.com/hs-fs/hubfs/1-Feb-26-2026-09-30-09-0145-AM.png?width=1536&height=864&name=1-Feb-26-2026-09-30-09-0145-AM.png",
    hash: "e346819595e054db474e9abad75f02073a0684caa45fdadf7d4135dbb81ee1f0",
    extension: "png",
    visualScope: "FULL_PRODUCT_WITH_OFFICIAL_WORKFLOW",
  },
];

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const fetchResponse = async (url) => {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
    headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response;
};
const validPayload = (buffer, extension) =>
  extension === "png"
    ? buffer.length >= 20_000 &&
      buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    : buffer.length >= 20_000 && buffer[0] === 0xff && buffer[1] === 0xd8;

const recovered = [];
const review = [];
await fs.mkdir(publicDir, { recursive: true });

for (const target of targets) {
  const historicalProduct = canonical.products.find(
    (candidate) =>
      candidate.brand === "SHINING 3D" &&
      clean(candidate.name) === target.name &&
      candidate.sourceEvidenceFiles?.includes(evidenceFile),
  );
  if (historicalProduct) continue;
  const product = canonical.products.find(
    (candidate) =>
      candidate.brand === "SHINING 3D" &&
      clean(candidate.name) === target.name &&
      !candidate.sourceEvidenceFiles?.includes(evidenceFile),
  );
  if (!product) {
    review.push({ ...target, reason: "CANONICAL_PRODUCT_NOT_FOUND" });
    continue;
  }
  try {
    const [pageResponse, imageResponse] = await Promise.all([
      fetchResponse(target.pageUrl),
      fetchResponse(target.imageUrl),
    ]);
    const page = await pageResponse.text();
    const image = Buffer.from(await imageResponse.arrayBuffer());
    const imagePath = new URL(target.imageUrl).pathname;
    if (
      !page.includes(target.pageReference || imagePath) &&
      !page.includes(path.basename(imagePath))
    )
      throw new Error("official page no longer references image");
    if (sha256(image) !== target.hash)
      throw new Error("official image changed; revalidation required");
    if (!validPayload(image, target.extension))
      throw new Error("official image payload is invalid");
    const filename =
      `official-shining3d-${target.slug}-${target.hash.slice(0, 10)}.` +
      target.extension;
    await fs.writeFile(path.join(publicDir, filename), image);
    const localImageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId: target.officialProductId,
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
      sourceImageUrl: localImageUrl,
      imageUrls: localImageUrl,
      imageCount: 1,
      sourcePageUrl: target.pageUrl,
      kzEvidence: product.kzEvidence,
      status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
      photoEvidence: {
        method: "OFFICIAL_PRODUCT_PAGE_EXACT_IMAGE",
        visualScope: target.visualScope,
        officialProductPageUrl: target.pageUrl,
        officialSourceImageUrl: target.imageUrl,
        sourceImageSha256: target.hash,
        sha256: target.hash,
        bytes: image.length,
        contentType:
          target.extension === "png" ? "image/png" : "image/jpeg",
      },
    });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: target.pageUrl,
      sourceImageUrl: target.imageUrl,
      reason: "OFFICIAL_IMAGE_RECOVERY_FAILED",
      publicationDecision: "KEEP_ON_PHOTO_MODERATION",
      error: String(error?.message ?? error),
    });
  }
}

const historicalRecovered = canonical.products
  .filter((candidate) => candidate.sourceEvidenceFiles?.includes(evidenceFile))
  .map((candidate) => {
    const target = targets.find(
      (entry) => entry.name === clean(candidate.name),
    );
    return {
      officialProductId: target?.officialProductId,
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
      photoEvidence: {
        method: "OFFICIAL_PRODUCT_PAGE_EXACT_IMAGE",
        visualScope: target?.visualScope,
        officialProductPageUrl: target?.pageUrl,
        officialSourceImageUrl: target?.imageUrl,
        sourceImageSha256: target?.hash,
        sha256: target?.hash,
        contentType:
          target?.extension === "png" ? "image/png" : "image/jpeg",
      },
    };
  })
  .filter(
    (candidate) => candidate.officialProductId && candidate.sourceImageUrl,
  );
const products = [
  ...new Map(
    [...historicalRecovered, ...recovered].map((candidate) => [
      candidate.officialProductId,
      candidate,
    ]),
  ).values(),
];
const evidence = {
  brand: "SHINING 3D",
  manufacturer: "SHINING 3D Tech. Co., Ltd.",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_PAGE_IMAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    pageReferenceRequired: true,
    allImageHashesPinned: true,
    exactModelVisualReviewRequired: true,
    noGeneratedProductGeometry: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: targets.length,
    recovered: products.length,
    recoveredThisRun: recovered.length,
    retainedFromPreviousRuns: historicalRecovered.length,
    reviewRequired: review.length,
  },
  products,
};
await Promise.all([
  fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`),
  fs.writeFile(
    reportPath,
    `${JSON.stringify({ ...evidence, review }, null, 2)}\n`,
  ),
]);
console.log(JSON.stringify(evidence.totals, null, 2));
