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
  "data/catalog-evidence/lm-dental-manufacturer-validated-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/lm-dental-manufacturer-validated-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const officialPdfUrl =
  "https://publications.lm-dental.com/LM-Dental/Brochures/LM_ProPower_brochure_en.pdf";
const officialPdfHash =
  "c4c97a0da5c3566fa18c831cb3de5f77728ccb4afeccc61958faf3ba804aca71";
const footPedalImageHash =
  "9e60ca3426fad4933dde95e25800617ee2153a6aa1f91120e01e1a6a96f79f9a";
const ap2PageUrl = "https://dentalgroup-company.ru/ap-2";
const ap2ImageUrl =
  "https://dentalgroup-company.ru/thumb/2/O66xjJ87OOIUaOoFKY8MCA/r/d/ap_2_nasadka_dlya_skalerov_lm_dlya_retrogradnoy_endodontii_almaznaya_4_re_smennyh_nasadki_dlya_derzhateley_ih1_ih2_ihs1_ihs2.jpg";
const ap2ImageHash =
  "234f66d581659f6aeced6c4d115d3010556f48f3f944cb67dff356dd5ff86cad";
const stripsPageUrl =
  "https://lm-dental.com/products/uncategorized/strips-sans-bandes-blanches/";
const stripsImageUrl =
  "https://lm-dental.com/wp-content/uploads/2022/02/strips-without-blanks-fr.jpg";
const evidenceFile = path.basename(outputPath);

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const targetIds = new Map([
  ["AP-2", "LM-DENTAL-AP-2"],
  ["Foot pedal", "LM-DENTAL-FOOT-PEDAL"],
]);
const targets = [...targetIds.keys()]
  .map((name) =>
    canonical.products.find(
      (candidate) =>
        candidate.brand === "LM Dental" &&
        clean(candidate.name) === name &&
        (name !== "AP-2" ||
          candidate.sourceEvidenceFiles?.includes(
            "lm-dental-manufacturer-catalog.json",
          )),
    ),
  )
  .filter(Boolean);
const recovered = [];
const review = [
  {
    canonicalProductId:
      "CANON-LM-DENTAL-LM-DENTAL-STRIPS-SANS-BANDES-BLANCHES",
    brand: "LM Dental",
    name: "Strips sans bandes blanches",
    sourcePageUrl: stripsPageUrl,
    sourceImageUrl: stripsImageUrl,
    reason: "OFFICIAL_IMAGE_REFERENCE_MISMATCH",
    details:
      "Page description lists LM 5512/5513/5513D while the official image labels LM 5502/5503/5503D.",
  },
];
let temporaryDirectory;

const fetchBuffer = async (url) => {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
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
  const [pdf, ap2Image] = await Promise.all([
    fetchBuffer(officialPdfUrl),
    fetchBuffer(ap2ImageUrl),
  ]);
  if (sha256(pdf) !== officialPdfHash)
    throw new Error("official LM-ProPower PDF changed; revalidation required");
  if (sha256(ap2Image) !== ap2ImageHash)
    throw new Error("validated AP-2 image changed; revalidation required");

  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "dentmarket-lm-dental-"),
  );
  const pdfPath = path.join(temporaryDirectory, "propower.pdf");
  const footPath = path.join(temporaryDirectory, "foot-pedal.png");
  await fs.writeFile(pdfPath, pdf);
  const extractionCode = `
import hashlib, sys
from io import BytesIO
from pypdf import PdfReader
from PIL import Image
pdf_path, output_path, expected_hash = sys.argv[1:]
for image in PdfReader(pdf_path).pages[6].images:
    if hashlib.sha256(image.data).hexdigest() == expected_hash:
        source = Image.open(BytesIO(image.data)).convert("RGBA")
        canvas = Image.new("RGB", (1200, 800), "white")
        scale = min(1000 / source.width, 650 / source.height)
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
raise SystemExit("validated embedded foot pedal image not found")
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
      ["-c", extractionCode, pdfPath, footPath, footPedalImageHash],
      { encoding: "utf8", maxBuffer: 2_000_000 },
    );
    if (extractionResult.status === 0) break;
  }
  if (extractionResult?.status !== 0)
    throw new Error(
      `foot pedal extraction failed: ${clean(extractionResult?.stderr)}`,
    );

  await fs.mkdir(publicDir, { recursive: true });
  for (const product of targets) {
    const isAp2 = clean(product.name) === "AP-2";
    const image = isAp2 ? ap2Image : await fs.readFile(footPath);
    if (image.length < (isAp2 ? 5_000 : 20_000))
      throw new Error(`invalid recovered image for ${product.name}`);
    const imageHash = sha256(image);
    const extension = isAp2 ? "jpg" : "png";
    const slug = isAp2 ? "ap-2-100508" : "propower-foot-pedal";
    const filename = `verified-lm-dental-${slug}-${imageHash.slice(0, 10)}.${extension}`;
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
      sourcePageUrl: isAp2 ? ap2PageUrl : officialPdfUrl,
      kzEvidence: product.kzEvidence,
      status: isAp2
        ? "SPECIALIST_EXACT_PRODUCT_IMAGE_VALIDATED"
        : "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
      photoEvidence: isAp2
        ? {
            method: "VALIDATED_SPECIALIST_EXACT_MODEL_IMAGE",
            specialistProductPageUrl: ap2PageUrl,
            specialistSourceImageUrl: ap2ImageUrl,
            matchedModel: "AP-2",
            matchedManufacturerReference: "100508",
            matchedSpecifications: ["diameter 0.5 mm", "100° angle"],
            sourceImageSha256: ap2ImageHash,
            sha256: imageHash,
            bytes: image.length,
            contentType: "image/jpeg",
          }
        : {
            method: "OFFICIAL_PDF_EMBEDDED_EXACT_PRODUCT_IMAGE",
            officialPdfUrl,
            officialPdfPage: 7,
            officialPdfSha256: officialPdfHash,
            embeddedImageSha256: footPedalImageHash,
            sha256: imageHash,
            bytes: image.length,
            contentType: "image/png",
          },
    });
  }
} catch (error) {
  review.push({
    brand: "LM Dental",
    targets: [...targetIds.keys()],
    reason: "VALIDATED_IMAGE_RECOVERY_FAILED",
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
    manufacturerRef:
      clean(candidate.name) === "AP-2" ? "" : candidate.manufacturerRef,
    manufacturerRefs:
      clean(candidate.name) === "AP-2" ? "" : candidate.manufacturerRefs,
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
    status: "RETAINED_PREVIOUS_VALIDATED_IMAGE_RECOVERY",
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
  brand: "LM Dental",
  manufacturer: "LM-Instruments Oy",
  sourceType: "OFFICIAL_AND_VALIDATED_SPECIALIST_PRODUCT_IMAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    allSourceHashesPinned: true,
    pageScreenshotsForbidden: true,
    noGeneratedProductGeometry: true,
    referenceMismatchRemainsOnModeration: true,
  },
  totals: {
    targets: targetIds.size + 1,
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
