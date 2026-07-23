import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { readPublishedCatalog } from "../../../lib/published-catalog-server";

export const runtime = "nodejs";

async function correctedProductImage(
  sourceUrl: string,
) {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "image/avif,image/webp,image/png,image/jpeg,*/*",
      "user-agent": "DentMarketCatalogImageCompliance/2.0",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
    cache: "force-cache",
  });
  if (!response.ok) throw new Error(`Image source returned ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) throw new Error("Source is not an image");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength < 1_000 || bytes.byteLength > 20_000_000) {
    throw new Error("Image size is outside the catalog limits");
  }

  let image = sharp(bytes, { failOn: "warning" }).autoOrient().flatten({
    background: "#ffffff",
  });

  return image
    .trim({ background: "#ffffff", threshold: 10 })
    .resize(760, 760, {
      fit: "contain",
      position: "centre",
      background: "#ffffff",
    })
    .extend({
      top: 70,
      right: 70,
      bottom: 70,
      left: 70,
      background: "#ffffff",
    })
    .webp({ quality: 88, effort: 4 })
    .toBuffer();
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId } = await context.params;
  const catalog = await readPublishedCatalog();
  const product = catalog.products.find(({ id }) => id === productId);
  if (!product?.imageUrl || !/^https?:\/\//iu.test(product.imageUrl)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const image = await correctedProductImage(product.imageUrl);
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control":
          "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
        "X-DentMarket-Image-Compliance": "corrected",
      },
    });
  } catch {
    // Карточка не блокируется: если коррекция временно недоступна, отдаём
    // исходник, а следующий запрос CDN повторит обработку.
    return NextResponse.redirect(product.imageUrl, 307);
  }
}
