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
  "data/catalog-evidence/olident-manufacturer-official-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/olident-manufacturer-official-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const mtaPdfUrl =
  "https://sklep.olident.com/wp-content/uploads/2022/12/2017_Olident_ulotka_OliMTA_PL.pdf";
const mtaPdfHash =
  "c36a1f050ffe10ce8a655784a38356a8feea029a38c19b4a240bf34b309db490";
const mtaEmbeddedHash =
  "453e7c12b232f2f320719dd8a6be13cc612c723b2636c5f5d3770d2a469c5afc";
const powerPageUrl =
  "https://sklep.olident.com/sklep/olipower-bleaching/";
const powerImageUrl =
  "https://sklep.olident.com/wp-content/uploads/2023/05/OliPower_grupowe_shadow_alfa0000-768x432.png";
const powerImageHash =
  "e2c303cb681941cedbca0b95aa4b50396ba47d82bdf934a60124ca7b0f6a89ae";
const evidenceFile = path.basename(outputPath);

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const targetIds = new Map([
  ["OliMTA Universal", "OLIDENT-OLIMTA-UNIVERSAL-2"],
  ["OliPower Bleaching", "OLIDENT-OLIPOWER-BLEACHING"],
]);
const targets = canonical.products.filter(
  (candidate) =>
    candidate.brand === "Olident" && targetIds.has(clean(candidate.name)),
);
const recovered = [];
const review = [];
let temporaryDirectory;

const fetchBuffer = async (url) => {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
    headers: { "user-agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0" },
  });
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

try {
  if (targets.length !== targetIds.size)
    throw new Error(
      `expected ${targetIds.size} canonical targets, found ${targets.length}`,
    );
  const [pdf, powerImage] = await Promise.all([
    fetchBuffer(mtaPdfUrl),
    fetchBuffer(powerImageUrl),
  ]);
  if (sha256(pdf) !== mtaPdfHash)
    throw new Error("official OliMTA PDF changed; revalidation required");
  if (sha256(powerImage) !== powerImageHash)
    throw new Error("official OliPower image changed; revalidation required");

  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dentmarket-olident-"),
  );
  const pdfPath = path.join(temporaryDirectory, "olimta.pdf");
  const mtaPath = path.join(temporaryDirectory, "olimta.png");
  await fs.writeFile(pdfPath, pdf);
  const extractionCode = `
import hashlib, sys
from io import BytesIO
from pypdf import PdfReader
from PIL import Image
pdf_path, output_path, expected_hash = sys.argv[1:]
for image in PdfReader(pdf_path).pages[3].images:
    if hashlib.sha256(image.data).hexdigest() == expected_hash:
        source = Image.open(BytesIO(image.data)).convert("RGBA")
        canvas = Image.new("RGB", (1200, 800), "white")
        scale = min(1040 / source.width, 660 / source.height)
        product = source.resize(
            (round(source.width * scale), round(source.height * scale)),
            Image.Resampling.LANCZOS,
        )
        canvas.paste(
            product,
            ((1200 - product.width) // 2, (800 - product.height) // 2),
            product,
        )
        canvas.save(output_path, "PNG")
        raise SystemExit(0)
raise SystemExit("validated OliMTA embedded product image not found")
`;
  const pythonCandidates = [
    process.env.DENTMARKET_PYTHON,
    path.join(
      os.homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
    ),
    "python3",
  ].filter(Boolean);
  let extractionResult;
  for (const python of pythonCandidates) {
    extractionResult = spawnSync(
      python,
      ["-c", extractionCode, pdfPath, mtaPath, mtaEmbeddedHash],
      { encoding: "utf8", maxBuffer: 2_000_000 },
    );
    if (extractionResult.status === 0) break;
  }
  if (extractionResult?.status !== 0)
    throw new Error(
      `OliMTA extraction failed: ${clean(extractionResult?.stderr)}`,
    );

  await fs.mkdir(publicDir, { recursive: true });
  for (const product of targets) {
    const isMta = clean(product.name) === "OliMTA Universal";
    const image = isMta ? await fs.readFile(mtaPath) : powerImage;
    if (image.length < 20_000)
      throw new Error(`invalid recovered image for ${product.name}`);
    const imageHash = sha256(image);
    const extension = isMta ? "png" : "png";
    const slug = isMta ? "olimta-universal" : "olipower-bleaching";
    const filename = `official-olident-${slug}-${imageHash.slice(0, 10)}.${extension}`;
    await fs.writeFile(path.join(publicDir, filename), image);
    const localImageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId: targetIds.get(clean(product.name)),
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
      sourcePageUrl: isMta ? mtaPdfUrl : powerPageUrl,
      kzEvidence: product.kzEvidence,
      status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
      photoEvidence: isMta
        ? {
            method: "OFFICIAL_PDF_EMBEDDED_EXACT_PRODUCT_IMAGE",
            officialPdfUrl: mtaPdfUrl,
            officialPdfPage: 4,
            officialPdfSha256: mtaPdfHash,
            embeddedImageSha256: mtaEmbeddedHash,
            sha256: imageHash,
            bytes: image.length,
            contentType: "image/png",
          }
        : {
            method: "OFFICIAL_MANUFACTURER_STORE_EXACT_PRODUCT_IMAGE",
            officialProductPageUrl: powerPageUrl,
            officialSourceImageUrl: powerImageUrl,
            sourceImageSha256: powerImageHash,
            sha256: imageHash,
            bytes: image.length,
            contentType: "image/png",
          },
    });
  }
} catch (error) {
  review.push({
    brand: "Olident",
    targets: [...targetIds.keys()],
    reason: "OFFICIAL_IMAGE_RECOVERY_FAILED",
    error: String(error?.message ?? error),
  });
} finally {
  if (temporaryDirectory)
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
}

const historicalRecovered = canonical.products
  .filter((candidate) =>
    candidate.sourceEvidenceFiles?.includes(evidenceFile),
  )
  .map((candidate) => ({
    officialProductId: targetIds.get(clean(candidate.name)),
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
  brand: "Olident",
  manufacturer: "Oldent Sp. z o.o.",
  sourceType: "OFFICIAL_MANUFACTURER_PRODUCT_IMAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialSourceHashesPinned: true,
    pageScreenshotsForbidden: true,
    noGeneratedProductGeometry: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: targetIds.size,
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
