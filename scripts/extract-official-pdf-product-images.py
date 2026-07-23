#!/usr/bin/env python3
"""Recover exact product-only images embedded in official manufacturer PDFs.

The script never invents pixels. It reconstructs the image XObjects already
placed in the catalogue cell that contains the product reference/name, removes
the surrounding catalogue text, and places the result on a neutral square
canvas suitable for marketplace cards.
"""

from __future__ import annotations

import json
import logging
import hashlib
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

import pdfplumber
from PIL import Image
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_DIR = ROOT / "apps/buyer-web/public/catalog/products"
EVIDENCE_PATH = ROOT / "data/catalog-evidence/official-pdf-product-images.json"
REPORT_PATH = ROOT / "data/reports/official-pdf-product-images.json"
PRODUCTION_ORIGIN = "https://dentmarket-shop.vercel.app"
logging.getLogger("pypdf").setLevel(logging.ERROR)

SOURCES = {
    "IQ Dent": {
        "evidence": ROOT / "data/catalog-evidence/iqdent-manufacturer-catalog.json",
        "pdf": ROOT / "tmp/pdfs/product-photo-recovery/iqdent.pdf",
        "ocr": ROOT / "tmp/iqdent-instrument-ocr.json",
        "page_field": "sourcePdfPages",
        "page_map": lambda value: int(str(value).split("|")[0].strip()),
        "locator": "reference_ocr",
    },
    "DENU": {
        "evidence": ROOT / "data/catalog-evidence/denu-manufacturer-catalog.json",
        "pdf": ROOT / "tmp/pdfs/product-photo-recovery/denu.pdf",
        "page_field": "sourceDocumentPage",
        "page_map": lambda value: math.floor(int(value) / 2) + 1,
        "locator": "name_text",
    },
    "Myobrace": {
        "evidence": ROOT / "data/catalog-evidence/myobrace-manufacturer-catalog.json",
        "pdf": ROOT / "tmp/pdfs/product-photo-recovery/myobrace.pdf",
        "page_field": "cataloguePage",
        "page_map": lambda value: int(value),
        "locator": "reference_text",
    },
}


def clean(value: Any) -> str:
    return " ".join(str(value or "").split())


def key(value: Any) -> str:
    text = unicodedata.normalize("NFKC", clean(value)).casefold()
    text = text.replace("®", "").replace("™", "")
    return re.sub(r"[^a-zа-я0-9]+", " ", text, flags=re.I).strip()


def slug(value: Any) -> str:
    text = unicodedata.normalize("NFKD", clean(value))
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:100] or "product"


def page_lines(page: pdfplumber.page.Page) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for word in sorted(page.extract_words(), key=lambda item: (item["top"], item["x0"])):
        line = next(
            (candidate for candidate in lines if abs(candidate["top"] - word["top"]) <= 1.8),
            None,
        )
        if line is None:
            line = {"top": word["top"], "bottom": word["bottom"], "words": []}
            lines.append(line)
        line["words"].append(word)
        line["bottom"] = max(line["bottom"], word["bottom"])
    for line in lines:
        words = sorted(line["words"], key=lambda item: item["x0"])
        line["text"] = " ".join(word["text"] for word in words)
        line["x0"] = min(word["x0"] for word in words)
        line["x1"] = max(word["x1"] for word in words)
    return sorted(lines, key=lambda item: (item["top"], item["x0"]))


def locate_native_text(
    page: pdfplumber.page.Page, product: dict[str, Any], mode: str
) -> dict[str, float] | None:
    target = (
        clean(product.get("manufacturerRef"))
        if mode == "reference_text"
        else clean(product.get("name"))
    )
    target_key = key(target)
    if not target_key:
        return None
    search_key = target_key
    if mode == "name_text":
        brand_key = key(product.get("brand"))
        if brand_key and search_key.startswith(f"{brand_key} "):
            search_key = search_key[len(brand_key) + 1 :]
    target_tokens = search_key.split()
    lines = page_lines(page)
    candidates: list[tuple[float, dict[str, Any]]] = []
    for line in lines:
        line_key = key(line["text"])
        if search_key in line_key:
            extra_tokens = max(0, len(line_key.split()) - len(target_tokens))
            score = 140 + len(search_key) - extra_tokens * 8
        else:
            matched = sum(token in line_key.split() for token in target_tokens)
            if matched < max(1, min(2, len(target_tokens))):
                continue
            score = matched * 10
        if mode == "name_text" and line["top"] > page.height * 0.16:
            score += 12
        if line["top"] > page.height * 0.82:
            score -= 80
        candidates.append((score, line))
    if not candidates:
        return None
    _, match = max(candidates, key=lambda item: (item[0], -item[1]["top"]))
    return {
        "x": float(match["x0"]),
        "top": float(match["top"]),
        "width": float(match["x1"] - match["x0"]),
        "height": float(match["bottom"] - match["top"]),
    }


def load_ocr_positions(path: Path) -> dict[int, list[dict[str, Any]]]:
    rows = json.loads(path.read_text())
    result: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        match = re.search(r"page-(\d+)", clean(row.get("file")))
        if match:
            result[int(match.group(1))] = row.get("lines", [])
    return result


def locate_ocr(
    page: pdfplumber.page.Page,
    product: dict[str, Any],
    lines: list[dict[str, Any]],
) -> dict[str, float] | None:
    ref = clean(product.get("manufacturerRef"))
    matches = [
        line
        for line in lines
        if clean(line.get("text")) == ref
        or clean(line.get("text")).startswith(f"{ref} ")
    ]
    if not matches:
        return None
    line = matches[0]
    return {
        "x": float(line["x"]) * page.width,
        "top": (1 - float(line["y"]) - float(line.get("height", 0))) * page.height,
        "width": float(line.get("width", 0)) * page.width,
        "height": float(line.get("height", 0)) * page.height,
    }


def image_candidates(page: Any) -> list[dict[str, Any]]:
    result = []
    for index, image_file in enumerate(page.images):
        pil = image_file.image.copy()
        reference = image_file.indirect_reference
        soft_mask = reference.get("/SMask") if hasattr(reference, "get") else None
        if soft_mask is not None:
            mask_object = soft_mask.get_object()
            mask_width = int(mask_object["/Width"])
            mask_height = int(mask_object["/Height"])
            mask_data = mask_object.get_data()
            if len(mask_data) >= mask_width * mask_height:
                mask = Image.frombytes(
                    "L",
                    (mask_width, mask_height),
                    mask_data[: mask_width * mask_height],
                )
                mask = mask.resize(pil.size, Image.Resampling.LANCZOS)
                pil = pil.convert("RGBA")
                pil.putalpha(mask)
            else:
                pil = pil.convert("RGBA")
        else:
            pil = pil.convert("RGBA")
        result.append(
            {
                "index": index,
                "name": image_file.name.rsplit(".", 1)[0],
                "size": pil.size,
                "image": pil,
                "used": False,
            }
        )
    return result


def pair_placed_images(
    plumber_images: list[dict[str, Any]], pypdf_page: Any
) -> list[dict[str, Any]]:
    candidates = image_candidates(pypdf_page)
    placed = []
    for item in plumber_images:
        name = clean(item.get("name")).lstrip("/")
        size = tuple(item.get("srcsize") or ())
        candidate = next(
            (
                source
                for source in candidates
                if not source["used"] and source["name"] == name and source["size"] == size
            ),
            None,
        )
        if candidate is None:
            candidate = next(
                (
                    source
                    for source in candidates
                    if not source["used"] and source["size"] == size
                ),
                None,
            )
        if candidate is None:
            continue
        candidate["used"] = True
        placed.append({**item, "pil": candidate["image"], "sourceIndex": candidate["index"]})
    return placed


def cluster(values: list[float], tolerance: float) -> list[float]:
    groups: list[list[float]] = []
    for value in sorted(values):
        if groups and abs(value - sum(groups[-1]) / len(groups[-1])) <= tolerance:
            groups[-1].append(value)
        else:
            groups.append([value])
    return [sum(group) / len(group) for group in groups]


def choose_cell_images(
    page: pdfplumber.page.Page,
    placed: list[dict[str, Any]],
    position: dict[str, float],
    page_positions: list[dict[str, float]],
    brand: str,
    product: dict[str, Any],
) -> list[dict[str, Any]]:
    if brand == "DENU":
        printed_page = int(product["sourceDocumentPage"])
        x0 = page.width / 2 if printed_page % 2 else 0
        x1 = page.width if printed_page % 2 else page.width / 2
        row_positions = page_positions
    elif brand == "Myobrace":
        x0, x1 = 0, page.width
        row_positions = page_positions
    else:
        starts = cluster([item["x"] for item in page_positions], page.width * 0.08)
        column = max(index for index, start in enumerate(starts) if start <= position["x"] + 1)
        x0 = 0 if column == 0 else starts[column] - page.width * 0.03
        x1 = (
            page.width
            if column == len(starts) - 1
            else starts[column + 1] - page.width * 0.03
        )
        row_positions = page_positions

    rows = cluster([item["top"] for item in row_positions], page.height * 0.035)
    row = min(range(len(rows)), key=lambda index: abs(rows[index] - position["top"]))
    y0 = max(0, rows[row] - page.height * 0.04)
    y1 = (
        min(page.height, rows[row + 1] - page.height * 0.025)
        if row + 1 < len(rows)
        else page.height * 0.94
    )

    selected = []
    page_area = page.width * page.height
    for item in placed:
        width = float(item["x1"] - item["x0"])
        height = float(item["bottom"] - item["top"])
        area = width * height
        center_x = (float(item["x0"]) + float(item["x1"])) / 2
        center_y = (float(item["top"]) + float(item["bottom"])) / 2
        if not (x0 <= center_x <= x1 and y0 <= center_y <= y1):
            continue
        minimum_area_ratio = 0.00045 if brand == "IQ Dent" else 0.006
        if area < page_area * minimum_area_ratio or area > page_area * 0.19:
            continue
        selected.append(item)
    if len(selected) <= 1:
        return selected

    # A catalogue cell can also contain a distant coating/example illustration.
    # Keep the vertically connected image group closest to the product label.
    groups: list[list[dict[str, Any]]] = []
    remaining = list(selected)
    max_gap = page.height * 0.025
    while remaining:
        group = [remaining.pop(0)]
        changed = True
        while changed:
            changed = False
            for candidate in list(remaining):
                if any(
                    float(candidate["top"]) <= float(member["bottom"]) + max_gap
                    and float(candidate["bottom"]) + max_gap >= float(member["top"])
                    for member in group
                ):
                    group.append(candidate)
                    remaining.remove(candidate)
                    changed = True
        groups.append(group)
    return min(
        groups,
        key=lambda group: abs(
            min(float(item["top"]) for item in group) - position["top"]
        ),
    )


def render_square(selected: list[dict[str, Any]], output: Path) -> dict[str, Any]:
    left = min(float(item["x0"]) for item in selected)
    top = min(float(item["top"]) for item in selected)
    right = max(float(item["x1"]) for item in selected)
    bottom = max(float(item["bottom"]) for item in selected)
    group_width = max(1.0, right - left)
    group_height = max(1.0, bottom - top)
    usable = 1000
    scale = min(usable / group_width, usable / group_height)
    canvas = Image.new("RGBA", (1200, 1200), "white")
    origin_x = (1200 - group_width * scale) / 2
    origin_y = (1200 - group_height * scale) / 2
    for item in selected:
        image = item["pil"].convert("RGBA")
        target_width = max(1, round((float(item["x1"]) - float(item["x0"])) * scale))
        target_height = max(1, round((float(item["bottom"]) - float(item["top"])) * scale))
        image = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
        x = round(origin_x + (float(item["x0"]) - left) * scale)
        y = round(origin_y + (float(item["top"]) - top) * scale)
        canvas.alpha_composite(image, (x, y))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, "WEBP", quality=92, method=6)
    return {
        "width": 1200,
        "height": 1200,
        "selectedEmbeddedImages": len(selected),
        "sourceBounds": [round(left, 2), round(top, 2), round(right, 2), round(bottom, 2)],
    }


def main() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    for previous in PUBLIC_DIR.glob("official-pdf-*.webp"):
        previous.unlink()
    recovered: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []

    for brand, config in SOURCES.items():
        report = json.loads(Path(config["evidence"]).read_text())
        products = report.get("products", [])
        plumber_pdf = pdfplumber.open(config["pdf"])
        pypdf = PdfReader(str(config["pdf"]))
        ocr = load_ocr_positions(config["ocr"]) if config.get("ocr") else {}
        grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for product in products:
            try:
                physical_page = config["page_map"](product.get(config["page_field"]))
                grouped[physical_page].append(product)
            except (TypeError, ValueError):
                review.append(
                    {"brand": brand, "name": product.get("name"), "reason": "INVALID_PAGE"}
                )

        for page_number, page_products in sorted(grouped.items()):
            print(
                f"{brand}: PDF page {page_number}, {len(page_products)} product cards",
                flush=True,
            )
            if page_number < 1 or page_number > len(plumber_pdf.pages):
                for product in page_products:
                    review.append(
                        {
                            "brand": brand,
                            "name": product.get("name"),
                            "reason": "PAGE_OUT_OF_RANGE",
                            "page": page_number,
                        }
                    )
                continue
            page = plumber_pdf.pages[page_number - 1]
            positions: list[tuple[dict[str, Any], dict[str, float]]] = []
            for product in page_products:
                if config["locator"] == "reference_ocr":
                    position = locate_ocr(page, product, ocr.get(page_number, []))
                else:
                    position = locate_native_text(page, product, config["locator"])
                if position:
                    positions.append((product, position))
                else:
                    review.append(
                        {
                            "brand": brand,
                            "name": product.get("name"),
                            "manufacturerRef": product.get("manufacturerRef"),
                            "reason": "PRODUCT_LABEL_NOT_LOCATED",
                            "page": page_number,
                        }
                    )
            if not positions:
                continue
            placed = pair_placed_images(page.images, pypdf.pages[page_number - 1])
            all_positions = [position for _, position in positions]
            for product, position in positions:
                selected = choose_cell_images(
                    page, placed, position, all_positions, brand, product
                )
                if not selected:
                    review.append(
                        {
                            "brand": brand,
                            "name": product.get("name"),
                            "manufacturerRef": product.get("manufacturerRef"),
                            "reason": "NO_PRODUCT_IMAGE_IN_CELL",
                            "page": page_number,
                        }
                    )
                    continue
                identity = clean(
                    product.get("manufacturerRef")
                    or product.get("officialProductId")
                    or product.get("name")
                )
                output_name = (
                    f"official-pdf-{slug(brand)}-{slug(identity)}-{page_number}.webp"
                )
                output = PUBLIC_DIR / output_name
                details = render_square(selected, output)
                image_url = f"{PRODUCTION_ORIGIN}/catalog/products/{output_name}"
                recovered_product = {
                    **product,
                    "sourceImageUrl": image_url,
                    "imageUrls": image_url,
                    "imageCount": 1,
                    "status": "OFFICIAL_PDF_IMAGE_RECOVERED",
                    "photoEvidence": {
                        "method": "OFFICIAL_PDF_EMBEDDED_IMAGE_RECONSTRUCTION",
                        "sourcePdfUrl": product.get("sourcePageUrl") or report.get("sourceUrl"),
                        "physicalPdfPage": page_number,
                        "cataloguePage": product.get(config["page_field"]),
                        **details,
                    },
                }
                recovered.append(recovered_product)

        plumber_pdf.close()

    hashes: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for product in recovered:
        filename = clean(product.get("sourceImageUrl")).rsplit("/", 1)[-1]
        asset = PUBLIC_DIR / filename
        if asset.exists():
            hashes[hashlib.sha256(asset.read_bytes()).hexdigest()].append(product)
    duplicate_ids = {
        id(product)
        for products in hashes.values()
        if len(products) > 1
        for product in products
    }
    if duplicate_ids:
        for products in hashes.values():
            if len(products) <= 1:
                continue
            for product in products:
                review.append(
                    {
                        "brand": product.get("brand"),
                        "name": product.get("name"),
                        "manufacturerRef": product.get("manufacturerRef"),
                        "reason": "DUPLICATE_EXTRACTED_IMAGE_REVIEW_REQUIRED",
                        "sourceImageUrl": product.get("sourceImageUrl"),
                        "duplicateGroupSize": len(products),
                    }
                )
        recovered = [product for product in recovered if id(product) not in duplicate_ids]

    evidence = {
        "generatedAt": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "sourceType": "OFFICIAL_MANUFACTURER_PDF_EMBEDDED_IMAGES",
        "policy": {
            "noGeneratedPixels": True,
            "noPageScreenshots": True,
            "productCellIdentityRequired": True,
            "unmatchedProductsRemainOnModeration": True,
        },
        "totals": {
            "recovered": len(recovered),
            "reviewRequired": len(review),
            "byBrand": {
                brand: sum(1 for product in recovered if product.get("brand") == brand)
                for brand in SOURCES
            },
        },
        "products": recovered,
    }
    report = {**evidence, "review": review}
    EVIDENCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_PATH.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(evidence["totals"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
