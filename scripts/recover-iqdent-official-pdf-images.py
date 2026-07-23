#!/usr/bin/env python3

import hashlib
import json
import logging
import re
import sys
from collections import OrderedDict, defaultdict
from datetime import date
from io import BytesIO
from pathlib import Path

import pdfplumber
from PIL import Image, ImageDraw
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "apps/buyer-web/public/catalog/products"
EVIDENCE_PATH = (
    ROOT / "data/catalog-evidence/iqdent-manufacturer-official-pdf-images.json"
)
REPORT_PATH = (
    ROOT / "data/reports/iqdent-manufacturer-official-pdf-images.json"
)
CANONICAL_PATH = ROOT / "data/reports/canonical-manufacturer-intake.json"
QUEUE_PATH = ROOT / "data/reports/product-image-restoration-queue.json"
CATALOG_PATH = ROOT / "data/catalog-evidence/iqdent-manufacturer-catalog.json"
OCR_PATH = ROOT / "tmp/iqdent-instrument-ocr.json"
PRODUCTION_ORIGIN = "https://dentmarket-shop.vercel.app"
DRY_RUN = "--dry-run" in sys.argv
logging.getLogger("pypdf").setLevel(logging.CRITICAL)

PDF_CONFIGS = {
    "AKTUALNY_KATALOG_IQ_03.01_web.pdf": {
        "path": ROOT / "tmp/pdfs/iqdent-official-catalog.pdf",
        "kind": "instruments",
    },
    "iqdent_katalog_web.pdf": {
        "path": ROOT / "tmp/pdfs/iqdent-burs-official-catalog.pdf",
        "kind": "burs",
    },
}


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_bytes(payload):
    return hashlib.sha256(payload).hexdigest()


def slug(value):
    normalized = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return normalized or "product"


def listed_pages(value):
    pages = set()
    for token in re.findall(r"\d+", str(value or "")):
        pages.add(int(token))
    if "–" in str(value) or "-" in str(value):
        bounds = [int(token) for token in re.findall(r"\d+", str(value or ""))]
        if len(bounds) == 2 and 0 < bounds[1] - bounds[0] <= 10:
            pages.update(range(bounds[0], bounds[1] + 1))
    return sorted(pages)


def pdf_config(source_url):
    for filename, config in PDF_CONFIGS.items():
        if filename.lower() in str(source_url).lower():
            return filename, config
    return None, None


def visual_ref(product):
    official_id = str(product.get("officialProductId") or "")
    match = re.fullmatch(r"IQDENT-BUR-(\d+)", official_id, re.IGNORECASE)
    if match:
        return match.group(1)
    ref = str(product.get("manufacturerRef") or "").strip()
    return ref


def exact_ref_pattern(ref):
    return re.compile(
        rf"(?<![A-Za-z0-9]){re.escape(str(ref))}(?![A-Za-z0-9])",
        re.IGNORECASE,
    )


def heading_for_bur(page, ref):
    matches = page.search(exact_ref_pattern(ref), regex=True)
    if not matches:
        return None
    matches.sort(
        key=lambda match: (
            -max((char.get("size", 0) for char in match.get("chars", [])), default=0),
            match["top"],
        ),
    )
    match = matches[0]
    return {
        "x0": float(match["x0"]),
        "x1": float(match["x1"]),
        "top": float(match["top"]),
        "bottom": float(match["bottom"]),
    }


def heading_for_instrument(ocr_page, ref, page_width, page_height):
    exact = [
        line
        for line in ocr_page.get("lines", [])
        if line.get("text", "").strip().upper() == str(ref).strip().upper()
    ]
    if not exact:
        return None
    line = max(exact, key=lambda item: item.get("height", 0))
    top = (1 - line["y"] - line["height"]) * page_height
    bottom = (1 - line["y"]) * page_height
    return {
        "x0": line["x"] * page_width,
        "x1": (line["x"] + line["width"]) * page_width,
        "top": top,
        "bottom": bottom,
    }


def select_images(kind, page, heading, next_top):
    column = 0 if heading["x0"] < page.width / 2 else 1
    column_left = 0 if column == 0 else page.width / 2
    column_right = page.width / 2 if column == 0 else page.width
    block_top = max(135, heading["top"] - (34 if kind == "instruments" else 52))
    block_bottom = min(page.height - 20, next_top - 16)
    selected = []

    for entry in page.images:
        width = float(entry["x1"] - entry["x0"])
        height = float(entry["bottom"] - entry["top"])
        center_x = (entry["x0"] + entry["x1"]) / 2
        center_y = (entry["top"] + entry["bottom"]) / 2
        source_width, source_height = entry.get("srcsize") or (0, 0)
        if center_y < block_top or center_y > block_bottom:
            continue
        if not (column_left <= center_x <= column_right):
            continue
        if entry["top"] < 135:
            continue
        if source_height > 900 or width > page.width * 0.56:
            continue

        if kind == "burs":
            target_x = max(column_left + 35, heading["x0"] - 40)
            if width > 285 or height > 310:
                continue
            if abs(center_x - target_x) > 78:
                continue
        else:
            if width > page.width * 0.46 or height > 250:
                continue
            if source_width > 700 or source_height > 700:
                continue

        selected.append(
            {
                "name": entry["name"],
                "x0": float(entry["x0"]),
                "x1": float(entry["x1"]),
                "top": float(entry["top"]),
                "bottom": float(entry["bottom"]),
                "width": width,
                "height": height,
            }
        )

    if kind == "burs" and len(selected) > 1:
        target_x = max(column_left + 35, heading["x0"] - 40)
        distances = sorted(
            [
                (
                abs((entry["x0"] + entry["x1"]) / 2 - target_x),
                entry,
                )
                for entry in selected
            ],
            key=lambda item: item[0],
        )
        nearest_distance = distances[0][0]
        selected = [
            entry
            for distance, entry in distances
            if distance <= max(48, nearest_distance + 28)
        ]

    return selected


def extract_page_images(pdf_path, page_number):
    result = {}
    with pdf_path.open("rb") as source:
        reader = PdfReader(source)
        for pdf_image in reader.pages[page_number - 1].images:
            name = Path(pdf_image.name).stem
            if name in result:
                continue
            try:
                image = pdf_image.image.copy()
                image.load()
                result[name] = remove_dark_border_background(
                    image.convert("RGBA")
                )
            except Exception:
                try:
                    image = Image.open(BytesIO(pdf_image.data))
                    image.load()
                    result[name] = remove_dark_border_background(
                        image.convert("RGBA")
                    )
                except Exception:
                    continue
    return result


def remove_dark_border_background(image):
    sample = image.resize((64, 64), Image.Resampling.BILINEAR)
    sample_pixels = (
        sample.get_flattened_data()
        if hasattr(sample, "get_flattened_data")
        else sample.getdata()
    )
    dark_ratio = sum(
        max(pixel[:3]) < 32 and max(pixel[:3]) - min(pixel[:3]) < 12
        for pixel in sample_pixels
    ) / (64 * 64)
    if dark_ratio > 0.12:
        cleaned = image.copy()
        pixels = cleaned.load()
        for y in range(cleaned.height):
            for x in range(cleaned.width):
                red, green, blue, alpha = pixels[x, y]
                if max(red, green, blue) < 38 and max(red, green, blue) - min(
                    red, green, blue
                ) < 16:
                    pixels[x, y] = (255, 255, 255, alpha)
        return cleaned
    corners = [
        image.getpixel((0, 0)),
        image.getpixel((image.width - 1, 0)),
        image.getpixel((0, image.height - 1)),
        image.getpixel((image.width - 1, image.height - 1)),
    ]
    dark_corners = sum(max(pixel[:3]) < 35 for pixel in corners)
    if dark_corners < 2:
        return image
    cleaned = image.copy()
    for point in [
        (0, 0),
        (cleaned.width - 1, 0),
        (0, cleaned.height - 1),
        (cleaned.width - 1, cleaned.height - 1),
    ]:
        if max(cleaned.getpixel(point)[:3]) < 35:
            ImageDraw.floodfill(
                cleaned,
                point,
                value=(255, 255, 255, 255),
                thresh=42,
            )
    return cleaned


def compose_product_image(selected, extracted):
    if not selected:
        return None

    layers = [(entry, extracted.get(entry["name"])) for entry in selected]
    layers = [(entry, image) for entry, image in layers if image is not None]
    if not layers:
        return None
    x0 = min(entry["x0"] for entry, _ in layers)
    x1 = max(entry["x1"] for entry, _ in layers)
    top = min(entry["top"] for entry, _ in layers)
    bottom = max(entry["bottom"] for entry, _ in layers)
    display_width = max(1, x1 - x0)
    display_height = max(1, bottom - top)
    scale = min(820 / display_width, 820 / display_height)
    canvas = Image.new("RGBA", (1000, 1000), (255, 255, 255, 255))
    offset_x = (1000 - display_width * scale) / 2
    offset_y = (1000 - display_height * scale) / 2

    for entry, image in layers:
        target_width = max(1, round(entry["width"] * scale))
        target_height = max(1, round(entry["height"] * scale))
        resized = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
        paste_x = round(offset_x + (entry["x0"] - x0) * scale)
        paste_y = round(offset_y + (entry["top"] - top) * scale)
        canvas.alpha_composite(resized, (paste_x, paste_y))

    return canvas.convert("RGB")


canonical = load_json(CANONICAL_PATH)
queue = load_json(QUEUE_PATH)
catalog = load_json(CATALOG_PATH)
ocr_pages = {
    entry["file"]: entry for entry in load_json(OCR_PATH)
} if OCR_PATH.exists() else {}
canonical_by_id = {
    product["canonicalProductId"]: product for product in canonical["products"]
}
catalog_by_ref = defaultdict(list)
for product in catalog["products"]:
    references = {
        str(product.get("manufacturerRef", "")).strip(),
        *[
            str(variant.get("manufacturerRef", "")).strip()
            for variant in product.get("variants", [])
        ],
        *[
            part.strip()
            for part in str(product.get("manufacturerRefs") or "").split("|")
        ],
    }
    for reference in references:
        if reference:
            catalog_by_ref[reference.upper()].append(product)

targets = [
    item
    for item in queue["items"]
    if item.get("brand") == "IQ Dent" and item.get("photoStatus") == "PHOTO_REQUIRED"
]


def target_sort_key(item):
    canonical_product = canonical_by_id.get(item["canonicalProductId"], {})
    ref = str(canonical_product.get("manufacturerRef") or "").strip()
    candidates = catalog_by_ref.get(ref.upper(), [])
    product = next(
        (entry for entry in candidates if entry.get("name") == item.get("name")),
        candidates[0] if len(candidates) == 1 else None,
    )
    if not product:
        return ("~", 999, item.get("name", ""))
    filename, _ = pdf_config(product.get("sourcePageUrl"))
    pages = listed_pages(product.get("sourcePdfPages"))
    return (filename or "~", pages[0] if pages else 999, item.get("name", ""))


targets.sort(key=target_sort_key)
grouped_catalog = defaultdict(list)
for product in catalog["products"]:
    filename, config = pdf_config(product.get("sourcePageUrl"))
    if not config:
        continue
    for page_number in listed_pages(product.get("sourcePdfPages")):
        grouped_catalog[(filename, page_number)].append(product)

pdf_handles = {}
for filename, config in PDF_CONFIGS.items():
    if not config["path"].exists():
        continue
    pdf_handles[filename] = {
        "plumber": pdfplumber.open(config["path"]),
        "hash": sha256_bytes(config["path"].read_bytes()),
        "kind": config["kind"],
        "path": config["path"],
    }

recovered = []
review = []
extracted_cache = OrderedDict()
PUBLIC_DIR.mkdir(parents=True, exist_ok=True)

for item in targets:
    canonical_product = canonical_by_id.get(item["canonicalProductId"])
    if not canonical_product:
        review.append({**item, "reason": "CANONICAL_PRODUCT_NOT_FOUND"})
        continue
    ref = str(canonical_product.get("manufacturerRef") or "").strip()
    candidates = catalog_by_ref.get(ref.upper(), [])
    catalog_product = next(
        (product for product in candidates if product.get("name") == item.get("name")),
        candidates[0] if len(candidates) == 1 else None,
    )
    if not catalog_product:
        review.append({**item, "reason": "OFFICIAL_CATALOG_RECORD_NOT_FOUND"})
        continue
    heading_ref = visual_ref(catalog_product)
    filename, config = pdf_config(catalog_product.get("sourcePageUrl"))
    handle = pdf_handles.get(filename)
    if not handle:
        review.append({**item, "reason": "OFFICIAL_PDF_NOT_AVAILABLE_LOCALLY"})
        continue

    found = None
    for page_number in listed_pages(catalog_product.get("sourcePdfPages")):
        if page_number < 1 or page_number > len(handle["plumber"].pages):
            continue
        page = handle["plumber"].pages[page_number - 1]
        if handle["kind"] == "instruments":
            heading = heading_for_instrument(
                ocr_pages.get(f"page-{page_number:02d}.jpg", {}),
                heading_ref,
                page.width,
                page.height,
            )
        else:
            heading = heading_for_bur(page, heading_ref)
        if not heading:
            continue

        same_page_headings = []
        for peer in grouped_catalog[(filename, page_number)]:
            peer_ref = visual_ref(peer)
            if handle["kind"] == "instruments":
                peer_heading = heading_for_instrument(
                    ocr_pages.get(f"page-{page_number:02d}.jpg", {}),
                    peer_ref,
                    page.width,
                    page.height,
                )
            else:
                peer_heading = heading_for_bur(page, peer_ref)
            if peer_heading:
                same_page_headings.append(peer_heading)
        same_column = [
            peer
            for peer in same_page_headings
            if (peer["x0"] < page.width / 2) == (heading["x0"] < page.width / 2)
            and peer["top"] > heading["top"] + 4
        ]
        next_top = (
            min(peer["top"] for peer in same_column)
            if same_column
            else page.height - 10
        )
        selected = select_images(handle["kind"], page, heading, next_top)
        cache_key = (filename, page_number)
        if cache_key not in extracted_cache:
            extracted_cache[cache_key] = extract_page_images(
                handle["path"], page_number
            )
            while len(extracted_cache) > 1:
                _, expired = extracted_cache.popitem(last=False)
                for expired_image in expired.values():
                    expired_image.close()
        else:
            extracted_cache.move_to_end(cache_key)
        extracted = extracted_cache[cache_key]
        composed = compose_product_image(selected, extracted)
        if composed is None:
            continue
        found = {
            "pageNumber": page_number,
            "heading": heading,
            "selected": selected,
            "image": composed,
            "pdf": handle,
        }
        break

    if not found:
        review.append(
            {
                "canonicalProductId": item["canonicalProductId"],
                "brand": item["brand"],
                "name": item["name"],
                "manufacturerRef": ref,
                "sourcePageUrl": catalog_product.get("sourcePageUrl"),
                "sourcePdfPages": catalog_product.get("sourcePdfPages"),
                "reason": "EXACT_PRODUCT_IMAGE_NOT_MAPPED_FROM_OFFICIAL_PDF",
                "publicationDecision": "KEEP_ON_PHOTO_MODERATION",
            }
        )
        continue

    output = BytesIO()
    found["image"].save(output, format="PNG", optimize=True)
    payload = output.getvalue()
    image_hash = sha256_bytes(payload)
    image_filename = (
        f"official-iqdent-{slug(ref)}-{image_hash[:10]}.png"
    )
    if not DRY_RUN:
        (PUBLIC_DIR / image_filename).write_bytes(payload)
    local_url = f"{PRODUCTION_ORIGIN}/catalog/products/{image_filename}"
    recovered.append(
        {
            "officialProductId": catalog_product.get("officialProductId"),
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
            "sourcePageUrl": catalog_product.get("sourcePageUrl"),
            "sourcePdfPages": str(found["pageNumber"]),
            "kzEvidence": canonical_product.get("kzEvidence"),
            "status": "OFFICIAL_EXACT_PRODUCT_IMAGE_RECOVERED",
            "photoEvidence": {
                "method": "OFFICIAL_PDF_EMBEDDED_PRODUCT_IMAGE",
                "officialPdfUrl": catalog_product.get("sourcePageUrl"),
                "officialPdfSha256": found["pdf"]["hash"],
                "pdfPage": found["pageNumber"],
                "embeddedImageNames": [
                    entry["name"] for entry in found["selected"]
                ],
                "outputImageSha256": image_hash,
                "bytes": len(payload),
                "contentType": "image/png",
            },
        }
    )

for handle in pdf_handles.values():
    handle["plumber"].close()
for cached in extracted_cache.values():
    for cached_image in cached.values():
        cached_image.close()

evidence = {
    "brand": "IQ Dent",
    "manufacturer": "IQdent Sp. z o.o.",
    "sourceType": "OFFICIAL_MANUFACTURER_PDF_EMBEDDED_PRODUCT_IMAGES",
    "lastChecked": date.today().isoformat(),
    "policy": {
        "officialPdfOnly": True,
        "exactReferenceHeadingRequired": True,
        "embeddedProductImagesOnly": True,
        "tablesAndPageTextExcluded": True,
        "allPdfAndOutputHashesPinned": True,
        "noGeneratedProductGeometry": True,
        "unmatchedProductsRemainOnModeration": True,
    },
    "totals": {
        "targets": len(targets),
        "recovered": len(recovered),
        "reviewRequired": len(review),
    },
    "products": recovered,
}
report = {**evidence, "review": review}
if not DRY_RUN:
    EVIDENCE_PATH.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
print(json.dumps(evidence["totals"], ensure_ascii=False, indent=2))
