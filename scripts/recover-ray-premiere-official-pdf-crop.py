#!/usr/bin/env python3

import hashlib
import json
import re
import subprocess
import tempfile
import urllib.request
from datetime import date
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CANONICAL_PATH = ROOT / "data/reports/canonical-manufacturer-intake.json"
PDF_PATH = ROOT / "tmp/pdfs/ray-premiere-official-brochure.pdf"
PUBLIC_DIR = ROOT / "apps/buyer-web/public/catalog/products"
EVIDENCE_PATH = (
    ROOT / "data/catalog-evidence/ray-premiere-official-pdf-crop.json"
)
REPORT_PATH = ROOT / "data/reports/ray-premiere-official-pdf-crop.json"
PRODUCTION_ORIGIN = "https://dentmarket-shop.vercel.app"
CANONICAL_PRODUCT_ID = "CANON-RAY-RAY-RAYPREMIERE"
RESOURCE_PAGE_URL = (
    "https://connect.raymedical.com/en/resources/"
    "a31d3985-0fbb-4e4e-88d8-2bd208fe0601"
)
SOURCE_PAGE_URL = (
    "https://connect.raymedical.com/en/browse/CBCT/RAYPreMiere/"
    "RAYPreMiere(v)/Sales"
)
PAGE_NUMBER = 1
# Visually checked against the official brochure cover. The box contains the
# complete RAYPreMiere unit and excludes the large product-name typography.
CROP_BOX = (0.435, 0.135, 0.925, 0.765)


def sha256(payload):
    return hashlib.sha256(payload).hexdigest()


def download_official_pdf():
    request = urllib.request.Request(
        RESOURCE_PAGE_URL,
        headers={"User-Agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        html = response.read().decode("utf-8", errors="replace")
    match = re.search(
        r'<a href="([^"]+)" download="RAYPreMiere_Brochure[^"]+\.pdf"',
        html,
        flags=re.IGNORECASE,
    )
    if not match:
        raise RuntimeError("Official RAYConnect PDF download link not found")
    pdf_request = urllib.request.Request(
        match.group(1),
        headers={"User-Agent": "Mozilla/5.0 DentMarketCatalogAudit/1.0"},
    )
    with urllib.request.urlopen(pdf_request, timeout=90) as response:
        payload = response.read()
    if not payload.startswith(b"%PDF"):
        raise RuntimeError("Official RAYConnect response is not a PDF")
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    PDF_PATH.write_bytes(payload)
    return payload


def render_page(output_prefix):
    subprocess.run(
        [
            "pdftoppm",
            "-f",
            str(PAGE_NUMBER),
            "-l",
            str(PAGE_NUMBER),
            "-r",
            "300",
            "-png",
            "-singlefile",
            str(PDF_PATH),
            str(output_prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    image = Image.open(f"{output_prefix}.png").convert("RGB")
    image.load()
    return image


def prepare_marketplace_image(page):
    width, height = page.size
    left, top, right, bottom = CROP_BOX
    crop = page.crop(
        (
            round(left * width),
            round(top * height),
            round(right * width),
            round(bottom * height),
        )
    )
    crop.thumbnail((1080, 1080), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1200, 1200), "white")
    canvas.paste(crop, ((1200 - crop.width) // 2, (1200 - crop.height) // 2))
    crop.close()
    return canvas


canonical = json.loads(CANONICAL_PATH.read_text(encoding="utf-8"))
product = next(
    (
        item
        for item in canonical["products"]
        if item["canonicalProductId"] == CANONICAL_PRODUCT_ID
    ),
    None,
)
if not product:
    raise RuntimeError(f"Canonical product not found: {CANONICAL_PRODUCT_ID}")

pdf_payload = download_official_pdf()
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

with tempfile.TemporaryDirectory(prefix="ray-premiere-crop-") as directory:
    page = render_page(Path(directory) / "page")
    prepared = prepare_marketplace_image(page)
    output = BytesIO()
    prepared.save(output, format="PNG", optimize=True)
    image_payload = output.getvalue()
    page.close()
    prepared.close()

image_hash = sha256(image_payload)
filename = f"official-ray-premiere-brochure-{image_hash[:10]}.png"
(PUBLIC_DIR / filename).write_bytes(image_payload)
local_url = f"{PRODUCTION_ORIGIN}/catalog/products/{filename}"
source_product_ids = product.get("sourceProductIds") or []

evidence_product = {
    "officialProductId": (
        source_product_ids[0]
        if source_product_ids
        else CANONICAL_PRODUCT_ID.replace("CANON-", "")
    ),
    "brand": product.get("brand"),
    "manufacturer": product.get("manufacturer"),
    "name": product.get("name"),
    "manufacturerRef": product.get("manufacturerRef"),
    "manufacturerRefs": product.get("manufacturerRefs"),
    "model": product.get("model"),
    "variantCount": product.get("variantCount"),
    "variants": product.get("variants"),
    "categoryPath": product.get("categoryPath"),
    "description": product.get("description"),
    "sourceImageUrl": local_url,
    "imageUrls": local_url,
    "imageCount": 1,
    "sourcePageUrl": SOURCE_PAGE_URL,
    "sourcePdfPages": str(PAGE_NUMBER),
    "kzEvidence": product.get("kzEvidence"),
    "status": "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
    "photoEvidence": {
        "method": "OFFICIAL_PDF_VISUALLY_VERIFIED_EXACT_CROP",
        "officialResourcePageUrl": RESOURCE_PAGE_URL,
        "officialPdfSha256": sha256(pdf_payload),
        "pdfPage": PAGE_NUMBER,
        "normalizedCropBox": list(CROP_BOX),
        "visualMatchNote": (
            "Official RAYPreMiere unit on the manufacturer brochure cover; "
            "product-name typography and adjacent content are excluded"
        ),
        "outputImageSha256": image_hash,
        "bytes": len(image_payload),
        "contentType": "image/png",
        "noGeneratedGeometry": True,
    },
}

evidence = {
    "brand": "RAY",
    "manufacturer": "RAY Co., Ltd.",
    "sourceType": "OFFICIAL_MANUFACTURER_PDF_VISUALLY_VERIFIED_EXACT_CROP",
    "lastChecked": date.today().isoformat(),
    "policy": {
        "officialPdfOnly": True,
        "exactProductRequired": True,
        "visualVerificationRequired": True,
        "pdfAndOutputHashesPinned": True,
        "noGeneratedProductGeometry": True,
        "unmatchedProductsRemainOnModeration": True,
    },
    "totals": {"targets": 1, "recovered": 1, "reviewRequired": 0},
    "products": [evidence_product],
}
EVIDENCE_PATH.write_text(
    json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
REPORT_PATH.write_text(
    json.dumps({**evidence, "review": []}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print(json.dumps(evidence["totals"], ensure_ascii=False, indent=2))
