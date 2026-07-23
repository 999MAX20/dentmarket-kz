import crypto from "node:crypto";
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
  "data/catalog-evidence/wh-official-product-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/wh-official-product-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";

const imageByProductName = new Map([
  [
    "eLog",
    "https://a.storyblok.com/f/45617/940x400/43342d9dcc/elog-product-overview.jpg",
  ],
  [
    "Lexa sterilizer",
    "https://a.storyblok.com/f/45617/600x519/6647087655/lexa-frontview-dent.jpg",
  ],
  [
    "MS Sterilizer",
    "https://a.storyblok.com/f/45617/600x600/2f07615bde/mssterilizer_product1_global.jpg",
  ],
  [
    "Original SmartPegs by Osstell",
    "https://a.storyblok.com/f/45617/1000x600/8f944f1505/smartpegs-cover-two-versions.jpg",
  ],
  [
    "Osstell Beacon",
    "https://a.storyblok.com/f/45617/94652b8d7f/osstell-beacon.jpg",
  ],
  [
    "Osstell Classic",
    "https://a.storyblok.com/f/45617/600x801/fd29691e1c/osstell-classic_implantmed.jpg",
  ],
  [
    "OsstellConnect",
    "https://a.storyblok.com/f/45617/940x400/b8a58d86e7/osstellconnect_teaser.jpg",
  ],
  [
    "RC Straight & Contra-angle Handpieces",
    "https://a.storyblok.com/f/45617/600x600/694294dbf3/product-rc-handpieces.png",
  ],
  [
    "Seethrough – Imaging Solutions",
    "https://a.storyblok.com/f/45617/940x400/adacd25c8f/seethrough-max-flex-940x400.jpg",
  ],
  [
    "Traceability thanks to EliTrace",
    "https://a.storyblok.com/f/45617/600x600/c2ef6287a1/20200806_webbanner-elitrace_grafiken-600x600px_1.jpg",
  ],
]);

const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
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
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" && item.brand === "W&H",
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
  }));
const targets = [
  ...new Map(
    [...retainedTargets, ...queueTargets].map((target) => [
      target.product.canonicalProductId,
      target,
    ]),
  ).values(),
];

await fs.mkdir(publicDir, { recursive: true });
const downloaded = [];
const review = [];
for (const { item, product } of targets) {
  const originalImageUrl = imageByProductName.get(product.name);
  if (!originalImageUrl) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: item.sourcePageUrl,
      reason: "NO_EXPLICIT_OFFICIAL_MODEL_ASSET_MAPPING",
    });
    continue;
  }
  try {
    const pageResponse = await fetch(item.sourcePageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!pageResponse.ok) throw new Error(`product page HTTP ${pageResponse.status}`);
    const pageHtml = await pageResponse.text();
    const imagePath = new URL(originalImageUrl).pathname;
    if (!pageHtml.includes(imagePath))
      throw new Error("mapped asset is no longer present on official product page");
    const response = await fetch(originalImageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!response.ok) throw new Error(`image HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/"))
      throw new Error(`unsupported ${contentType || "content type"}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 4_000) throw new Error("image payload too small");
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const extension =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
    const filename = `official-wh-${slug(product.name)}-${hash.slice(0, 10)}.${extension}`;
    downloaded.push({
      product,
      originalImageUrl,
      buffer,
      hash,
      filename,
      imageUrl: `${productionOrigin}/catalog/products/${filename}`,
      bytes: buffer.length,
      contentType,
    });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: item.sourcePageUrl,
      originalImageUrl,
      reason: "OFFICIAL_MODEL_IMAGE_RECOVERY_FAILED",
      error: String(error?.message ?? error),
    });
  }
}

const byHash = new Map();
for (const item of downloaded) {
  const group = byHash.get(item.hash) ?? [];
  group.push(item);
  byHash.set(item.hash, group);
}
const recovered = [];
for (const group of byHash.values()) {
  if (group.length > 1) {
    for (const item of group) {
      review.push({
        canonicalProductId: item.product.canonicalProductId,
        brand: item.product.brand,
        name: item.product.name,
        sourcePageUrl: item.product.sourcePageUrl,
        duplicateGroupSize: group.length,
        reason: "SHARED_OFFICIAL_IMAGE_NOT_EXACT_TO_ONE_CARD",
      });
    }
    continue;
  }
  const item = group[0];
  await fs.writeFile(path.join(publicDir, item.filename), item.buffer);
  recovered.push({
    officialProductId: `WH-PHOTO-${item.product.canonicalProductId}`,
    brand: item.product.brand,
    manufacturer: item.product.manufacturer,
    name: item.product.name,
    manufacturerRef: item.product.manufacturerRef,
    manufacturerRefs: item.product.manufacturerRefs,
    model: item.product.model,
    variantCount: item.product.variantCount,
    variants: item.product.variants,
    categoryPath: item.product.categoryPath,
    description: item.product.description,
    sourceImageUrl: item.imageUrl,
    imageUrls: item.imageUrl,
    imageCount: 1,
    sourcePageUrl: item.product.sourcePageUrl,
    kzEvidence: item.product.kzEvidence,
    status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
    photoEvidence: {
      method: "EXPLICIT_OFFICIAL_PRODUCT_PAGE_ASSET_MAPPING",
      originalImageUrl: item.originalImageUrl,
      sha256: item.hash,
      bytes: item.bytes,
      contentType: item.contentType,
    },
  });
}

const historicalRecovered = canonical.products
  .filter((product) =>
    product.sourceEvidenceFiles?.includes(path.basename(outputPath)),
  )
  .map((product) => ({
    officialProductId:
      product.sourceProductIds?.find((id) => id.startsWith("WH-PHOTO-")) ??
      `WH-PHOTO-${product.canonicalProductId}`,
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
    imageCount: 1,
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
    [...historicalRecovered, ...recovered].map((product) => [
      productKey(product),
      product,
    ]),
  ).values(),
].sort((left, right) => left.name.localeCompare(right.name, "en"));

const evidence = {
  brand: "W&H",
  manufacturer: "W&H Dentalwerk Bürmoos GmbH",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_PAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    mappedAssetMustRemainOnOfficialProductPage: true,
    duplicateDownloadedImagesRejected: true,
    genericSiteAssetsExcluded: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: targets.length,
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
