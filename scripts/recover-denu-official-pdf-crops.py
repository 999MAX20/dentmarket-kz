#!/usr/bin/env python3
"""Recover exact DENU product photos from their verified catalogue spreads.

Only the product packshot area is cropped. Catalogue headings, descriptions,
clinical examples and neighbouring product cells are excluded. Cards that do
not have a manually verified crop remain on moderation.
"""

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
PDF = ROOT / "tmp/pdfs/product-photo-recovery/denu.pdf"
SOURCE = ROOT / "data/catalog-evidence/denu-manufacturer-catalog.json"
EVIDENCE = ROOT / "data/catalog-evidence/denu-official-pdf-crops.json"
REPORT = ROOT / "data/reports/denu-official-pdf-crops.json"
PUBLIC = ROOT / "apps/buyer-web/public/catalog/products"
ORIGIN = "https://dentmarket-shop.vercel.app"

# Coordinates are normalized to the full physical PDF spread.
CROPS: dict[str, tuple[int, tuple[float, float, float, float]]] = {
    "Denu Composite Resin": (7, (0.300, 0.265, 0.480, 0.430)),
    "Denu Composite Resin Kit": (7, (0.050, 0.725, 0.465, 0.850)),
    "Denu Temp Flow": (7, (0.760, 0.700, 0.985, 0.855)),
    "Denu Etch-37": (9, (0.282, 0.295, 0.475, 0.500)),
    "Denu Bond": (9, (0.280, 0.675, 0.465, 0.840)),
    "Denu Temp Cement NE": (9, (0.785, 0.200, 0.985, 0.300)),
    "Denu Temp Cement EZ": (9, (0.820, 0.420, 0.985, 0.495)),
    "Denu Temp Cement Implant": (9, (0.770, 0.590, 0.985, 0.665)),
    "Denu Fluoride Gel": (12, (0.805, 0.245, 0.975, 0.465)),
    "Denu Fluoride Gel Tray": (12, (0.780, 0.620, 0.965, 0.790)),
    "Denu Pumice Paste": (13, (0.250, 0.720, 0.465, 0.940)),
    "Denu Bite Block Cover": (14, (0.810, 0.440, 0.940, 0.600)),
}


def slug(value: str) -> str:
    return "".join(
        character.lower() if character.isalnum() else "-"
        for character in value
    ).strip("-").replace("--", "-")


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


def square_crop(
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
    recovered: list[dict[str, Any]] = []
    review: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="denu-pdf-crops-") as temporary:
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
            filename = f"official-denu-{slug(name)}.webp"
            output = PUBLIC / filename
            details = square_crop(pages[page_number], bounds, output)
            image_url = f"{ORIGIN}/catalog/products/{filename}"
            recovered.append(
                {
                    **product,
                    "sourceImageUrl": image_url,
                    "imageUrls": image_url,
                    "imageCount": 1,
                    "status": "VERIFIED_DENU_PDF_PACKSHOT_RECOVERED",
                    "photoEvidence": {
                        "method": "VERIFIED_PRODUCT_ONLY_CROP_FROM_DENU_CATALOGUE",
                        "sourcePdfUrl": product.get("sourcePageUrl"),
                        "physicalPdfPage": page_number,
                        **details,
                    },
                }
            )
    evidence = {
        "brand": "DENU",
        "manufacturer": source.get("manufacturer"),
        "sourceType": "VERIFIED_DENU_CATALOGUE_PRODUCT_ONLY_CROPS",
        "sourceUrl": source.get("sourceUrl"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "exactNamedProductCellRequired": True,
            "productOnlyCrop": True,
            "neighbouringProductsExcluded": True,
            "noGeneratedPixels": True,
            "unmatchedProductsRemainOnModeration": True,
        },
        "totals": {
            "targets": len(CROPS),
            "recovered": len(recovered),
            "review": len(review),
        },
        "products": recovered,
    }
    EVIDENCE.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n")
    REPORT.write_text(
        json.dumps({**evidence, "review": review}, ensure_ascii=False, indent=2)
        + "\n"
    )
    print(json.dumps(evidence["totals"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
