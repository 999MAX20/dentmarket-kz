#!/usr/bin/env python3

import hashlib
import json
import subprocess
import tempfile
from datetime import date
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_PATH = ROOT / "data/reports/canonical-manufacturer-intake.json"
PUBLIC_DIR = ROOT / "apps/buyer-web/public/catalog/products"
EVIDENCE_PATH = ROOT / "data/catalog-evidence/ray-alpha-official-pdf-crops.json"
REPORT_PATH = ROOT / "data/reports/ray-alpha-official-pdf-crops.json"
PRODUCTION_ORIGIN = "https://dentmarket-shop.vercel.app"

TARGETS = [
    {
        "canonicalProductId": "CANON-RAY-RAY-RAYSCAN-ALPHA-P",
        "pdfPath": ROOT / "tmp/pdfs/ray-alpha-p-official-flyer.pdf",
        "resourcePageUrl": (
            "https://connect.raymedical.com/en/resources/"
            "bd301d00-338a-4f52-9a5f-e27e1da98db9"
        ),
        "page": 1,
        "crop": (0.055, 0.20, 0.90, 0.91),
        # Normalized within the crop. These rectangles cover brochure copy and
        # award marks only; they do not overlap product geometry.
        "backgroundMasks": [
            (0.00, 0.55, 0.37, 1.00),
            (0.85, 0.55, 1.00, 1.00),
        ],
        "backgroundColor": (45, 49, 61),
        "note": (
            "Official RAYSCAN Alpha p(i) flyer cover. Product geometry is "
            "retained in full; only surrounding brochure copy is masked."
        ),
    },
    {
        "canonicalProductId": "CANON-RAY-RAY-RAYSCAN-ALPHA-PLUS",
        "pdfPath": ROOT / "tmp/pdfs/ray-alpha-plus-official-brochure.pdf",
        "resourcePageUrl": (
            "https://connect.raymedical.com/en/resources/"
            "3b95718d-cdae-472f-9bd4-bfd3e24cad61"
        ),
        "page": 1,
        "crop": (0.43, 0.10, 0.97, 0.79),
        "backgroundMasks": [(0.88, 0.00, 1.00, 0.06)],
        "backgroundColor": (45, 49, 61),
        "note": (
            "Official RAYSCAN Alpha Plus APAC brochure cover crop containing "
            "the complete scanner without adjacent title copy."
        ),
    },
    {
        "canonicalProductId": "CANON-RAY-RAY-RAYZIR-FS",
        "pdfPath": ROOT / "tmp/pdfs/rayzir-fs-official-brochure.pdf",
        "resourcePageUrl": (
            "https://connect.raymedical.com/en/resources/"
            "b39dfe2d-7997-4823-a331-8727d744ad35"
        ),
        "page": 1,
        "crop": (0.27, 0.17, 0.82, 0.68),
        "backgroundMasks": [],
        "backgroundColor": (48, 65, 82),
        "note": (
            "Official RAYZir FS brochure cover crop showing the two exact "
            "RAYZir FS milling blocks without printer marks or title copy."
        ),
    },
]


def sha256(payload):
    return hashlib.sha256(payload).hexdigest()


def render_page(pdf_path, page_number, output_prefix):
    subprocess.run(
        [
            "pdftoppm",
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-r",
            "300",
            "-png",
            "-singlefile",
            str(pdf_path),
            str(output_prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    image = Image.open(f"{output_prefix}.png").convert("RGB")
    image.load()
    return image


def crop_and_prepare(page_image, target):
    width, height = page_image.size
    left, top, right, bottom = target["crop"]
    crop = page_image.crop(
        (
            round(left * width),
            round(top * height),
            round(right * width),
            round(bottom * height),
        )
    )
    for mask in target["backgroundMasks"]:
        mask_left, mask_top, mask_right, mask_bottom = mask
        crop.paste(
            target["backgroundColor"],
            (
                round(mask_left * crop.width),
                round(mask_top * crop.height),
                round(mask_right * crop.width),
                round(mask_bottom * crop.height),
            ),
        )
    scale = min(1080 / crop.width, 1080 / crop.height)
    prepared = crop.resize(
        (
            max(1, round(crop.width * scale)),
            max(1, round(crop.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGB", (1200, 1200), "white")
    canvas.paste(
        prepared,
        ((1200 - prepared.width) // 2, (1200 - prepared.height) // 2),
    )
    crop.close()
    prepared.close()
    return canvas


canonical = json.loads(CANONICAL_PATH.read_text(encoding="utf-8"))
canonical_by_id = {
    product["canonicalProductId"]: product for product in canonical["products"]
}
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

products = []
review = []

with tempfile.TemporaryDirectory(prefix="ray-alpha-crops-") as temporary_dir:
    temporary = Path(temporary_dir)
    for target in TARGETS:
        canonical_product = canonical_by_id.get(target["canonicalProductId"])
        if not canonical_product:
            review.append({**target, "reason": "CANONICAL_PRODUCT_NOT_FOUND"})
            continue
        if not target["pdfPath"].exists():
            review.append({**target, "reason": "OFFICIAL_PDF_NOT_DOWNLOADED"})
            continue

        page_image = render_page(
            target["pdfPath"],
            target["page"],
            temporary / target["canonicalProductId"].lower(),
        )
        product_image = crop_and_prepare(page_image, target)
        output = BytesIO()
        product_image.save(output, format="PNG", optimize=True)
        payload = output.getvalue()
        output_hash = sha256(payload)
        filename = (
            f"official-ray-{canonical_product['name'].lower().replace(' ', '-')}"
            f"-brochure-{output_hash[:10]}.png"
        )
        (PUBLIC_DIR / filename).write_bytes(payload)
        local_url = f"{PRODUCTION_ORIGIN}/catalog/products/{filename}"
        source_product_ids = canonical_product.get("sourceProductIds") or []
        pdf_hash = sha256(target["pdfPath"].read_bytes())

        products.append(
            {
                "officialProductId": (
                    source_product_ids[0]
                    if source_product_ids
                    else target["canonicalProductId"].replace("CANON-", "")
                ),
                "brand": canonical_product.get("brand"),
                "manufacturer": canonical_product.get("manufacturer"),
                "name": canonical_product.get("name"),
                "manufacturerRef": canonical_product.get("manufacturerRef"),
                "manufacturerRefs": canonical_product.get("manufacturerRefs"),
                "model": canonical_product.get("model"),
                "variantCount": canonical_product.get("variantCount"),
                "variants": canonical_product.get("variants"),
                "categoryPath": canonical_product.get("categoryPath"),
                "description": canonical_product.get("description"),
                "sourceImageUrl": local_url,
                "imageUrls": local_url,
                "imageCount": 1,
                "sourcePageUrl": target["resourcePageUrl"],
                "sourcePdfPages": str(target["page"]),
                "kzEvidence": canonical_product.get("kzEvidence"),
                "status": "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
                "photoEvidence": {
                    "method": "OFFICIAL_RAYCONNECT_PDF_VISUALLY_VERIFIED_CROP",
                    "officialResourcePageUrl": target["resourcePageUrl"],
                    "officialPdfSha256": pdf_hash,
                    "pdfPage": target["page"],
                    "normalizedCropBox": list(target["crop"]),
                    "backgroundOnlyMaskBoxes": [
                        list(box) for box in target["backgroundMasks"]
                    ],
                    "visualMatchNote": target["note"],
                    "outputImageSha256": output_hash,
                    "bytes": len(payload),
                    "contentType": "image/png",
                    "noGeneratedGeometry": True,
                },
            }
        )
        product_image.close()
        page_image.close()

evidence = {
    "brand": "RAY",
    "manufacturer": "RAY Co., Ltd.",
    "sourceType": "OFFICIAL_RAYCONNECT_PDF_VISUALLY_VERIFIED_PRODUCT_CROPS",
    "lastChecked": date.today().isoformat(),
    "policy": {
        "officialPdfOnly": True,
        "exactProductHeadingRequired": True,
        "visualVerificationRequired": True,
        "backgroundCopyMayBeMasked": True,
        "productGeometryMustNotBeAltered": True,
        "pdfAndOutputHashesPinned": True,
        "noGeneratedProductGeometry": True,
        "unmatchedProductsRemainOnModeration": True,
    },
    "totals": {
        "targets": len(TARGETS),
        "recovered": len(products),
        "reviewRequired": len(review),
    },
    "products": products,
}
report = {**evidence, "review": review}
EVIDENCE_PATH.write_text(
    json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
REPORT_PATH.write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(evidence["totals"], ensure_ascii=False, indent=2))
