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
  "data/catalog-evidence/osstem-global-official-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/osstem-global-official-images.json",
);

const clean = (value) =>
  String(value ?? "")
    .replace(/&quot;/giu, '"')
    .replace(/&amp;/giu, "&")
    .replace(/&#?\w+;/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
const key = (value) =>
  clean(value)
    .normalize("NFKD")
    .toLocaleLowerCase("ru")
    .replace(/[^a-zа-яё0-9]+/giu, " ")
    .trim();
const ignored = new Set([
  "osstem",
  "implant",
  "имплантат",
  "имплантатов",
  "набор",
  "система",
  "абатмент",
  "abatment",
  "abutment",
  "для",
  "and",
  "the",
  "kit",
]);
const tokens = (value) =>
  key(value)
    .split(" ")
    .filter((item) => item.length >= 3 && !ignored.has(item));

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
    headers: {
      "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0",
      accept: "text/html,application/xhtml+xml,application/xml,text/xml",
    },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

const sitemapIndex = await fetchText("https://www.osstem.ru/sitemap.xml");
const sitemapUrls = [...sitemapIndex.matchAll(/<loc>(.*?)<\/loc>/giu)].map(
  (match) => clean(match[1]).replace(/^http:/iu, "https:"),
);
const pageUrls = [
  ...new Set(
    (
      await Promise.all(
        sitemapUrls.map(async (url) => {
          const xml = await fetchText(url);
          return [...xml.matchAll(/<loc>(.*?)<\/loc>/giu)].map((match) =>
            clean(match[1]).replace(/^http:/iu, "https:"),
          );
        }),
      )
    )
      .flat()
      .filter(
        (url) =>
          /^https:\/\/www\.osstem\.ru\//iu.test(url) &&
          !/\.(?:pdf|jpe?g|png|webp)(?:[?#]|$)/iu.test(url),
      ),
  ),
];

let cursor = 0;
const pages = [];
const pageErrors = [];
const worker = async () => {
  while (cursor < pageUrls.length) {
    const url = pageUrls[cursor++];
    try {
      const html = await fetchText(url);
      const title = clean(
        html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ??
          html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1],
      );
      const imageCandidates = [
        ...html.matchAll(
          /<a\b[^>]*class=["'][^"']*gallery__item-link[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/giu,
        ),
      ].map((match) => {
        try {
          return new URL(clean(match[1]), url).href;
        } catch {
          return "";
        }
      });
      const imageUrl = imageCandidates.find((candidate) =>
        /\.(?:jpe?g|png|webp)(?:[?#]|$)/iu.test(candidate),
      );
      if (title && imageUrl) pages.push({ url, title, imageUrl });
    } catch (error) {
      pageErrors.push({ url, error: String(error?.message ?? error) });
    }
  }
};
await Promise.all(Array.from({ length: 10 }, () => worker()));

const canonicalById = new Map(
  canonical.products.map((product) => [product.canonicalProductId, product]),
);
const targets = queue.items
  .filter(
    (item) =>
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" && item.brand === "Osstem",
  )
  .map((item) => canonicalById.get(item.canonicalProductId))
  .filter(Boolean);
const recovered = [];
const review = [];

for (const product of targets) {
  const productKey = key(product.name);
  const productTokens = tokens(product.name);
  const ranked = pages
    .map((page) => {
      const pageKey = key(page.title);
      const pageTokens = new Set(tokens(page.title));
      const matches = productTokens.filter((item) => pageTokens.has(item));
      const exact =
        pageKey.includes(productKey) ||
        (productTokens.length > 0 &&
          productTokens.every((item) => pageTokens.has(item)));
      const score =
        (exact ? 100 : 0) +
        matches.length * 25 +
        (productTokens.length ? (matches.length / productTokens.length) * 30 : 0);
      return { ...page, score, matches, exact };
    })
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  const second = ranked[1];
  const productRequiresKit = /\bkit\b/iu.test(product.name);
  const pageConfirmsKit = /\bkit\b/iu.test(best?.title ?? "");
  const productRequiresFull = /\bfull\b/iu.test(product.name);
  const pageConfirmsFull = /\bfull\b/iu.test(best?.title ?? "");
  const numericKitAlias =
    productRequiresKit &&
    productTokens.some((item) => /^\d{2,4}$/u.test(item)) &&
    productTokens
      .filter((item) => /^\d{2,4}$/u.test(item))
      .every((item) => key(best?.title).split(" ").includes(item));
  const uniqueEnough =
    best &&
    productTokens.length > 0 &&
    (!productRequiresKit || pageConfirmsKit) &&
    (!productRequiresFull || pageConfirmsFull) &&
    (best.score >= 80 || numericKitAlias) &&
    (best.exact ||
      numericKitAlias ||
      (best.matches.some((item) => item.length >= 5) &&
        best.score - (second?.score ?? 0) >= 20));
  if (!uniqueEnough) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      name: product.name,
      bestCandidate: best ?? null,
      secondCandidate: second ?? null,
      reason: best ? "GLOBAL_OFFICIAL_PAGE_MATCH_AMBIGUOUS" : "NO_GLOBAL_OFFICIAL_PAGE",
    });
    continue;
  }
  recovered.push({
    officialProductId: `OSSTEM-GLOBAL-${product.canonicalProductId}`,
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
    sourcePageUrl: best.url,
    kzEvidence: product.kzEvidence,
    status: "RECOVERED_FROM_OFFICIAL_OSSTEM_REGIONAL_PAGE",
    recovery: {
      pageTitle: best.title,
      score: best.score,
      matchedIdentityTokens: best.matches,
      originalKazakhstanSourcePageUrl: product.sourcePageUrl,
    },
  });
}

const evidence = {
  brand: "Osstem",
  manufacturer: "Osstem Implant Co., Ltd.",
  sourceType: "OFFICIAL_OSSTEM_REGIONAL_PRODUCT_PAGES",
  sourceUrl: "https://www.osstem.ru/",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialRegionalManufacturerPagesOnly: true,
    exactOrUniqueProductIdentityRequired: true,
    galleryProductImageOnly: true,
    ambiguousMatchesRemainOnModeration: true,
  },
  totals: {
    sitemapPages: pageUrls.length,
    productPagesWithGallery: pages.length,
    targets: targets.length,
    recovered: recovered.length,
    review: review.length,
    pageErrors: pageErrors.length,
  },
  products: recovered,
};
await Promise.all([
  fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`),
  fs.writeFile(
    reportPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totals: evidence.totals,
        review,
        pageErrors,
      },
      null,
      2,
    )}\n`,
  ),
]);
console.log(JSON.stringify(evidence.totals, null, 2));
