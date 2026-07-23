#!/usr/bin/env python3
"""Create exact Gapadent family visuals from a verified specialist catalogue."""

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
PDF = ROOT / "tmp/pdfs/product-photo-recovery/gapadent.pdf"
SOURCE = ROOT / "data/catalog-evidence/gapadent-manufacturer-catalog.json"
EVIDENCE = ROOT / "data/catalog-evidence/gapadent-official-catalog-images.json"
REPORT = ROOT / "data/reports/gapadent-official-catalog-images.json"
PUBLIC = ROOT / "apps/buyer-web/public/catalog/products"
ORIGIN = "https://dentmarket-shop.vercel.app"

# Each family receives only the packshot or point diagram from its own
# catalogue section. The combo image deliberately joins the three exact
# components shown in the Endo Aide section.
VISUALS: dict[str, list[tuple[float, float, float, float]]] = {
    "Бумажные штифты для файлов ProTaper": [(0.760, 0.500, 0.940, 0.550)],
    "Бумажные штифты конусности 04 и 06": [(0.480, 0.505, 0.620, 0.540)],
    "Бумажные штифты Endo Aide": [(0.170, 0.385, 0.350, 0.475)],
    "Гуттаперчевые штифты для файлов ProTaper": [(0.400, 0.310, 0.630, 0.337)],
    "Гуттаперчевые штифты для файлов WaveOne": [(0.680, 0.120, 0.920, 0.155)],
    "Гуттаперчевые штифты конусности 04 и 06": [(0.400, 0.120, 0.610, 0.155)],
    "Гуттаперчевые штифты повышенной конусности": [(0.680, 0.295, 0.920, 0.322)],
    "Гуттаперчевые штифты Endo Aide": [(0.175, 0.130, 0.345, 0.270)],
    "Набор Endo Aide с гуттаперчевыми и бумажными штифтами": [
        (0.175, 0.130, 0.345, 0.270),
        (0.170, 0.385, 0.350, 0.475),
        (0.170, 0.755, 0.350, 0.835),
    ],
    "Органайзер Endo Aide": [(0.175, 0.130, 0.345, 0.270)],
}


def slug(value: str) -> str:
    result = "".join(
        character.lower() if character.isalnum() else "-"
        for character in value
    )
    while "--" in result:
        result = result.replace("--", "-")
    return result.strip("-")[:100]


def render_page(directory: Path) -> Image.Image:
    prefix = directory / "gapadent"
    subprocess.run(
        [
            "pdftoppm",
            "-f",
            "1",
            "-l",
            "1",
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


def compose(
    page: Image.Image,
    bounds_list: list[tuple[float, float, float, float]],
    output: Path,
) -> dict[str, Any]:
    source_width, source_height = page.size
    crops = []
    pixel_bounds = []
    for bounds in bounds_list:
        pixels = (
            round(bounds[0] * source_width),
            round(bounds[1] * source_height),
            round(bounds[2] * source_width),
            round(bounds[3] * source_height),
        )
        pixel_bounds.append(list(pixels))
        crops.append(page.crop(pixels))
    canvas = Image.new("RGB", (1200, 1200), "white")
    if len(crops) == 1:
        crop = crops[0]
        crop.thumbnail((1040, 1040), Image.Resampling.LANCZOS)
        canvas.paste(crop, ((1200 - crop.width) // 2, (1200 - crop.height) // 2))
    else:
        slot_width = 1040 // len(crops)
        x = 80
        for crop in crops:
            crop.thumbnail((slot_width - 28, 920), Image.Resampling.LANCZOS)
            canvas.paste(crop, (x + (slot_width - crop.width) // 2, (1200 - crop.height) // 2))
            x += slot_width
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, "WEBP", quality=94, method=6)
    return {
        "width": 1200,
        "height": 1200,
        "componentCount": len(crops),
        "normalizedSourceBounds": [list(bounds) for bounds in bounds_list],
        "sourcePixelBoundsAt300Dpi": pixel_bounds,
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
    with tempfile.TemporaryDirectory(prefix="gapadent-pdf-") as temporary:
        page = render_page(Path(temporary))
        for name, bounds_list in VISUALS.items():
            product = products_by_name.get(name)
            if product is None:
                review.append({"name": name, "reason": "SOURCE_PRODUCT_NOT_FOUND"})
                continue
            filename = f"official-gapadent-{slug(name)}.webp"
            output = PUBLIC / filename
            details = compose(page, bounds_list, output)
            image_url = f"{ORIGIN}/catalog/products/{filename}"
            recovered.append(
                {
                    **product,
                    "sourceImageUrl": image_url,
                    "imageUrls": image_url,
                    "imageCount": 1,
                    "status": "VERIFIED_GAPADENT_CATALOG_VISUAL_RECOVERED",
                    "photoEvidence": {
                        "method": "VERIFIED_EXACT_FAMILY_VISUAL_FROM_SPECIALIST_CATALOG",
                        "sourcePdfUrl": product.get("sourcePageUrl"),
                        "physicalPdfPage": 1,
                        **details,
                    },
                }
            )
    evidence = {
        "brand": "Gapadent",
        "manufacturer": source.get("manufacturer"),
        "sourceType": "VERIFIED_SPECIALIST_GAPADENT_CATALOG_IMAGES",
        "sourceUrl": source.get("sourceUrl"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "policy": {
            "exactNamedFamilySectionRequired": True,
            "manufacturerReferencesRemainDistributorReferences": True,
            "neighbouringFamiliesExcluded": True,
            "noGeneratedPixels": True,
            "unmatchedProductsRemainOnModeration": True,
        },
        "totals": {
            "targets": len(VISUALS),
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
