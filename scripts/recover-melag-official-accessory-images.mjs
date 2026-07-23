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
  "data/catalog-evidence/melag-manufacturer-official-accessory-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/melag-manufacturer-official-accessory-images.json",
);
const publicDir = path.join(root, "apps/buyer-web/public/catalog/products");
const productionOrigin = "https://dentmarket-shop.vercel.app";
const evidenceFile = path.basename(outputPath);
const targets = [
  {
    name: "Mount Universal (long)",
    officialProductId: "ME22922",
    slug: "mount-universal-long-me22922",
    pageUrl: "https://www.melag.com/en/mount-universal-long/me22922",
    imageUrl:
      "https://shopware.melag.com/media/6d/f6/31/1714649256/universalhalterung-beladung-8.jpg?ts=1714649256",
    hash: "a76c7c074ee52c797bb82c916df809d22078013f99913ad6fbd666165c27235a",
    extension: "jpg",
  },
  {
    name: "Mount Universal (short)",
    officialProductId: "ME22921",
    slug: "mount-universal-short-me22921",
    pageUrl: "https://www.melag.com/en/mount-universal-short/me22921",
    imageUrl:
      "https://shopware.melag.com/media/50/0e/c7/1714649256/universalhalterung-beladung-leer.jpg?ts=1714649256",
    hash: "b280c71703f1e304bdd6f92e6cd134231b0b2496c79f122bb258f885727a5aef",
    extension: "jpg",
  },
  {
    name: "Working table Comfort",
    officialProductId: "ME00118",
    slug: "working-table-comfort-me00118",
    pageUrl: "https://configurator.melag.com/en/our-products?page=25",
    imageUrl:
      "https://configurator.melag.com/sites/default/files/import/ME00118.png",
    hash: "803140900b0ef0a8fecfb6fabad4e1b3e30eba371ff3839e399600693082caca",
    extension: "png",
  },
  {
    name: "Working table Standard",
    officialProductId: "ME00119",
    slug: "working-table-standard-me00119",
    pageUrl: "https://configurator.melag.com/en/our-products?page=25",
    imageUrl:
      "https://configurator.melag.com/sites/default/files/import/ME00119.png",
    hash: "aebf9e5f77b8a77bbd773a4fa3d4644d9a794d0028e34ffad04be6f4a7a92844",
    extension: "png",
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
  const product = canonical.products.find(
    (candidate) =>
      candidate.brand === "MELAG" &&
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
      !page.includes(imagePath) &&
      !page.includes(path.basename(imagePath))
    )
      throw new Error("official page no longer references image");
    if (sha256(image) !== target.hash)
      throw new Error("official image changed; revalidation required");
    if (!validPayload(image, target.extension))
      throw new Error("official image payload is invalid");
    const filename =
      `official-melag-${target.slug}-${target.hash.slice(0, 10)}.` +
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
  brand: "MELAG",
  manufacturer: "MELAG Medizintechnik GmbH & Co. KG",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_PAGE_IMAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    pageReferenceRequired: true,
    allImageHashesPinned: true,
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
