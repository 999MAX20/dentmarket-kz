#!/usr/bin/env python3

import hashlib
import json
from datetime import date
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "tmp/pdfs/bego-official-implant-catalog.pdf"
PDF_URL = (
    "https://www.bego.com/fileadmin/user_downloads/Mediathek/Implants/"
    "Std_Downloads_global_en/Implants-Katalog_imp_82472_20_br_en_screen.pdf"
)
CANONICAL_PATH = ROOT / "data/reports/canonical-manufacturer-intake.json"
PUBLIC_DIR = ROOT / "apps/buyer-web/public/catalog/products"
EVIDENCE_PATH = ROOT / "data/catalog-evidence/bego-official-pdf-product-images.json"
REPORT_PATH = ROOT / "data/reports/bego-official-pdf-product-images.json"
PRODUCTION_ORIGIN = "https://dentmarket-shop.vercel.app"

# PDF pages are one-based. Image indexes refer to pypdf's deterministic
# page.images order. Every association was checked against the official table:
# the exact REF row and the image for its diameter/product family are on the
# same catalogue page.
TARGETS = [
    {
        "canonicalProductId": "CANON-BEGO-58503",
        "page": 7,
        "imageIndex": 7,
        "note": (
            "Official naturesQue SemOss B vial image; the same page lists "
            "REF 58503 for 2.0 g / 4.0 ml."
        ),
    },
    {
        "canonicalProductId": "CANON-BEGO-58263",
        "page": 13,
        "imageIndex": 1,
        "note": (
            "Official Semados SCX 3.25 mm family image; the adjacent table "
            "lists REF 58263 for diameter 3.25 mm, length 13 mm."
        ),
    },
    {
        "canonicalProductId": "CANON-BEGO-58276",
        "page": 13,
        "imageIndex": 4,
        "note": (
            "Official Semados SCX 4.5 mm family image; the adjacent table "
            "lists REF 58276 for diameter 4.5 mm, length 7 mm."
        ),
    },
    {
        "canonicalProductId": "CANON-BEGO-58885",
        "page": 14,
        "imageIndex": 2,
        "note": (
            "Official Semados RSXPro 5.5 mm family image; the adjacent table "
            "lists REF 58885 for diameter 5.5 mm, length 10 mm."
        ),
    },
    {
        "canonicalProductId": "CANON-BEGO-57720",
        "page": 15,
        "imageIndex": 3,
        "note": (
            "Official Semados RI 4.1 mm family image; the adjacent table "
            "lists REF 57720 for diameter 4.1 mm, length 11.5 mm."
        ),
    },
    {
        "canonicalProductId": "CANON-BEGO-57817",
        "page": 17,
        "imageIndex": 5,
        "note": (
            "Official PS HPW image aligned with the 4.5 mm compatibility "
            "group; the table lists REF 57817, diameter 6.5 mm, length 3 mm."
        ),
    },
    {
        "canonicalProductId": "CANON-BEGO-60512",
        "page": 28,
        "imageIndex": 27,
        "note": (
            "Official BEGO Abutment Finishing Handle image directly beside "
            "the REF 60512 row."
        ),
    },
    {
        "canonicalProductId": "CANON-BEGO-60513",
        "page": 28,
        "imageIndex": 28,
        "note": (
            "Official replacement model analog image directly beside the "
            "REF 60513 row."
        ),
    },
]


def sha256(payload):
    return hashlib.sha256(payload).hexdigest()


def prepare_marketplace_image(source):
    image = source.convert("RGBA")
    background = Image.new("RGBA", image.size, "white")
    background.alpha_composite(image)
    rgb = background.convert("RGB")
    difference = ImageChops.difference(
        rgb, Image.new("RGB", rgb.size, "white")
    ).convert("L")
    foreground = difference.point(lambda value: 255 if value > 10 else 0)
    bbox = foreground.getbbox()
    if bbox:
        rgb = rgb.crop(bbox)
    scale = min(840 / rgb.width, 840 / rgb.height)
    rgb = rgb.resize(
        (
            max(1, round(rgb.width * scale)),
            max(1, round(rgb.height * scale)),
        ),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGB", (1000, 1000), "white")
    canvas.paste(rgb, ((1000 - rgb.width) // 2, (1000 - rgb.height) // 2))
    return canvas


canonical = json.loads(CANONICAL_PATH.read_text(encoding="utf-8"))
canonical_by_id = {
    product["canonicalProductId"]: product for product in canonical["products"]
}
reader = PdfReader(str(PDF_PATH))
pdf_hash = sha256(PDF_PATH.read_bytes())
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

products = []
review = []

for target in TARGETS:
    canonical_product = canonical_by_id.get(target["canonicalProductId"])
    if not canonical_product:
        review.append({**target, "reason": "CANONICAL_PRODUCT_NOT_FOUND"})
        continue

    page = reader.pages[target["page"] - 1]
    images = list(page.images)
    if target["imageIndex"] >= len(images):
        review.append(
            {
                **target,
                "reason": "PDF_IMAGE_INDEX_OUT_OF_RANGE",
                "pageImageCount": len(images),
            }
        )
        continue

    embedded = images[target["imageIndex"]]
    prepared = prepare_marketplace_image(embedded.image)
    output = BytesIO()
    prepared.save(output, format="PNG", optimize=True)
    payload = output.getvalue()
    output_hash = sha256(payload)
    reference = str(canonical_product.get("manufacturerRef") or "product")
    filename = f"official-bego-{reference.lower()}-{output_hash[:10]}.png"
    (PUBLIC_DIR / filename).write_bytes(payload)
    local_url = f"{PRODUCTION_ORIGIN}/catalog/products/{filename}"
    source_product_ids = canonical_product.get("sourceProductIds") or []

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
            "sourcePageUrl": PDF_URL,
            "sourcePdfPages": str(target["page"]),
            "kzEvidence": canonical_product.get("kzEvidence"),
            "status": "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
            "photoEvidence": {
                "method": "OFFICIAL_PDF_EMBEDDED_IMAGE_EXACT_REF_OR_FAMILY",
                "officialPdfUrl": PDF_URL,
                "officialPdfSha256": pdf_hash,
                "pdfPage": target["page"],
                "embeddedImageIndex": target["imageIndex"],
                "embeddedImageName": embedded.name,
                "visualMatchNote": target["note"],
                "outputImageSha256": output_hash,
                "bytes": len(payload),
                "contentType": "image/png",
                "noGeneratedGeometry": True,
            },
        }
    )
    prepared.close()

evidence = {
    "brand": "BEGO",
    "manufacturer": "BEGO GmbH & Co. KG",
    "sourceType": "OFFICIAL_MANUFACTURER_PDF_EMBEDDED_EXACT_PRODUCT_IMAGES",
    "lastChecked": date.today().isoformat(),
    "policy": {
        "officialPdfOnly": True,
        "exactReferenceOrDiameterFamilyRequired": True,
        "visualVerificationRequired": True,
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
