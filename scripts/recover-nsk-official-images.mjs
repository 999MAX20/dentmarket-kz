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
  "data/catalog-evidence/nsk-official-product-images.json",
);
const reportPath = path.join(root, "data/reports/nsk-official-product-images.json");
let previousEvidence = { products: [] };
try {
  previousEvidence = JSON.parse(await fs.readFile(outputPath, "utf8"));
} catch {
  // The first recovery run legitimately starts without an existing evidence file.
}

const clean = (value) =>
  String(value ?? "")
    .replace(/&amp;/giu, "&")
    .replace(/&#?\w+;/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
const key = (value) =>
  clean(value)
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-zа-яё0-9]+/giu, " ")
    .trim();
const attr = (tag, name) =>
  clean(
    tag.match(
      new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "iu"),
    )?.[1],
  );
const ignored = new Set([
  "nsk",
  "series",
  "dental",
  "products",
  "product",
  "コントラアングル",
  "超音波スケーラー",
  "技工用製品",
]);
const terms = (value) =>
  key(value)
    .split(" ")
    .filter((item) => item.length >= 2 && !ignored.has(item));

async function fetchHtml(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    headers: {
      "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function productImages(html, sourceUrl) {
  const productArea =
    html.match(
      /<div[^>]+id=["']wrap_products_list["'][^>]*>([\s\S]*?)(?:<!--\/#wrap_products_list-->|<footer\b)/iu,
    )?.[1] ?? "";
  const candidates = [];
  for (const match of productArea.matchAll(/<img\b[^>]*>/giu)) {
    const tag = match[0];
    const className = attr(tag, "class");
    if (!/\bfadeConts\b/iu.test(className)) continue;
    const rawUrl = attr(tag, "data-src") || attr(tag, "src");
    if (!rawUrl) continue;
    let imageUrl;
    try {
      imageUrl = new URL(rawUrl, sourceUrl).href;
    } catch {
      continue;
    }
    if (!/\.(?:jpe?g|png|webp)(?:[?#]|$)/iu.test(imageUrl)) continue;
    const imageIndex = match.index ?? 0;
    const blockStart = productArea.lastIndexOf('<div class="list-wrap', imageIndex);
    const blockEndMarker = "<!--/.list-wrap-->";
    const blockEnd = productArea.indexOf(blockEndMarker, imageIndex);
    const productBlock =
      blockStart >= 0 && blockEnd >= imageIndex
        ? productArea.slice(blockStart, blockEnd + blockEndMarker.length)
        : productArea.slice(
            Math.max(0, imageIndex - 500),
            imageIndex + tag.length + 700,
          );
    candidates.push({
      imageUrl,
      alt: attr(tag, "alt"),
      evidence: clean(productBlock),
    });
  }
  return [...new Map(candidates.map((item) => [item.imageUrl, item])).values()];
}

const canonicalById = new Map(
  canonical.products.map((product) => [product.canonicalProductId, product]),
);
const targets = queue.items
  .filter(
    (item) =>
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" &&
      item.brand === "NSK" &&
      /^https:\/\/www\.japan\.nsk-dental\.com\//iu.test(item.sourcePageUrl),
  )
  .map((item) => canonicalById.get(item.canonicalProductId))
  .filter(Boolean);
const pages = new Map();
const errors = [];
let cursor = 0;
const uniqueUrls = [...new Set(targets.map((product) => product.sourcePageUrl))];
const worker = async () => {
  while (cursor < uniqueUrls.length) {
    const url = uniqueUrls[cursor++];
    try {
      const html = await fetchHtml(url);
      pages.set(url, {
        title: clean(
          html.match(/<h2\b[^>]*class=["'][^"']*titleCategory[^"']*["'][^>]*>([\s\S]*?)<\/h2>/iu)?.[1] ??
            html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1],
        ),
        images: productImages(html, url),
      });
    } catch (error) {
      errors.push({ url, error: String(error?.message ?? error) });
    }
  }
};
await Promise.all(Array.from({ length: 8 }, () => worker()));

const recovered = [];
const review = [];
for (const product of targets) {
  const page = pages.get(product.sourcePageUrl);
  if (!page?.images.length) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      name: product.name,
      sourcePageUrl: product.sourcePageUrl,
      reason: "NO_OFFICIAL_PRODUCT_AREA_IMAGE",
    });
    continue;
  }
  const productTerms = terms(
    `${product.name} ${product.manufacturerRefs} ${product.model}`,
  );
  const manufacturerRefs = String(product.manufacturerRefs ?? "")
    .split("|")
    .map((item) => key(item))
    .filter(Boolean);
  const primaryRef = key(product.manufacturerRef);
  const ranked = page.images
    .map((image) => {
      const evidenceKey = key(`${image.alt} ${image.imageUrl} ${image.evidence}`);
      const evidenceTokens = new Set(evidenceKey.split(" ").filter(Boolean));
      const matches = productTerms.filter((term) => evidenceKey.includes(term));
      const matchedManufacturerRefs = manufacturerRefs.filter((reference) =>
        evidenceTokens.has(reference),
      );
      const primaryReferenceMatch =
        Boolean(primaryRef) && evidenceTokens.has(primaryRef);
      return {
        ...image,
        matches,
        matchedManufacturerRefs,
        primaryReferenceMatch,
        score:
          matches.length +
          matchedManufacturerRefs.length * 10 +
          (primaryReferenceMatch ? 100 : 0),
      };
    })
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const second = ranked[1];
  const shortName = key(product.name.replace(/\([^)]*\)/gu, ""));
  const pageIdentityConfirmed =
    best.score > 0 || (shortName && key(page.title).includes(shortName));
  const misleadingSubpage =
    /(?:adaptor|adapter|accessor)/iu.test(product.sourcePageUrl) &&
    !/(?:adaptor|adapter|accessor)/iu.test(product.name);
  const exact =
    (!misleadingSubpage || best.primaryReferenceMatch) &&
    ((best.primaryReferenceMatch &&
      !ranked.slice(1).some((image) => image.primaryReferenceMatch)) ||
      (page.images.length === 1 &&
        (pageIdentityConfirmed ||
          best.matchedManufacturerRefs.length > 0 ||
          best.primaryReferenceMatch)) ||
      (page.images.length > 1 &&
        !/\bseries\b/iu.test(product.name) &&
        best.score >= 2 &&
        best.score > (second?.score ?? 0)));
  if (!exact) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      name: product.name,
      sourcePageUrl: product.sourcePageUrl,
      pageTitle: page.title,
      candidates: ranked.slice(0, 3),
      reason: "MULTIPLE_OFFICIAL_PRODUCT_IMAGES_AMBIGUOUS",
    });
    continue;
  }
  recovered.push({
    officialProductId: `NSK-OFFICIAL-${product.canonicalProductId}`,
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
    sourceImageUrl: best.imageUrl,
    imageUrls: best.imageUrl,
    imageCount: 1,
    sourcePageUrl: product.sourcePageUrl,
    kzEvidence: product.kzEvidence,
    status: "RECOVERED_FROM_OFFICIAL_NSK_PRODUCT_AREA",
    recovery: {
      pageTitle: page.title,
      productAreaImageCount: page.images.length,
      matchedIdentityTerms: best.matches,
    },
  });
}

const recoveredByIdentity = new Map();
for (const product of [
  ...(Array.isArray(previousEvidence.products) ? previousEvidence.products : []),
  ...recovered,
]) {
  const identity =
    clean(product.officialProductId) ||
    `${key(product.brand)}\u0000${key(product.manufacturerRef) || key(product.name)}`;
  recoveredByIdentity.set(identity, product);
}
const allRecovered = [...recoveredByIdentity.values()];
const evidence = {
  brand: "NSK",
  manufacturer: "Nakanishi Inc.",
  sourceType: "OFFICIAL_NSK_PRODUCT_PAGES",
  sourceUrl: "https://www.japan.nsk-dental.com/products/",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialProductAreaImagesOnly: true,
    singleImageOrUniqueIdentityMatchRequired: true,
    navigationImagesRejected: true,
    ambiguousPagesRemainOnModeration: true,
  },
  totals: {
    targets: targets.length,
    sourcePages: uniqueUrls.length,
    newlyRecovered: recovered.length,
    recovered: allRecovered.length,
    preservedFromPreviousRuns: Math.max(0, allRecovered.length - recovered.length),
    review: review.length,
    errors: errors.length,
  },
  products: allRecovered,
};
await Promise.all([
  fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`),
  fs.writeFile(
    reportPath,
    `${JSON.stringify(
      { generatedAt: new Date().toISOString(), totals: evidence.totals, review, errors },
      null,
      2,
    )}\n`,
  ),
]);
console.log(JSON.stringify(evidence.totals, null, 2));
