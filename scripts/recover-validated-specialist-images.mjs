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
  "data/catalog-evidence/medit-manufacturer-validated-specialist-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/medit-manufacturer-validated-specialist-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const evidenceFile = path.basename(outputPath);

const mappings = [
  {
    officialProductId: "MEDIT-T310",
    brand: "Medit",
    name: "Medit T310",
    modelToken: "T310",
    sourcePageUrl:
      "https://shop.dentaldirekt.de/en/products/lab-scanner-medit-t310",
    sourceImageUrl:
      "https://shop.dentaldirekt.de/cdn/shop/files/T310_MEDITLaborscanner800x800.webp?v=1768388319",
    specialist: "Dental Direkt GmbH",
  },
  {
    officialProductId: "MEDIT-T510",
    brand: "Medit",
    name: "Medit T510",
    modelToken: "T510",
    sourcePageUrl:
      "https://shop.dentaldirekt.de/en/products/lab-scanner-medit-t510",
    sourceImageUrl:
      "https://shop.dentaldirekt.de/cdn/shop/files/T510_MEDITLaborscanner800x800.webp?v=1768388341",
    specialist: "Dental Direkt GmbH",
  },
];

const clean = (value) =>
  String(value ?? "")
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
const canonicalByName = new Map(
  canonical.products.map((product) => [
    `${clean(product.brand).toLocaleLowerCase("en")}\u0000${clean(
      product.name,
    ).toLocaleLowerCase("en")}`,
    product,
  ]),
);
const candidates = [];
const review = [];

for (const mapping of mappings) {
  const product = canonicalByName.get(
    `${mapping.brand.toLocaleLowerCase("en")}\u0000${mapping.name.toLocaleLowerCase("en")}`,
  );
  if (!product) {
    review.push({
      brand: mapping.brand,
      name: mapping.name,
      reason: "CANONICAL_PRODUCT_NOT_FOUND",
    });
    continue;
  }
  try {
    const pageResponse = await fetch(mapping.sourcePageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!pageResponse.ok)
      throw new Error(`specialist page HTTP ${pageResponse.status}`);
    const html = await pageResponse.text();
    if (
      !html.includes(new URL(mapping.sourceImageUrl).pathname) ||
      !html.toLocaleLowerCase("en").includes(
        mapping.modelToken.toLocaleLowerCase("en"),
      )
    )
      throw new Error("model-specific page and image linkage not confirmed");

    const imageResponse = await fetch(mapping.sourceImageUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!imageResponse.ok)
      throw new Error(`specialist image HTTP ${imageResponse.status}`);
    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    if (
      buffer.length < 20_000 ||
      !buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    )
      throw new Error("model image is not a valid high-resolution PNG");
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width < 600 || height < 600)
      throw new Error(`model image resolution is too low (${width}x${height})`);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const filename = `verified-${slug(mapping.brand)}-${slug(mapping.name)}-${hash.slice(0, 10)}.png`;
    candidates.push({
      mapping,
      product,
      buffer,
      hash,
      filename,
      width,
      height,
    });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl: mapping.sourcePageUrl,
      sourceImageUrl: mapping.sourceImageUrl,
      reason: "SPECIALIST_EXACT_IMAGE_VALIDATION_FAILED",
      error: String(error?.message ?? error),
    });
  }
}

const byHash = new Map();
for (const candidate of candidates) {
  const group = byHash.get(candidate.hash) ?? [];
  group.push(candidate);
  byHash.set(candidate.hash, group);
}
await fs.mkdir(publicDir, { recursive: true });
const recovered = [];
for (const group of byHash.values()) {
  if (group.length !== 1) {
    for (const candidate of group) {
      review.push({
        canonicalProductId: candidate.product.canonicalProductId,
        brand: candidate.product.brand,
        name: candidate.product.name,
        duplicateGroupSize: group.length,
        reason: "SHARED_SPECIALIST_IMAGE_NOT_EXACT_TO_ONE_CARD",
      });
    }
    continue;
  }
  const candidate = group[0];
  await fs.writeFile(
    path.join(publicDir, candidate.filename),
    candidate.buffer,
  );
  const imageUrl = `${productionOrigin}/catalog/products/${candidate.filename}`;
  recovered.push({
    officialProductId: candidate.mapping.officialProductId,
    brand: candidate.product.brand,
    manufacturer: candidate.product.manufacturer,
    name: candidate.product.name,
    manufacturerRef: candidate.product.manufacturerRef,
    manufacturerRefs: candidate.product.manufacturerRefs,
    model: candidate.product.model,
    variantCount: candidate.product.variantCount,
    variants: candidate.product.variants,
    categoryPath: candidate.product.categoryPath,
    description: candidate.product.description,
    sourceImageUrl: imageUrl,
    imageUrls: imageUrl,
    imageCount: 1,
    sourcePageUrl: candidate.mapping.sourcePageUrl,
    kzEvidence: candidate.product.kzEvidence,
    status: "VALIDATED_EXACT_SPECIALIST_PRODUCT_IMAGE",
    photoEvidence: {
      method: "MODEL_SPECIFIC_SPECIALIST_RESELLER_PRODUCT_PAGE",
      specialist: candidate.mapping.specialist,
      modelToken: candidate.mapping.modelToken,
      originalImageUrl: candidate.mapping.sourceImageUrl,
      sha256: candidate.hash,
      bytes: candidate.buffer.length,
      width: candidate.width,
      height: candidate.height,
      contentType: "image/png",
    },
  });
}

const historicalRecovered = canonical.products
  .filter((product) => product.sourceEvidenceFiles?.includes(evidenceFile))
  .map((product) => {
    const mapping = mappings.find(
      (candidate) =>
        candidate.brand === product.brand && candidate.name === product.name,
    );
    return {
      officialProductId:
        mapping?.officialProductId ??
        product.sourceProductIds?.find((id) => id.startsWith("MEDIT-")) ??
        `VERIFIED-${product.canonicalProductId}`,
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
      status: "RETAINED_PREVIOUS_VALIDATED_IMAGE_RECOVERY",
    };
  })
  .filter((product) => product.sourceImageUrl);
const mergedRecovered = [
  ...new Map(
    [...historicalRecovered, ...recovered].map((product) => [
      product.officialProductId,
      product,
    ]),
  ).values(),
].sort((left, right) => left.name.localeCompare(right.name, "en"));

const evidence = {
  sourceType: "VALIDATED_SPECIALIST_RESELLER_PRODUCT_PAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    exactModelPageRequired: true,
    modelSpecificImagePathRequired: true,
    minimumResolution: "600x600",
    duplicateImagesRejected: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: mappings.length,
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
