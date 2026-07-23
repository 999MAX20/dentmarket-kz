import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.voco.dental/en/";
const indexUrl = new URL("portaldata/1/scripts/sites/productOverviewIndex.aspx/Get", baseUrl).href;
const jsonOutputPath = path.resolve("data/catalog-evidence/voco-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/voco-manufacturer-catalog-queue.csv");
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const clean = (value) => String(value ?? "")
  .replace(/<[^>]*>/gu, " ")
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&#39;", "'")
  .replaceAll("&quot;", '"')
  .replace(/\s+/gu, " ")
  .trim();
const escapeCsv = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const fetchText = async (url, options = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(90_000),
        headers: {
          "user-agent": "DentMarket-KZ catalog evidence audit/1.0",
          ...options.headers,
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.text();
    } catch (error) { lastError = error; }
  }
  throw lastError;
};
const absoluteUrl = (value, pageUrl) => {
  if (!value) return "";
  try { return new URL(value, pageUrl).href; } catch { return ""; }
};

const indexResults = [];
for (const letter of letters) {
  try {
    const raw = await fetchText(indexUrl, {
      method: "POST",
      headers: { "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ letter, culture: "en" }),
    });
    const payload = JSON.parse(raw);
    indexResults.push({ letter, html: (payload.d ?? []).join("\n") });
  } catch (error) {
    indexResults.push({ letter, html: "", error: String(error?.message ?? error) });
  }
}
const indexErrors = indexResults.filter((entry) => entry.error).map(({ letter, error }) => ({ letter, error }));
const discovered = new Map();
for (const { letter, html } of indexResults) {
  for (const match of html.matchAll(/<a\s+href=['"]([^'"]*products\/[^'"]+)['"][^>]*>[\s\S]*?<div class=['"]text['"]>([\s\S]*?)<\/div>/giu)) {
    const sourcePageUrl = absoluteUrl(match[1], baseUrl).replace(/\.aspx$/u, "") + ".aspx";
    discovered.set(sourcePageUrl, { sourcePageUrl, indexName: clean(match[2]), letter });
  }
}

const products = [];
const errors = [];
let cursor = 0;
const entries = [...discovered.values()];
const worker = async () => {
  while (cursor < entries.length) {
    const entry = entries[cursor++];
    try {
      const html = await fetchText(entry.sourcePageUrl);
      const title = clean(html.match(/<title>([\s\S]*?)\s+-\s+[^<]*\|\s*VOCO GmbH<\/title>/iu)?.[1]) || entry.indexName;
      if (!title) throw new Error("product name not found");
      const description = clean(html.match(/<meta name="description" content="([^"]*)"/iu)?.[1]);
      const refs = [];
      const refSeen = new Set();
      const presentationStart = html.search(/<div\s+id=['"]refnr['"]/iu);
      const presentationEnd = presentationStart >= 0 ? html.indexOf("showAnimation", presentationStart + 30) : -1;
      const presentationHtml = presentationStart >= 0 ? html.slice(presentationStart, presentationEnd > presentationStart ? presentationEnd : presentationStart + 120_000) : "";
      for (const match of presentationHtml.matchAll(/<div class=['"]number changedSymbolContainer['"]>[\s\S]*?REF(?:&nbsp;|\s|&#160;)*(\d{3,8})[\s\S]*?<\/div>\s*<div class=['"]description['"]>([\s\S]*?)<\/div>/giu)) {
        const manufacturerRef = clean(match[1]);
        if (!manufacturerRef || refSeen.has(manufacturerRef)) continue;
        refSeen.add(manufacturerRef);
        const rowLabel = clean(match[2]);
        refs.push({
          variantLabel: rowLabel && !/^REF\b/iu.test(rowLabel) ? `${rowLabel} · REF ${manufacturerRef}` : `REF ${manufacturerRef}`,
          manufacturerRef,
          sourceContext: rowLabel,
          status: "OFFICIAL_REFERENCE_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED",
        });
      }
      const imageCandidates = [...html.matchAll(/<img\b[^>]*\bsrc=['"]([^'"]+)['"]/giu)]
        .map((match) => absoluteUrl(match[1], entry.sourcePageUrl))
        .filter((url) => url && /\/resources\/products\//iu.test(url))
        .filter((url) => !/\/symbols\/|\/icons?[_/.-]|icon[_/.-]|videoscreen|klinischer|farbkarte|header_/iu.test(url));
      const sourceImageUrl = imageCandidates.find((url) => /\/pacshots\//iu.test(url)) ?? imageCandidates.find((url) => /packshot/iu.test(url)) ?? "";
      const slug = entry.sourcePageUrl.replace(/\.aspx$/u, "").split("/").filter(Boolean).at(-1);
      const categoryPath = entry.sourcePageUrl.split("/products/")[1]?.split("/").slice(0, -1).map(clean).join(" / ") ?? "";
      products.push({
        officialProductId: `VOCO-${String(slug).toUpperCase()}`,
        brand: "VOCO",
        manufacturer: "VOCO GmbH",
        name: title,
        manufacturerRef: refs[0]?.manufacturerRef ?? "",
        manufacturerRefs: refs.map((variant) => variant.manufacturerRef).join(" | "),
        model: title,
        variantCount: Math.max(1, refs.length),
        variants: refs.length ? refs : [{ variantLabel: title, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }],
        categoryPath: `VOCO / ${categoryPath || "Dental products"}`,
        description,
        sourceImageUrl,
        imageUrls: sourceImageUrl,
        imageCount: sourceImageUrl ? 1 : 0,
        sourcePageUrl: entry.sourcePageUrl,
        additionalSourceUrls: indexUrl,
        kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED",
        status: !sourceImageUrl ? "PHOTO_REQUIRED" : refs.length ? "OFFICIAL_REFERENCE_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED",
      });
    } catch (error) {
      errors.push({ sourcePageUrl: entry.sourcePageUrl, error: String(error?.message ?? error) });
    }
  }
};
await Promise.all(Array.from({ length: 2 }, () => worker()));
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const tokenSet = (value) => new Set(clean(value).toLocaleLowerCase("en").split(/[^a-z0-9]+/u).filter((token) => token.length >= 3));
const refsToOccurrences = new Map();
for (const product of products) for (const variant of product.variants) if (variant.manufacturerRef) {
  const occurrences = refsToOccurrences.get(variant.manufacturerRef) ?? [];
  occurrences.push({ product, variant }); refsToOccurrences.set(variant.manufacturerRef, occurrences);
}
const consolidatedDuplicateRefs = [];
for (const [ref, occurrences] of refsToOccurrences) {
  if (occurrences.length < 2) continue;
  consolidatedDuplicateRefs.push(ref);
  occurrences.sort((a, b) => {
    const score = ({ product, variant }) => { const productTokens = tokenSet(product.name); return [...tokenSet(variant.variantLabel)].filter((token) => productTokens.has(token)).length; };
    return score(b) - score(a) || a.product.name.localeCompare(b.product.name, "en");
  });
  for (const occurrence of occurrences.slice(1)) occurrence.product.variants = occurrence.product.variants.filter((variant) => variant !== occurrence.variant);
}
for (const product of products) {
  if (!product.variants.length) product.variants = [{ variantLabel: product.name, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }];
  product.variantCount = product.variants.length;
  product.manufacturerRef = product.variants.find((variant) => variant.manufacturerRef)?.manufacturerRef ?? "";
  product.manufacturerRefs = product.variants.map((variant) => variant.manufacturerRef).filter(Boolean).join(" | ");
}
const allRefs = products.flatMap((product) => product.variants.map((variant) => variant.manufacturerRef).filter(Boolean));
const duplicateRefs = [...new Set(allRefs.filter((ref, index) => allRefs.indexOf(ref) !== index))].sort();
const report = {
  brand: "VOCO",
  manufacturer: "VOCO GmbH",
  sourceType: "CURRENT_OFFICIAL_PRODUCT_INDEX_AND_PRODUCT_PAGES",
  sourceUrl: "https://www.voco.dental/en/products.aspx",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    allOfficialIndexLettersChecked: true,
    exactOfficialReferencesCollected: true,
    onlyExplicitPackshotImagesAccepted: true,
    marketingAndClinicalImagesExcluded: true,
    missingFieldsNeverDeleteCard: true,
  },
  totals: {
    indexLettersChecked: letters.length,
    officialProductPages: entries.length,
    discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithImages: products.filter((product) => product.imageCount > 0).length,
    productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    exactReferences: allRefs.length,
    duplicateReferencesAcrossProducts: duplicateRefs.length,
    consolidatedDuplicateReferences: consolidatedDuplicateRefs.length,
    indexErrors: indexErrors.length,
    crawlErrors: errors.length,
  },
  duplicateRefs,
  consolidatedDuplicateRefs,
  indexErrors,
  errors,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([
  fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"),
  fs.writeFile(queueOutputPath, csv),
]);
console.log(JSON.stringify(report.totals, null, 2));
