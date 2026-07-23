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
  "data/catalog-evidence/melag-official-product-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/melag-official-product-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";

const clean = (value) =>
  String(value ?? "")
    .replaceAll("&amp;", "&")
    .replace(/\s+/gu, " ")
    .trim();
const slug = (value) =>
  clean(value)
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 100) || "product";
const decodeNextImageUrl = (value, pageUrl) => {
  const parsed = new URL(clean(value), pageUrl);
  if (parsed.pathname === "/_next/image" && parsed.searchParams.get("url"))
    return parsed.searchParams.get("url");
  return parsed.href;
};

const canonicalById = new Map(
  canonical.products.map((product) => [product.canonicalProductId, product]),
);
const queueTargets = queue.items
  .filter(
    (item) =>
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" && item.brand === "MELAG",
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

const candidates = [];
const review = [];
for (const { item, product } of targets) {
  try {
    const response = await fetch(item.sourcePageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const canonicalUrl = clean(
      html.match(
        /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/iu,
      )?.[1],
    );
    if (
      !canonicalUrl ||
      new URL(canonicalUrl).pathname !== new URL(item.sourcePageUrl).pathname
    )
      throw new Error("official canonical product page mismatch");
    const officialGalleryImages = [
      ...html.matchAll(/<img\b[^>]+src="([^"]+)"[^>]*>/giu),
    ]
      .map((match) => decodeNextImageUrl(match[1], item.sourcePageUrl))
      .filter((url) => {
        try {
          return new URL(url).hostname === "shopware.melag.com";
        } catch {
          return false;
        }
      });
    const sourceImageUrl = [...new Set(officialGalleryImages)][0];
    if (!sourceImageUrl) {
      review.push({
        canonicalProductId: product.canonicalProductId,
        brand: product.brand,
        name: product.name,
        sourcePageUrl: item.sourcePageUrl,
        reason: "NO_OFFICIAL_PRODUCT_GALLERY_IMAGE",
      });
      continue;
    }
    candidates.push({ product, sourceImageUrl });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: item.sourcePageUrl,
      reason: "OFFICIAL_PRODUCT_PAGE_RECOVERY_FAILED",
      error: String(error?.message ?? error),
    });
  }
}

await fs.mkdir(publicDir, { recursive: true });
const downloaded = [];
for (const candidate of candidates) {
  try {
    const response = await fetch(candidate.sourceImageUrl, {
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
    const filename = `official-melag-${slug(candidate.product.name)}-${hash.slice(0, 10)}.${extension}`;
    downloaded.push({
      ...candidate,
      buffer,
      hash,
      filename,
      imageUrl: `${productionOrigin}/catalog/products/${filename}`,
      bytes: buffer.length,
      contentType,
    });
  } catch (error) {
    review.push({
      canonicalProductId: candidate.product.canonicalProductId,
      brand: candidate.product.brand,
      name: candidate.product.name,
      sourcePageUrl: candidate.product.sourcePageUrl,
      sourceImageUrl: candidate.sourceImageUrl,
      reason: "OFFICIAL_IMAGE_DOWNLOAD_FAILED",
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
        sourceImageUrl: item.sourceImageUrl,
        duplicateGroupSize: group.length,
        reason: "SHARED_OFFICIAL_IMAGE_NOT_EXACT_TO_ONE_CARD",
      });
    }
    continue;
  }
  const item = group[0];
  await fs.writeFile(path.join(publicDir, item.filename), item.buffer);
  recovered.push({
    officialProductId: `MELAG-PHOTO-${item.product.canonicalProductId}`,
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
      method: "OFFICIAL_PRODUCT_PAGE_PRIMARY_GALLERY_IMAGE",
      originalImageUrl: item.sourceImageUrl,
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
      product.sourceProductIds?.find((id) => id.startsWith("MELAG-PHOTO-")) ??
      `MELAG-PHOTO-${product.canonicalProductId}`,
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
  brand: "MELAG",
  manufacturer: "MELAG Medizintechnik GmbH & Co. KG",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_PAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialCanonicalProductPageRequired: true,
    officialProductGalleryRequired: true,
    duplicateDownloadedImagesRejected: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: targets.length,
    candidates: candidates.length,
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
