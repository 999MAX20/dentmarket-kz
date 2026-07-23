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
  "data/catalog-evidence/castellini-official-product-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/castellini-official-product-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";

const imageByProductName = new Map([
  [
    "AlphaScan WL",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/WL.jpg",
  ],
  [
    "AlphaScan WR",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/WR.jpg",
  ],
  [
    "C Plus",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/CPLUS.jpg",
  ],
  [
    "C-Platinum",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/PLATINUM.jpg",
  ],
  [
    "Castellini Syringes",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/SIRINGA2%20M_H_2.jpg",
  ],
  [
    "Goldspeed Evo",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/goldspeedevo.jpg",
  ],
  [
    "Piezolight 6 / Piezosteril 6",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/piezosteril%20(1).jpg",
  ],
  [
    "Puma Eli Ambidextrous",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/Castellini_eli%20AMBI2026%20M_H_2.jpg",
  ],
  [
    "Puma Eli R",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/Castellini_eli%20R2026%20M_H_2.jpg",
  ],
  [
    "Silent Power Evo",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/silentpower.jpg",
  ],
  [
    "Skema 5",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/Castellini_Skema52026%20M_H_2.jpg",
  ],
  [
    "Ster 1 Plus",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/ster1plus.jpg",
  ],
  [
    "Ster 3 Plus",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/ster3plus.jpg",
  ],
  [
    "Surgical Cart",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/Castellini_CART2026.jpg",
  ],
  [
    "Surgison 2",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/surgison%20(1).jpg",
  ],
  [
    "X-VISUS DCiS",
    "https://www.castellini.com/hubfs/CASTELLINI/Images/DCIS.jpg",
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
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" &&
      item.brand === "Castellini",
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
const recovered = [];
const review = [];
await fs.mkdir(publicDir, { recursive: true });

for (const { item, product } of targets) {
  const originalImageUrl = imageByProductName.get(product.name);
  if (!originalImageUrl) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: item.sourcePageUrl,
      reason: "NO_EXACT_MODEL_ASSET_CONFIRMED_ON_OFFICIAL_PAGE",
    });
    continue;
  }
  try {
    const response = await fetch(originalImageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
    const filename = `official-castellini-${slug(product.name)}-${hash.slice(0, 10)}.${extension}`;
    await fs.writeFile(path.join(publicDir, filename), buffer);
    const imageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId: `CASTELLINI-PHOTO-${product.canonicalProductId}`,
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
        method: "OFFICIAL_PAGE_EXACT_MODEL_ASSET",
        originalImageUrl,
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
      originalImageUrl,
      reason: "OFFICIAL_IMAGE_DOWNLOAD_FAILED",
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
      product.sourceProductIds?.find((id) =>
        id.startsWith("CASTELLINI-PHOTO-"),
      ) ?? `CASTELLINI-PHOTO-${product.canonicalProductId}`,
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
    [...historicalRecovered, ...recovered].map((product) => [
      productKey(product),
      product,
    ]),
  ).values(),
].sort((left, right) => left.name.localeCompare(right.name, "en"));

const evidence = {
  brand: "Castellini",
  manufacturer: "Cefla S.C.",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_PAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    exactModelAssetMappingRequired: true,
    familyImagesNotAppliedToCapacityVariants: true,
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
