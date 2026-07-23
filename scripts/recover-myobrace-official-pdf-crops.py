#!/usr/bin/env python3
"""Recover five exact Myobrace appliance visuals from the official catalogue."""

from __future__ import annotations

import hashlib
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "tmp/pdfs/product-photo-recovery/myobrace.pdf"
SOURCE = ROOT / "data/catalog-evidence/myobrace-manufacturer-catalog.json"
EVIDENCE = ROOT / "data/catalog-evidence/myobrace-official-pdf-crops.json"
REPORT = ROOT / "data/reports/myobrace-official-pdf-crops.json"
PUBLIC = ROOT / "apps/buyer-web/public/catalog/products"
ORIGIN = "https://dentmarket-shop.vercel.app"

CROPS: dict[str, tuple[int, tuple[float, float, float, float]]] = {
    "Myobrace for Teens T1": (6, (0.190, 0.445, 0.450, 0.600)),
    "Myobrace for Teens T1BWS": (6, (0.190, 0.630, 0.450, 0.770)),
    "Myobrace Tooth Alignment System T3N": (7, (0.080, 0.650, 0.330, 0.780)),
    "Myobrace Permanent Dentition Class III P-3N": (
        9,
        (0.190, 0.445, 0.450, 0.590),
    ),
    "Myobrace Permanent Dentition Class III P-3": (
        9,
        (0.190, 0.625, 0.450, 0.750),
    ),
}


def slug(value: str) -> str:
    return (
        "".join(
            character.lower() if character.isalnum() else "-"
            for character in value
        )
        .strip("-")
        .replace("--", "-")
    )


def render_page(page_number: int, directory: Path) -> Image.Image:
    prefix = directory / f"page-{page_number}"
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
            str(PDF),
            str(prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return Image.open(prefix.with_suffix(".png")).convert("RGB")


def recover(
    page: Image.Image, bounds: tuple[float, float, float, float], output: Path
) -> dict[str, Any]:
    width, height = page.size
    pixels = (
        round(bounds[0] * width),
        round(bounds[1] * height),
        round(bounds[2] * width),
        round(bounds[3] * height),
    )
    crop = page.crop(pixels)
    crop.thumbnail((1040, 1040), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (1200, 1200), "white")
    canvas.paste(crop, ((1200 - crop.width) // 2, (1200 - crop.height) // 2))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "WEBP", quality=94, method=6)
    return {
        "width": 1200,
        "height": 1200,
        "normalizedSourceBounds": list(bounds),
        "sourcePixelBoundsAt300Dpi": list(pixels),
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
    }


def main() -> None:
    source = json.loads(SOURCE.read_text())
    products_by_name = {
        str(product.get("name", "")).strip(): product
        for product in source.get("products", [])
    }
    recovered_products: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="myobrace-pdf-") as temporary:
        directory = Path(temporary)
        pages = {
            page_number: render_page(page_number, directory)
            for page_number in sorted({page for page, _ in CROPS.values()})
        }
        for name, (page_number, bounds) in CROPS.items():
            product = products_by_name.get(name)
            if product is None:
                review.append({"name": name, "reason": "SOURCE_PRODUCT_NOT_FOUND"})
                continue
            filename = f"official-myobrace-{slug(product['manufacturerRef'])}.webp"
            output = PUBLIC / filename
            details = recover(pages[page_number], bounds, output)
            image_url = f"{ORIGIN}/catalog/products/{filename}"
            recovered_products.append(
                {
                    **product,
                    "sourceImageUrl": image_url,
                    "imageUrls": image_url,
                    "imageCount": 1,
                    "status": "VERIFIED_MYOBRACE_APPLIANCE_CROP_RECOVERED",
                    "photoEvidence": {
                        "method": "VERIFIED_PRODUCT_ONLY_CROP_FROM_OFFICIAL_CATALOG",
                        "sourcePdfUrl": product.get("sourcePageUrl"),
                        "physicalPdfPage": page_number,
                        **details,
                    },
                }
            )
    evidence = {
        "brand": "Myobrace",
        "manufacturer": source.get("manufacturer"),
        "sourceType": "OFFICIAL_MYOBRACE_CATALOG_PRODUCT_ONLY_CROPS",
        "sourceUrl": source.get("sourceUrl"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "exactModelLabelAndStageRequired": True,
            "productOnlyCrop": True,
            "neighbouringStagesExcluded": True,
            "noGeneratedPixels": True,
            "unmatchedProductsRemainOnModeration": True,
        },
        "totals": {
            "targets": len(CROPS),
            "recovered": len(recovered_products),
            "review": len(review),
        },
        "products": recovered_products,
    }
    EVIDENCE.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    REPORT.write_text(
        json.dumps({**evidence, "review": review}, ensure_ascii=False, indent=2)
        + "\n"
    )
    print(json.dumps(evidence["totals"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
