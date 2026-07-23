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
  "data/catalog-evidence/recovered-official-product-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/recovered-official-product-images.json",
);

const clean = (value) =>
  String(value ?? "")
    .replace(/&amp;/giu, "&")
    .replace(/&#x2f;/giu, "/")
    .replace(/\\u002F/giu, "/")
    .replace(/\\\//gu, "/")
    .replace(/\s+/gu, " ")
    .trim();
const token = (value) =>
  clean(value)
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/[^a-zа-яё0-9]+/giu, " ")
    .trim();
const attr = (tag, name) =>
  clean(
    tag.match(
      new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "iu"),
    )?.[1] ??
      tag.match(
        new RegExp(`\\b${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "iu"),
      )?.[2],
  );
const generic =
  /(logo|favicon|icon|sprite|avatar|author|employee|portrait|banner|captcha|pixel|placeholder|no[-_ ]?(?:available[-_ ]?)?image|default[-_ ]?image|coming[-_ ]?soon|youtube|facebook|instagram|linkedin|wechat|qr[-_ ]?code|payment|footer|header|flag|loading)/iu;
const imageExtension = /\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/iu;
const dedicatedRecoveryBrands =
  /^(?:nsk|osstem|denu|iq dent|myobrace|myoretainr)$/iu;
const importantWords = (product) => {
  const excludedIdentity = new Set(
    token(`${product.brand} ${product.manufacturer}`).split(" ").filter(Boolean),
  );
  return [...new Set([
    ...token(product.name).split(" "),
    ...token(product.manufacturerRefs).split(" "),
    ...token(product.model).split(" "),
    ...identityCodes(product),
  ])].filter(
    (word) =>
      word.length >= 4 &&
      !excludedIdentity.has(word) &&
      !/^(dental|product|products|series|system|plus|care|pack|value|набор|система|стоматологический|стоматологическая)$/iu.test(
        word,
      ),
  );
};
const identityCodes = (product) =>
  [
    ...clean(
      `${product.name} ${product.manufacturerRefs} ${product.model}`,
    ).matchAll(/(?:^|[\s(/])([A-Z0-9][A-Z0-9._/-]{1,})(?=$|[\s),])/gu),
  ]
    .map((match) => token(match[1]))
    .filter(
      (value) =>
        value.length >= 2 &&
        !/^(?:tm|ref|sku|3m|iq|cf|np|sp)$/iu.test(value),
    );
const shortNameIdentityCodes = (product) =>
  identityCodes({ ...product, manufacturerRefs: "", model: "" }).filter(
    (code) => code.length <= 3,
  );

function resolveUrl(raw, sourcePageUrl) {
  const value = clean(raw).split(/\s+\d+(?:\.\d+)?[wx](?:,|$)/u)[0];
  if (!value || value.startsWith("data:")) return "";
  try {
    return new URL(value, sourcePageUrl).href;
  } catch {
    return "";
  }
}

function candidateImages(html, sourcePageUrl, product) {
  const words = importantWords(product);
  const codes = identityCodes(product);
  const candidates = [];
  const add = (rawUrl, evidence, baseScore, kind) => {
    const url = resolveUrl(rawUrl, sourcePageUrl);
    if (!url || generic.test(url) || generic.test(evidence)) return;
    if (!imageExtension.test(url) && !/scene7|is\/image|hubfs|upload|media|image/iu.test(url))
      return;
    const haystack = token(`${url} ${evidence}`);
    const urlHaystack = token(url);
    const matches = words.filter((word) => haystack.includes(word));
    const urlMatches = words.filter((word) => urlHaystack.includes(word));
    let score = baseScore + Math.min(60, matches.length * 20);
    score += codes.filter((code) => haystack.includes(code)).length * 40;
    if (/product|detail|gallery|slider|main[-_ ]?image|hero|woocommerce-product-gallery/iu.test(evidence))
      score += 35;
    if (/related|similar|recommend|accessor|footer|news|blog/iu.test(evidence))
      score -= 55;
    candidates.push({
      url,
      score,
      kind,
      matches,
      urlMatches,
      evidence: clean(evidence).slice(0, 500),
    });
  };

  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const tag = match[0];
    const property = attr(tag, "property") || attr(tag, "name");
    if (/^(?:og:image|twitter:image(?::src)?)$/iu.test(property))
      add(attr(tag, "content"), tag, 30, property);
  }
  for (const match of html.matchAll(/<img\b[^>]*>/giu)) {
    const tag = match[0];
    const index = match.index ?? 0;
    const context = html.slice(Math.max(0, index - 350), index + tag.length + 180);
    const evidence = `${attr(tag, "alt")} ${attr(tag, "title")} ${attr(tag, "class")} ${context}`;
    for (const name of ["data-src", "data-original", "data-lazy-src", "src"]) {
      const value = attr(tag, name);
      if (value) add(value, evidence, name === "src" ? 5 : 15, name);
    }
    const srcset = attr(tag, "srcset") || attr(tag, "data-srcset");
    if (srcset) add(srcset.split(",").at(-1), evidence, 10, "srcset");
  }
  for (const match of html.matchAll(
    /https?:\\?\/\\?\/[^"'<>\\\s]+?\.(?:avif|gif|jpe?g|png|webp)(?:\?[^"'<>\\\s]*)?/giu,
  )) {
    const index = match.index ?? 0;
    add(match[0], html.slice(Math.max(0, index - 220), index + match[0].length + 220), 0, "embedded-url");
  }
  return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort(
    (left, right) => right.score - left.score,
  );
}

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
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) throw new Error(`unsupported ${type || "content type"}`);
  return response.text();
}

const canonicalById = new Map(
  canonical.products.map((product) => [product.canonicalProductId, product]),
);
const targets = queue.items
  .filter(
    (item) =>
      item.workflow === "FIND_EXACT_PRODUCT_PHOTO" &&
      item.sourcePageUrl &&
      !/\.pdf(?:#|$)/iu.test(item.sourcePageUrl),
  )
  .map((item) => ({ item, product: canonicalById.get(item.canonicalProductId) }))
  .filter(
    ({ product }) =>
      product && !dedicatedRecoveryBrands.test(token(product.brand)),
  );
const recovered = [];
const review = [];
const errors = [];
let cursor = 0;

const worker = async () => {
  while (cursor < targets.length) {
    const { item, product } = targets[cursor++];
    try {
      const html = await fetchHtml(item.sourcePageUrl);
      const title = clean(
        html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1] ??
          html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1],
      ).replace(/<[^>]+>/gu, " ");
      const pageIdentity = token(`${title} ${item.sourcePageUrl}`);
      const identityWords = importantWords(product);
      const pageMatches = identityWords.filter((word) => pageIdentity.includes(word));
      const candidates = candidateImages(html, item.sourcePageUrl, product);
      const best = candidates[0];
      const codes = identityCodes(product);
      const exactImageCode = Boolean(
        best?.urlMatches?.some((match) => codes.includes(match)),
      );
      const shortNameCodes = shortNameIdentityCodes(product);
      const exactShortNameCode =
        shortNameCodes.length === 0 ||
        shortNameCodes.some((code) => token(best?.url).includes(code));
      const exactPage =
        pageMatches.length > 0 || exactImageCode || identityWords.length === 0;
      const exactImageIdentity = Boolean(
        exactShortNameCode &&
          (exactImageCode || best?.urlMatches?.length),
      );
      if (best && exactPage && exactImageIdentity && best.score >= 55) {
        recovered.push({
          officialProductId: `RECOVERED-${product.canonicalProductId}`,
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
          sourceImageUrl: best.url,
          imageUrls: best.url,
          imageCount: 1,
          sourcePageUrl: product.sourcePageUrl,
          kzEvidence: product.kzEvidence,
          status: "RECOVERED_OFFICIAL_EXACT_IMAGE",
          recovery: {
            method: best.kind,
            score: best.score,
            pageIdentityMatches: pageMatches,
            imageIdentityMatches: best.matches,
          },
        });
      } else {
        review.push({
          canonicalProductId: product.canonicalProductId,
          brand: product.brand,
          name: product.name,
          sourcePageUrl: product.sourcePageUrl,
          pageIdentityMatches: pageMatches,
          bestCandidate: best ?? null,
          reason: !exactPage
            ? "SOURCE_PAGE_IDENTITY_NOT_CONFIRMED"
            : !exactImageIdentity
              ? "IMAGE_FILENAME_IDENTITY_NOT_CONFIRMED"
            : best
              ? "IMAGE_CANDIDATE_SCORE_TOO_LOW"
              : "NO_IMAGE_CANDIDATE",
        });
      }
    } catch (error) {
      errors.push({
        canonicalProductId: product.canonicalProductId,
        brand: product.brand,
        sourcePageUrl: product.sourcePageUrl,
        error: String(error?.message ?? error),
      });
    }
  }
};

await Promise.all(Array.from({ length: 8 }, () => worker()));
const historicalRecovered = canonical.products
  .filter((product) =>
    product.sourceEvidenceFiles?.includes(
      path.basename(outputPath),
    ),
  )
  .map((product) => ({
    officialProductId:
      product.sourceProductIds?.[0] ??
      `RECOVERED-${product.canonicalProductId}`,
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
    imageCount: product.evidenceImageUrl ? 1 : 0,
    sourcePageUrl: product.sourcePageUrl,
    kzEvidence: product.kzEvidence,
    status: "RETAINED_PREVIOUS_OFFICIAL_IMAGE_RECOVERY",
  }))
  .filter((product) => {
    const imageUrl = clean(product.sourceImageUrl);
    if (
      !imageUrl ||
      generic.test(imageUrl) ||
      /\.gif(?:[?#]|$)/iu.test(imageUrl) ||
      dedicatedRecoveryBrands.test(token(product.brand))
    )
      return false;
    const imageIdentity = token(imageUrl);
    const words = importantWords(product);
    const codes = identityCodes(product);
    const shortNameCodes = shortNameIdentityCodes(product);
    if (
      shortNameCodes.length > 0 &&
      !shortNameCodes.some((code) => imageIdentity.includes(code))
    )
      return false;
    return (
      codes.some((code) => imageIdentity.includes(code)) ||
      words.some((word) => imageIdentity.includes(word))
    );
  });
const productKey = (product) =>
  `${token(product.brand)}\u0000${token(product.name)}\u0000${token(
    product.manufacturerRefs,
  )}`;
const mergedRecovered = [
  ...new Map(
    [...historicalRecovered, ...recovered].map((product) => [
      productKey(product),
      product,
    ]),
  ).values(),
];
mergedRecovered.sort(
  (left, right) =>
    left.brand.localeCompare(right.brand, "ru") ||
    left.name.localeCompare(right.name, "ru"),
);
const evidence = {
  brand: "MULTI_BRAND_OFFICIAL_IMAGE_RECOVERY",
  manufacturer: "Multiple verified manufacturers",
  sourceType: "RECOVERED_FROM_EXISTING_OFFICIAL_PRODUCT_PAGES",
  sourceUrl: "",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialExistingSourcePagesOnly: true,
    exactPageIdentityRequired: true,
    genericAssetsRejected: true,
    noSearchEngineOrThirdPartyImageAcceptedAutomatically: true,
  },
  totals: {
    htmlTargets: targets.length,
    recovered: mergedRecovered.length,
    recoveredThisRun: recovered.length,
    retainedFromPreviousRuns: historicalRecovered.length,
    review: review.length,
    errors: errors.length,
  },
  products: mergedRecovered,
};
const report = {
  generatedAt: new Date().toISOString(),
  totals: evidence.totals,
  review,
  errors,
};
await Promise.all([
  fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`),
  fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`),
]);
console.log(JSON.stringify(evidence.totals, null, 2));
