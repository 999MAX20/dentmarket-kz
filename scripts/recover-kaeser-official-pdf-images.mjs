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
  "data/catalog-evidence/kaeser-manufacturer-official-pdf-images.json",
);
const reportPath = path.join(
  root,
  "data/reports/kaeser-manufacturer-official-pdf-images.json",
);
const publicDir = path.join(
  root,
  "apps/buyer-web/public/catalog/products",
);
const productionOrigin = "https://dentmarket-shop.vercel.app";
const officialPdfUrl =
  "https://th.kaeser.com/en/download.ashx?id=tcm%3A58-85538";
const expectedPdfHash =
  "a807f7d7daa9cbe500d25b45f207d3770be6095ff8bbadfa995bd76be609741d";
const kct42090Hash =
  "6962d63e41bb408179587527de095b376b34a3c0a8ff36736cd4a00d6864a1a1";
const kryosecTah10Hash =
  "7c2b0719dc8fea81c64269c95f87603281d27a07bd61ed21191aa7da1fa028f6";
const evidenceFile = path.basename(outputPath);

const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const clean = (value) =>
  String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim();
const targetNames = new Map([
  ["KCT blue", "KAESER-KCT-BLUE"],
  [
    "KCT blue с внешним осушителем",
    "KAESER-KCT-BLUE-EXTERNAL-DRYER",
  ],
]);
const targets = canonical.products.filter(
  (candidate) =>
    candidate.brand === "Kaeser" && targetNames.has(clean(candidate.name)),
);
const recovered = [];
const review = [];
let temporaryDirectory;

try {
  if (targets.length !== targetNames.size)
    throw new Error(
      `expected ${targetNames.size} canonical targets, found ${targets.length}`,
    );
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
    path.join(os.tmpdir(), "dentmarket-kaeser-pdf-"),
  );
  const pdfPath = path.join(temporaryDirectory, "kaeser-dental.pdf");
  const familyPath = path.join(temporaryDirectory, "kct-blue.png");
  const packagePath = path.join(
    temporaryDirectory,
    "kct-blue-external-dryer.png",
  );
  await fs.writeFile(pdfPath, pdf);
  const pythonCandidates = [
    process.env.DENTMARKET_PYTHON,
    path.join(
      os.homedir(),
      ".cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
    ),
    "python3",
  ].filter(Boolean);
  const extractionCode = `
import hashlib, sys
from io import BytesIO
from pypdf import PdfReader
from PIL import Image
pdf_path, family_path, package_path, kct_hash, dryer_hash = sys.argv[1:]
reader = PdfReader(pdf_path)
found = {}
for page_number in (2, 4):
    for image in reader.pages[page_number].images:
        digest = hashlib.sha256(image.data).hexdigest()
        if digest in (kct_hash, dryer_hash):
            found[digest] = Image.open(BytesIO(image.data)).convert("RGBA")
if set(found) != {kct_hash, dryer_hash}:
    raise SystemExit("validated embedded product image set is incomplete")

def fit(image, max_width, max_height):
    scale = min(max_width / image.width, max_height / image.height)
    return image.resize(
        (max(1, round(image.width * scale)), max(1, round(image.height * scale))),
        Image.Resampling.LANCZOS,
    )

kct = found[kct_hash]
dryer = found[dryer_hash]
family_canvas = Image.new("RGB", (1200, 800), "white")
family = fit(kct, 980, 680)
family_canvas.paste(
    family,
    ((1200 - family.width) // 2, (800 - family.height) // 2),
    family,
)
family_canvas.save(family_path, "PNG")

package_canvas = Image.new("RGB", (1200, 800), "white")
kct_pair = fit(kct, 600, 570)
dryer_pair = fit(dryer, 460, 570)
gap = 70
pair_width = kct_pair.width + gap + dryer_pair.width
x = (1200 - pair_width) // 2
package_canvas.paste(kct_pair, (x, (800 - kct_pair.height) // 2), kct_pair)
x += kct_pair.width + gap
package_canvas.paste(dryer_pair, (x, (800 - dryer_pair.height) // 2), dryer_pair)
package_canvas.save(package_path, "PNG")
`;
  let extractionResult;
  for (const python of pythonCandidates) {
    extractionResult = spawnSync(
      python,
      [
        "-c",
        extractionCode,
        pdfPath,
        familyPath,
        packagePath,
        kct42090Hash,
        kryosecTah10Hash,
      ],
      { encoding: "utf8", maxBuffer: 2_000_000 },
    );
    if (extractionResult.status === 0) break;
  }
  if (extractionResult?.status !== 0)
    throw new Error(
      `embedded image extraction failed: ${clean(extractionResult?.stderr)}`,
    );

  await fs.mkdir(publicDir, { recursive: true });
  for (const product of targets) {
    const isPackage =
      clean(product.name) === "KCT blue с внешним осушителем";
    const image = await fs.readFile(isPackage ? packagePath : familyPath);
    if (
      image.length < 20_000 ||
      !image.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ) ||
      image.readUInt32BE(16) !== 1200 ||
      image.readUInt32BE(20) !== 800
    )
      throw new Error(`invalid recovered image for ${product.name}`);
    const imageHash = sha256(image);
    const slug = isPackage ? "kct-blue-external-dryer" : "kct-blue";
    const filename = `official-kaeser-${slug}-${imageHash.slice(0, 10)}.png`;
    await fs.writeFile(path.join(publicDir, filename), image);
    const imageUrl = `${productionOrigin}/catalog/products/${filename}`;
    recovered.push({
      officialProductId: targetNames.get(clean(product.name)),
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
      sourcePageUrl: officialPdfUrl,
      kzEvidence: product.kzEvidence,
      status: "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
      photoEvidence: {
        method: isPackage
          ? "OFFICIAL_PDF_EMBEDDED_EXACT_PRODUCT_COMPOSITION"
          : "OFFICIAL_PDF_EMBEDDED_EXACT_FAMILY_MODEL",
        officialPdfUrl,
        officialPdfPages: isPackage ? "4–5 and 8–9" : "4–5",
        officialPdfSha256: expectedPdfHash,
        embeddedSourceImageHashes: isPackage
          ? [kct42090Hash, kryosecTah10Hash]
          : [kct42090Hash],
        composition: isPackage
          ? "Unaltered KCT blue 420-90 T and KRYOSEC TAH 10 product photos on a white 1200x800 canvas"
          : "Unaltered KCT blue 420-90 T product photo on a white 1200x800 canvas",
        sha256: imageHash,
        bytes: image.length,
        contentType: "image/png",
      },
    });
  }
} catch (error) {
  review.push({
    brand: "Kaeser",
    targets: [...targetNames.keys()],
    officialPdfUrl,
    reason: "OFFICIAL_PDF_IMAGE_RECOVERY_FAILED",
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
    officialProductId: targetNames.get(clean(candidate.name)),
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
  brand: "Kaeser",
  manufacturer: "KAESER KOMPRESSOREN SE",
  sourceType: "OFFICIAL_MANUFACTURER_PDF_EMBEDDED_PRODUCT_IMAGES",
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: {
    officialPdfHashPinned: true,
    embeddedProductImagesHashPinned: true,
    pageScreenshotsForbidden: true,
    noGeneratedProductGeometry: true,
    unmatchedProductsRemainOnModeration: true,
  },
  totals: {
    targets: targetNames.size,
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
