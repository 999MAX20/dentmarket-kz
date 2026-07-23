#!/usr/bin/env python3

import hashlib
import json
import subprocess
import tempfile
from collections import deque
from datetime import date
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "apps/buyer-web/public/catalog/products"
CANONICAL_PATH = ROOT / "data/reports/canonical-manufacturer-intake.json"
EVIDENCE_PATH = (
    ROOT / "data/catalog-evidence/iqdent-manual-official-pdf-crops.json"
)
REPORT_PATH = ROOT / "data/reports/iqdent-manual-official-pdf-crops.json"
PRODUCTION_ORIGIN = "https://dentmarket-shop.vercel.app"

PDFS = {
    "burs": {
        "path": ROOT / "tmp/pdfs/iqdent-burs-official-catalog.pdf",
        "url": "https://iqdent.pl/wp-content/uploads/2025/01/iqdent_katalog_web.pdf",
    },
    "instruments": {
        "path": ROOT / "tmp/pdfs/iqdent-official-catalog.pdf",
        "url": "https://iqdent.pl/wp-content/uploads/2025/01/AKTUALNY_KATALOG_IQ_03.01_web.pdf",
    },
}

# Crop boxes are normalized PDF-page coordinates: left, top, right, bottom.
# Every box was visually checked against the exact heading/reference on the
# official IQ Dent catalogue page. Text tables and adjacent products are excluded.
TARGETS = [
    {
        "canonicalProductId": "CANON-IQ-DENT-204-108-524-012",
        "pdf": "burs",
        "page": 14,
        "crop": (0.445, 0.285, 0.505, 0.455),
        "note": "Official shape 108 bur image beside reference 204.108.524.012",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-314-298-514-012",
        "pdf": "burs",
        "page": 21,
        "crop": (0.47, 0.185, 0.525, 0.415),
        "note": "Official shape 298 bur image beside reference 314.298.514.012",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CB7L",
        "pdf": "burs",
        "page": 27,
        "crop": (0.075, 0.46, 0.145, 0.705),
        "note": "Official CB7L carbide bur family image",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CB21R",
        "pdf": "burs",
        "page": 27,
        "crop": (0.08, 0.72, 0.15, 0.94),
        "note": "Official CB21R carbide bur family image",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF48LF",
        "pdf": "burs",
        "page": 31,
        "crop": (0.10, 0.65, 0.18, 0.925),
        "note": "Official CF48L family image listing the CF48LF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF48LUF",
        "pdf": "burs",
        "page": 31,
        "crop": (0.099, 0.645, 0.181, 0.93),
        "note": "Official CF48L family image listing the CF48LUF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF141UF",
        "pdf": "burs",
        "page": 33,
        "crop": (0.095, 0.255, 0.16, 0.515),
        "note": "Official CF141 family image listing the CF141UF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF142UF",
        "pdf": "burs",
        "page": 33,
        "crop": (0.56, 0.25, 0.63, 0.52),
        "note": "Official CF142 family image listing the CF142UF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF198UF",
        "pdf": "burs",
        "page": 33,
        "crop": (0.10, 0.655, 0.16, 0.925),
        "note": "Official CF198 family image listing the CF198UF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF199UF",
        "pdf": "burs",
        "page": 33,
        "crop": (0.56, 0.645, 0.63, 0.925),
        "note": "Official CF199 family image listing the CF199UF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF246UF",
        "pdf": "burs",
        "page": 34,
        "crop": (0.07, 0.28, 0.15, 0.52),
        "note": "Official CF246 family image listing the CF246UF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF379F",
        "pdf": "burs",
        "page": 35,
        "crop": (0.09, 0.31, 0.16, 0.55),
        "note": "Official CF379 family image listing the CF379F variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF379UF",
        "pdf": "burs",
        "page": 35,
        "crop": (0.089, 0.305, 0.161, 0.555),
        "note": "Official CF379 family image listing the CF379UF variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-CF390F",
        "pdf": "burs",
        "page": 35,
        "crop": (0.56, 0.30, 0.64, 0.55),
        "note": "Official CF390 family image listing the CF390F variant",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-05-03",
        "pdf": "instruments",
        "page": 20,
        "segments": [
            (0.55, 0.69, 0.62, 0.92),
            (0.63, 0.69, 0.69, 0.92),
        ],
        "note": "Official two working-end views for periodontal excavator 05-03",
    },
    {
        "canonicalProductId": "CANON-IQ-DENT-13-10",
        "pdf": "instruments",
        "page": 32,
        "segments": [
            (0.57, 0.70, 0.635, 0.92),
            (0.65, 0.70, 0.71, 0.92),
        ],
        "note": "Official two working-end views for ligature pusher 13-10",
    },
    {
        "canonicalProductId":
            "CANON-IQ-DENT-IQDENT-STERILIZATION-CASSETTE-5",
        "pdf": "instruments",
        "page": 40,
        "crop": (0.18, 0.19, 0.43, 0.55),
        "note": "Official IQ Dent cassette for 5 instruments, green-band option",
    },
    {
        "canonicalProductId":
            "CANON-IQ-DENT-IQDENT-STERILIZATION-CASSETTE-10",
        "pdf": "instruments",
        "page": 40,
        "crop": (0.09, 0.615, 0.50, 0.95),
        "note": "Official IQ Dent cassette for 10 instruments, pink-band option",
    },
    {
        "canonicalProductId":
            "CANON-IQ-DENT-IQDENT-STERILIZATION-CASSETTE-20",
        "pdf": "instruments",
        "page": 41,
        "crop": (0.17, 0.25, 0.84, 0.58),
        "note": "Official IQ Dent cassette for 20 instruments, green-band option",
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


def crop_to_marketplace(page_image, box):
    width, height = page_image.size
    left, top, right, bottom = box
    crop = page_image.crop(
        (
            round(left * width),
            round(top * height),
            round(right * width),
            round(bottom * height),
        )
    )
    pixels = crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            red, green, blue = pixels[x, y]
            if (
                red > 235
                and blue > 235
                and green > 215
                and abs(red - blue) < 18
            ):
                pixels[x, y] = (255, 255, 255)
    crop.thumbnail((840, 840), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1000, 1000), "white")
    canvas.paste(crop, ((1000 - crop.width) // 2, (1000 - crop.height) // 2))
    return canvas


def compose_segments(page_image, boxes):
    width, height = page_image.size
    crops = []
    for left, top, right, bottom in boxes:
        crop = page_image.crop(
            (
                round(left * width),
                round(top * height),
                round(right * width),
                round(bottom * height),
            )
        )
        crops.append(crop)
    target_height = 800
    resized = []
    for crop in crops:
        scale = target_height / crop.height
        prepared = crop.resize(
                (max(1, round(crop.width * scale)), target_height),
                Image.Resampling.LANCZOS,
            )
        cleaned = keep_largest_foreground_component(prepared)
        cleaned_pixels = cleaned.load()
        for y in range(max(0, cleaned.height - 16), cleaned.height):
            for x in range(cleaned.width):
                cleaned_pixels[x, y] = (255, 255, 255)
        resized.append(cleaned)
        prepared.close()
        crop.close()
    gap = 60
    total_width = sum(image.width for image in resized) + gap * (len(resized) - 1)
    if total_width > 900:
        scale = 900 / total_width
        resized = [
            image.resize(
                (
                    max(1, round(image.width * scale)),
                    max(1, round(image.height * scale)),
                ),
                Image.Resampling.LANCZOS,
            )
            for image in resized
        ]
        gap = round(gap * scale)
        total_width = sum(image.width for image in resized) + gap * (
            len(resized) - 1
        )
    canvas = Image.new("RGB", (1000, 1000), "white")
    cursor = (1000 - total_width) // 2
    for image in resized:
        canvas.paste(image, (cursor, (1000 - image.height) // 2))
        cursor += image.width + gap
        image.close()
    return canvas


def keep_largest_foreground_component(image):
    rgb = image.convert("RGB")
    pixels = rgb.load()
    width, height = rgb.size
    foreground = bytearray(width * height)
    for y in range(height):
        row = y * width
        for x in range(width):
            red, green, blue = pixels[x, y]
            if (255 - red) + (255 - green) + (255 - blue) > 55:
                foreground[row + x] = 1

    visited = bytearray(width * height)
    largest = []
    for start in range(width * height):
        if not foreground[start] or visited[start]:
            continue
        visited[start] = 1
        queue = deque([start])
        component = []
        while queue:
            point = queue.popleft()
            component.append(point)
            x = point % width
            y = point // width
            if x and foreground[point - 1] and not visited[point - 1]:
                visited[point - 1] = 1
                queue.append(point - 1)
            if (
                x + 1 < width
                and foreground[point + 1]
                and not visited[point + 1]
            ):
                visited[point + 1] = 1
                queue.append(point + 1)
            if y and foreground[point - width] and not visited[point - width]:
                visited[point - width] = 1
                queue.append(point - width)
            if (
                y + 1 < height
                and foreground[point + width]
                and not visited[point + width]
            ):
                visited[point + width] = 1
                queue.append(point + width)
        if len(component) > len(largest):
            largest = component

    keep = bytearray(width * height)
    for point in largest:
        x = point % width
        y = point // width
        for offset_y in (-2, -1, 0, 1, 2):
            target_y = y + offset_y
            if target_y < 0 or target_y >= height:
                continue
            for offset_x in (-2, -1, 0, 1, 2):
                target_x = x + offset_x
                if 0 <= target_x < width:
                    keep[target_y * width + target_x] = 1
    for point in range(width * height):
        if not keep[point]:
            pixels[point % width, point // width] = (255, 255, 255)
    return rgb


canonical = json.loads(CANONICAL_PATH.read_text(encoding="utf-8"))
canonical_by_id = {
    product["canonicalProductId"]: product for product in canonical["products"]
}
pdf_hashes = {
    key: sha256(config["path"].read_bytes()) for key, config in PDFS.items()
}
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)

products = []
review = []
page_cache = {}

with tempfile.TemporaryDirectory(prefix="iqdent-crops-") as temporary_dir:
    temporary = Path(temporary_dir)
    for target in TARGETS:
        canonical_product = canonical_by_id.get(target["canonicalProductId"])
        if not canonical_product:
            review.append({**target, "reason": "CANONICAL_PRODUCT_NOT_FOUND"})
            continue
        pdf_config = PDFS[target["pdf"]]
        cache_key = (target["pdf"], target["page"])
        if cache_key not in page_cache:
            page_cache[cache_key] = render_page(
                pdf_config["path"],
                target["page"],
                temporary / f"{target['pdf']}-{target['page']}",
            )
        if target.get("segments"):
            product_image = compose_segments(
                page_cache[cache_key], target["segments"]
            )
        else:
            product_image = crop_to_marketplace(
                page_cache[cache_key], target["crop"]
            )
        output = BytesIO()
        product_image.save(output, format="PNG", optimize=True)
        payload = output.getvalue()
        output_hash = sha256(payload)
        reference_slug = (
            canonical_product.get("manufacturerRef")
            or canonical_product["canonicalProductId"].replace("CANON-IQ-DENT-", "")
        ).lower().replace(".", "-")
        filename = f"official-iqdent-manual-{reference_slug}-{output_hash[:10]}.png"
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
                "sourcePageUrl": pdf_config["url"],
                "sourcePdfPages": str(target["page"]),
                "kzEvidence": canonical_product.get("kzEvidence"),
                "status": "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
                "photoEvidence": {
                    "method": "OFFICIAL_PDF_VISUALLY_VERIFIED_EXACT_CROP",
                    "officialPdfUrl": pdf_config["url"],
                    "officialPdfSha256": pdf_hashes[target["pdf"]],
                    "pdfPage": target["page"],
                    "normalizedCropBox": (
                        [list(box) for box in target["segments"]]
                        if target.get("segments")
                        else list(target["crop"])
                    ),
                    "visualMatchNote": target["note"],
                    "outputImageSha256": output_hash,
                    "bytes": len(payload),
                    "contentType": "image/png",
                    "noGeneratedGeometry": True,
                },
            }
        )

for image in page_cache.values():
    image.close()

evidence = {
    "brand": "IQ Dent",
    "manufacturer": "IQdent Sp. z o.o.",
    "sourceType": "OFFICIAL_MANUFACTURER_PDF_VISUALLY_VERIFIED_EXACT_CROPS",
    "lastChecked": date.today().isoformat(),
    "policy": {
        "officialPdfOnly": True,
        "exactReferenceOrFamilyHeadingRequired": True,
        "visualVerificationRequired": True,
        "adjacentProductsAndTablesExcluded": True,
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
