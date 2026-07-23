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
  "data/catalog-evidence/dio-official-pdf-product-image.json",
);
const reportPath = path.join(
  root,
  "data/reports/dio-official-pdf-product-image.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const sourcePageUrl =
  "https://denti.kz/orders/blank_zakaza/laboratornoe-oborudovanie/raskhoduemyy-material_1/dionavi-c-b-z-fotopolimernyy-material/";
const officialPdfUrl = "https://diodigital.co.jp/_userdata/proboz.pdf";
const expectedPdfSha256 =
  "300d2919e6419aabcbe0168e3c49bd86f7eca4db2d7743c337b6fed2fb7be83d";
const expectedEmbeddedImageSha256 =
  "0c00e6166fb99f91a8fb0210d4e0c27f6ef407366a7e89f30b33ec364d4e48a0";
const evidenceFile = path.basename(outputPath);

const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const product =
  canonical.products.find(
    (candidate) =>
      candidate.brand === "DIO" &&
      clean(candidate.name) === "DIOnavi-C&B Z фотополимерный материал",
  ) ??
  canonical.products.find((candidate) =>
    candidate.sourceEvidenceFiles?.includes(evidenceFile),
  );
const review = [];
const recovered = [];
let temporaryDirectory;

if (!product) {
  review.push({
    brand: "DIO",
    name: "DIOnavi-C&B Z фотополимерный материал",
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
    if (sha256(pdf) !== expectedPdfSha256)
      throw new Error("official PDF changed; manual image revalidation required");

    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "dentmarket-dio-pdf-"),
    );
    const pdfPath = path.join(temporaryDirectory, "proboz.pdf");
    const embeddedPath = path.join(temporaryDirectory, "product.jp2");
    const pngPath = path.join(temporaryDirectory, "product.png");
    await fs.writeFile(pdfPath, pdf);

    const bundledPython = path.join(
      os.homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
    );
    const pythonCandidates = [
      process.env.DENTMARKET_PYTHON,
      bundledPython,
      "python3",
    ].filter(Boolean);
    const extractionCode = `
import hashlib
import sys
from pypdf import PdfReader
pdf_path, output_path, expected_hash = sys.argv[1:4]
for image in PdfReader(pdf_path).pages[13].images:
    if hashlib.sha256(image.data).hexdigest() == expected_hash:
        open(output_path, "wb").write(image.data)
        raise SystemExit(0)
raise SystemExit("validated embedded product image not found")
`;
    let extractionResult;
    for (const python of pythonCandidates) {
      extractionResult = spawnSync(
        python,
        [
          "-c",
          extractionCode,
          pdfPath,
          embeddedPath,
          expectedEmbeddedImageSha256,
        ],
        { encoding: "utf8", maxBuffer: 2_000_000 },
      );
      if (extractionResult.status === 0) break;
    }
    if (extractionResult?.status !== 0)
      throw new Error(
        `embedded image extraction failed: ${clean(extractionResult?.stderr)}`,
      );
    const embedded = await fs.readFile(embeddedPath);
    if (sha256(embedded) !== expectedEmbeddedImageSha256)
      throw new Error("embedded image hash mismatch");

    const conversion = spawnSync(
      "sips",
      ["-s", "format", "png", embeddedPath, "--out", pngPath],
      { encoding: "utf8", maxBuffer: 2_000_000 },
    );
    if (conversion.status !== 0)
      throw new Error(`JP2 conversion failed: ${clean(conversion.stderr)}`);
    const image = await fs.readFile(pngPath);
    if (
      image.length < 20_000 ||
      !image.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    )
      throw new Error("converted product image is invalid");

    const imageHash = sha256(image);
    const filename = `official-dio-dionavi-cb-z-${imageHash.slice(0, 10)}.png`;
    await fs.mkdir(publicDir, { recursive: true });
    await fs.writeFile(path.join(publicDir, filename), image);
    const imageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId: "DENTI-KZ-DIO-10089",
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
        method: "OFFICIAL_PDF_EMBEDDED_PRODUCT_IMAGE",
        officialPdfUrl,
        officialPdfPage: 14,
        officialPdfSha256: expectedPdfSha256,
        embeddedImageSha256: expectedEmbeddedImageSha256,
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
      reason: "OFFICIAL_PDF_IMAGE_RECOVERY_FAILED",
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
    officialProductId: "DENTI-KZ-DIO-10089",
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
const mergedRecovered = [
  ...new Map(
    [...historicalRecovered, ...recovered].map((candidate) => [
      candidate.officialProductId,
      candidate,
    ]),
  ).values(),
];
const evidence = {
  brand: "DIO",
  manufacturer: product?.manufacturer ?? "DIO Corporation",
  sourceType: "OFFICIAL_MANUFACTURER_PDF_EMBEDDED_PRODUCT_IMAGE",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialPdfHashPinned: true,
    embeddedImageHashPinned: true,
    pageScreenshotsForbidden: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: 1,
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
