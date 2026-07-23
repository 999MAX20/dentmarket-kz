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
  "data/catalog-evidence/ajax-official-product-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/ajax-official-product-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";

const clean = (value) =>
  String(value ?? "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
const slug = (value) =>
  clean(value)
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 100) || "product";
const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const namePattern = (name) =>
  new RegExp(
    `<p>\\s*${clean(name)
      .split(/\s+/gu)
      .map(escapeRegExp)
      .join("(?:\\s|&nbsp;)+")}\\s*</p>`,
    "iu",
  );

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

const canonicalById = new Map(
  canonical.products.map((product) => [product.canonicalProductId, product]),
);
const queueTargets = queue.items
  .filter(
    (item) =>
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" && item.brand === "Ajax",
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
const pageCache = new Map();
const candidates = [];
const review = [];

for (const { item, product } of targets) {
  try {
    let html = pageCache.get(item.sourcePageUrl);
    if (!html) {
      html = await fetchText(item.sourcePageUrl);
      pageCache.set(item.sourcePageUrl, html);
    }
    const match = namePattern(product.name).exec(html);
    if (!match) {
      review.push({
        canonicalProductId: product.canonicalProductId,
        brand: product.brand,
        name: product.name,
        sourcePageUrl: item.sourcePageUrl,
        reason: "EXACT_VISIBLE_PRODUCT_NAME_NOT_FOUND",
      });
      continue;
    }
    const titleStart = html.lastIndexOf("<h3", match.index);
    const titleTag = html.slice(titleStart, match.index);
    const titleX = Number(
      titleTag.match(/\bleft:([-\d.]+)(?:px)?(?:;|")/iu)?.[1],
    );
    const carouselStart = html.lastIndexOf(
      '<div id="Carousel3_',
      titleStart,
    );
    const moduleStart = html.lastIndexOf(
      '<div id="EditableModule1_',
      titleStart,
    );
    const sectionStart = Math.max(carouselStart, moduleStart, 0);
    const nextCarousel = html.indexOf('<div id="Carousel3_', match.index + 1);
    const nextModule = html.indexOf(
      '<div id="EditableModule1_',
      match.index + 1,
    );
    const positiveEnds = [nextCarousel, nextModule].filter(
      (index) => index > match.index,
    );
    const sectionEnd = positiveEnds.length
      ? Math.min(...positiveEnds)
      : Math.min(html.length, match.index + 20_000);
    const section = html.slice(sectionStart, sectionEnd);
    const sectionImages = [
      ...section.matchAll(
        /<a id="Image[^"]+"[^>]*?\sstyle="([^"]+)"[\s\S]*?<img[^>]+src="(https?:[^"]+)"/giu,
      ),
    ]
      .map((candidate) => ({
        x: Number(
          candidate[1].match(/\bleft:([-\d.]+)(?:px)?(?:;|")/iu)?.[1],
        ),
        url: clean(candidate[2]),
      }))
      .filter((candidate) => candidate.url);
    const spatialImage =
      Number.isFinite(titleX) && sectionImages.length
        ? sectionImages
            .filter((candidate) => Number.isFinite(candidate.x))
            .sort(
              (left, right) =>
                Math.abs(left.x - titleX) - Math.abs(right.x - titleX),
            )[0]
        : null;
    const imageStart = html.lastIndexOf('<a id="Image', match.index);
    const imageBlock =
      imageStart >= 0 ? html.slice(imageStart, match.index) : "";
    const nearbyUrls = [
      ...imageBlock.matchAll(
        /(?:src|background-image:url\()=["']?(https?:[^"')]+)(?:["')])/giu,
      ),
    ].map((candidate) => clean(candidate[1]));
    const sourceImageUrl = spatialImage?.url || nearbyUrls.at(-1);
    if (
      !sourceImageUrl ||
      (!spatialImage && match.index - imageStart > 8_000) ||
      !/waimao\.office\.163\.com\/site\/api\/pub\/resource\//iu.test(
        sourceImageUrl,
      )
    ) {
      review.push({
        canonicalProductId: product.canonicalProductId,
        brand: product.brand,
        name: product.name,
        sourcePageUrl: item.sourcePageUrl,
        reason: "NEARBY_OFFICIAL_PRODUCT_IMAGE_NOT_CONFIRMED",
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
      reason: "OFFICIAL_PAGE_FETCH_FAILED",
      error: String(error?.message ?? error),
    });
  }
}

const bySourceUrl = new Map();
for (const candidate of candidates) {
  const group = bySourceUrl.get(candidate.sourceImageUrl) ?? [];
  group.push(candidate);
  bySourceUrl.set(candidate.sourceImageUrl, group);
}
const uniqueCandidates = [];
for (const group of bySourceUrl.values()) {
  if (group.length === 1) {
    uniqueCandidates.push(group[0]);
    continue;
  }
  for (const candidate of group) {
    review.push({
      canonicalProductId: candidate.product.canonicalProductId,
      brand: candidate.product.brand,
      name: candidate.product.name,
      sourcePageUrl: candidate.product.sourcePageUrl,
      sourceImageUrl: candidate.sourceImageUrl,
      duplicateGroupSize: group.length,
      reason: "SHARED_OFFICIAL_IMAGE_NOT_EXACT_TO_ONE_CARD",
    });
  }
}

await fs.mkdir(publicDir, { recursive: true });
const downloaded = [];
for (const candidate of uniqueCandidates) {
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
    const extension =
      contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : contentType.includes("gif")
            ? "gif"
            : "jpg";
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const filename = `official-ajax-${slug(candidate.product.name)}-${hash.slice(0, 10)}.${extension}`;
    await fs.writeFile(path.join(publicDir, filename), buffer);
    downloaded.push({
      ...candidate,
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
        reason: "DUPLICATE_DOWNLOADED_IMAGE_NOT_EXACT_TO_ONE_CARD",
      });
    }
    continue;
  }
  const item = group[0];
  recovered.push({
    officialProductId: `AJAX-PHOTO-${item.product.canonicalProductId}`,
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
      method: "OFFICIAL_PAGE_NEAREST_NAMED_PRODUCT_IMAGE",
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
      product.sourceProductIds?.find((id) => id.startsWith("AJAX-PHOTO-")) ??
      `AJAX-PHOTO-${product.canonicalProductId}`,
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
  brand: "Ajax",
  manufacturer: "Ajax Medical Equipment Co., Ltd.",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_PAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    exactVisibleProductNameRequired: true,
    nearestOfficialImageRequired: true,
    sharedImagesRejected: true,
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
