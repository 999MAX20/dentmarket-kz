import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
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
  "data/catalog-evidence/wh-piezo-official-pdf-image.json",
);
const reportPath = path.join(
  root,
  "data/reports/wh-piezo-official-pdf-image.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const sourcePageUrl =
  "https://www.wh.com/en_global/dental-products/prophylaxis-periodontology/accessories/piezo-scaler-tips";
const officialPdfUrl =
  "https://backend.wh.com/api/v1/document/download?documentId=2920456-AEN03&fileName=Prospekt_20456-AEN_03.pdf&tenant=DENT";
const expectedPdfHash =
  "7a474b66da1eda44bc7e7b7d6c84e6a87459d87550c6db9cd35f53834944f3f5";
const expectedImageHashes = [
  "f999b9a816344b4910160d05151f790ba6e437a6579ebaf9cac33f4137c70d0e",
  "69d68d2fda9ae3d55236bb1c96e00a381a142d5690673331dfad08f7336905c2",
  "b86bc6b081ac53fd0580a05cd65b8d5883d50ccef72886b422ec0fe74d5c5e14",
  "404547734b758bb09c4f0ece937b862715a4af200c512d7264cc5bd9ce0690e5",
  "2c4dde50598a3dfc2901324ae6419616e1ecdfd33e7c36f3342a41169ef0dcd8",
  "a6458be7679883145717606fa51e35ff55f60b79960de9ad043d49d02df124e6",
  "c73c1ad458626f01d156f2ace1e147907d5ebae1a5f6c22f666da866a7628f96",
  "bf5e9a5614f72c8994bdab9d57e7efcd114b3bca33f1b5c08105c566d999aabb",
  "863e79dff35651709951543c27e58b7d40bc33570b12da583c52d32f26d4fa9c",
];
const evidenceFile = path.basename(outputPath);
const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const product =
  canonical.products.find(
    (candidate) =>
      candidate.brand === "W&H" && clean(candidate.name) === "Piezo Scaler Tips",
  ) ??
  canonical.products.find((candidate) =>
    candidate.sourceEvidenceFiles?.includes(evidenceFile),
  );
const recovered = [];
const review = [];
let temporaryDirectory;

if (!product) {
  review.push({
    brand: "W&H",
    name: "Piezo Scaler Tips",
    reason: "CANONICAL_PRODUCT_NOT_FOUND",
  });
} else {
  try {
    const response = await fetch(officialPdfUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
      headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
    });
    if (!response.ok) throw new Error(`official PDF HTTP ${response.status}`);
    const pdf = Buffer.from(await response.arrayBuffer());
    if (sha256(pdf) !== expectedPdfHash)
      throw new Error("official PDF changed; manual revalidation required");

    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "dentmarket-wh-piezo-"),
    );
    const pdfPath = path.join(temporaryDirectory, "piezo.pdf");
    const imagePath = path.join(temporaryDirectory, "piezo-family.png");
    await fs.writeFile(pdfPath, pdf);
    const pythonCandidates = [
      process.env.DENTMARKET_PYTHON,
      path.join(
        os.homedir(),
        ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
      ),
      "python3",
    ].filter(Boolean);
    const compositionCode = `
import hashlib, sys
from io import BytesIO
from pypdf import PdfReader
from PIL import Image
pdf_path, output_path, hashes = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
found = {}
for image in PdfReader(pdf_path).pages[1].images:
    digest = hashlib.sha256(image.data).hexdigest()
    if digest in hashes:
        found[digest] = Image.open(BytesIO(image.data)).convert("RGBA")
if set(found) != set(hashes):
    raise SystemExit("validated embedded tip set is incomplete")
images = [found[digest] for digest in hashes]
canvas = Image.new("RGB", (1200, 800), "white")
for start, end, y in ((0, 5, 90), (5, 9, 430)):
    row = images[start:end]
    gap = 55
    ratios = [image.width / image.height for image in row]
    height = min(270, int((1000 - gap * (len(row) - 1)) / sum(ratios)))
    resized = [
        image.resize(
            (max(1, round(image.width * height / image.height)), height),
            Image.Resampling.LANCZOS,
        )
        for image in row
    ]
    width = sum(image.width for image in resized) + gap * (len(resized) - 1)
    x = (1200 - width) // 2
    for image in resized:
        canvas.paste(image, (x, y), image)
        x += image.width + gap
canvas.save(output_path, "PNG")
`;
    let compositionResult;
    for (const python of pythonCandidates) {
      compositionResult = spawnSync(
        python,
        [
          "-c",
          compositionCode,
          pdfPath,
          imagePath,
          expectedImageHashes.join(","),
        ],
        { encoding: "utf8", maxBuffer: 2_000_000 },
      );
      if (compositionResult.status === 0) break;
    }
    if (compositionResult?.status !== 0)
      throw new Error(
        `embedded tip composition failed: ${clean(compositionResult?.stderr)}`,
      );
    const image = await fs.readFile(imagePath);
    if (
      image.length < 20_000 ||
      !image.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ) ||
      image.readUInt32BE(16) !== 1200 ||
      image.readUInt32BE(20) !== 800
    )
      throw new Error("composed exact tip family image is invalid");
    const imageHash = sha256(image);
    const filename = `official-wh-piezo-scaler-tips-${imageHash.slice(0, 10)}.png`;
    await fs.mkdir(publicDir, { recursive: true });
    await fs.writeFile(path.join(publicDir, filename), image);
    const imageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId: "WH-PIEZO-SCALER-TIPS",
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
      sourcePageUrl,
      kzEvidence: product.kzEvidence,
      status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
      photoEvidence: {
        method: "OFFICIAL_PDF_EMBEDDED_TIP_FAMILY_COMPOSITION",
        officialPdfUrl,
        officialPdfPages: "2–3",
        officialPdfSha256: expectedPdfHash,
        embeddedSourceImageHashes: expectedImageHashes,
        composition: "Nine unaltered official tip photos on a white 1200x800 canvas",
        sha256: imageHash,
        bytes: image.length,
        contentType: "image/png",
      },
    });
  } catch (error) {
    review.push({
      canonicalProductId: product.canonicalProductId,
      brand: product.brand,
      name: product.name,
      sourcePageUrl,
      officialPdfUrl,
      reason: "OFFICIAL_PDF_TIP_IMAGE_RECOVERY_FAILED",
      error: String(error?.message ?? error),
    });
  } finally {
    if (temporaryDirectory)
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

const historicalRecovered = canonical.products
  .filter((candidate) =>
    candidate.sourceEvidenceFiles?.includes(evidenceFile),
  )
  .map((candidate) => ({
    officialProductId: "WH-PIEZO-SCALER-TIPS",
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
  }))
  .filter((candidate) => candidate.sourceImageUrl);
const products = [
  ...new Map(
    [...historicalRecovered, ...recovered].map((candidate) => [
      candidate.officialProductId,
      candidate,
    ]),
  ).values(),
];
const evidence = {
  brand: "W&H",
  manufacturer: product?.manufacturer ?? "W&H Dentalwerk",
  sourceType: "OFFICIAL_MANUFACTURER_PDF_EMBEDDED_PRODUCT_IMAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialPdfHashPinned: true,
    allEmbeddedTipImagesHashPinned: true,
    pageScreenshotsForbidden: true,
    noGeneratedProductGeometry: true,
  },
  totals: {
    targets: 1,
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
