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
  "data/catalog-evidence/ivoclar-manufacturer-official-equipment-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/ivoclar-manufacturer-official-equipment-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const evidenceFile = path.basename(outputPath);
const targets = [
  {
    name: "Вакуумный насос VP5",
    officialProductId: "IVOCLAR-VACUUM-PUMP-VP5",
    slug: "vacuum-pump-vp5",
    pageUrl:
      "https://www.ivoclar.com/en_li/products/equipment/vacuum-pump-vp5",
    imageUrl:
      "https://www.ivoclar.com/cache-buster-2/GLOBAL%20-%20MEDIA/Products/Equipment/Vacuum%20Pumps/Vacuum%20Pump%20VP5/15741/image-thumb__15741__cms_teaser_1/vp5~-~media--7e50ec73--query@2x.7d5a1a67.jpg",
    hash: "31259cb268808e5d56bbce8d9c9da8c72fa64c7838d738b6970100920666673d",
  },
  {
    name: "Stratos 100",
    officialProductId: "IVOCLAR-STRATOS-100",
    slug: "stratos-100",
    pageUrl: "https://www.ivoclar.com/en_li/products/equipment/stratos-100",
    imageUrl:
      "https://www.ivoclar.com/cache-buster-2/GLOBAL%20-%20MEDIA/Products/Equipment/Stratos/12117/image-thumb__12117__cms_teaser_1/stratos_100_product~-~media--7e50ec73--query@2x.387a5d16.jpg",
    hash: "af6a5cef3ebf1bdfe84542f874bb60b4f3b4e2e23d0292eb5be9ac66fb2aaf18",
  },
  {
    name: "Stratos 200",
    officialProductId: "IVOCLAR-STRATOS-200",
    slug: "stratos-200",
    pageUrl: "https://www.ivoclar.com/en_li/products/equipment/stratos-200",
    imageUrl:
      "https://www.ivoclar.com/cache-buster-3/GLOBAL%20-%20MEDIA/Products/Equipment/Stratos/12109/image-thumb__12109__cms_teaser_1/stratos_200_product~-~media--7e50ec73--query@2x.af735a8b.jpg",
    hash: "b44238f804521a5b4f1f1aa2a57909eacdd18236008b07f6454030ca8f59ec24",
  },
  {
    name: "Stratos 300",
    officialProductId: "IVOCLAR-STRATOS-300",
    slug: "stratos-300",
    pageUrl: "https://www.ivoclar.com/en_li/products/equipment/stratos-300",
    imageUrl:
      "https://www.ivoclar.com/cache-buster-3/GLOBAL%20-%20MEDIA/Products/Equipment/Stratos/15823/image-thumb__15823__cms_teaser_1/stratos-300_product~-~media--7e50ec73--query@2x.24c6b8da.jpg",
    hash: "8106848a8380755ef756d7b9c7b24f95c672aa3aa2ad993e402b76295fa06525",
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
const recovered = [];
const review = [];
await fs.mkdir(publicDir, { recursive: true });

for (const target of targets) {
  const product = canonical.products.find(
    (candidate) =>
      candidate.brand === "Ivoclar" &&
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
    const relativeImagePath = new URL(target.imageUrl).pathname;
    if (
      !page.includes(relativeImagePath) &&
      !page.includes(relativeImagePath.replaceAll("%20", " "))
    )
      throw new Error("official product page no longer references image");
    if (sha256(image) !== target.hash)
      throw new Error("official image changed; revalidation required");
    if (
      image.length < 20_000 ||
      image[0] !== 0xff ||
      image[1] !== 0xd8
    )
      throw new Error("official image payload is invalid");
    const filename = `official-ivoclar-${target.slug}-${target.hash.slice(0, 10)}.jpg`;
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
        method: "OFFICIAL_PRODUCT_PAGE_EXACT_RESPONSIVE_IMAGE",
        officialProductPageUrl: target.pageUrl,
        officialSourceImageUrl: target.imageUrl,
        sourceImageSha256: target.hash,
        sha256: target.hash,
        bytes: image.length,
        contentType: "image/jpeg",
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
  .filter((candidate) =>
    candidate.sourceEvidenceFiles?.includes(evidenceFile),
  )
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
      sourceImageUrl:
        candidate.evidenceImageUrl || candidate.sourceImageUrl,
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
  brand: "Ivoclar",
  manufacturer: "Ivoclar Vivadent AG",
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
