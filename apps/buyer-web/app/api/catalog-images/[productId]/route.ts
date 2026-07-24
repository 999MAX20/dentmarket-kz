import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { readPublishedCatalog } from "../../../lib/published-catalog-server";

export const runtime = "nodejs";

function median(values: number[]) {
  if (values.length === 0) return 255;
  values.sort((left, right) => left - right);
  return values[Math.floor(values.length / 2)];
}

async function whitenConnectedBorderBackground(bytes: Buffer) {
  const prepared = await sharp(bytes, { failOn: "warning" })
    .autoOrient()
    .flatten({ background: "#ffffff" })
    .resize({
      width: 1400,
      height: 1400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = prepared;
  const { width, height, channels } = info;

  // Небольшие исходники не содержат достаточно данных для безопасного
  // отделения светлого товара от светлого фона. На таких фото агрессивная
  // заливка стирала белые крышки, флаконы и края упаковки. Сохраняем исходное
  // изображение целиком и только приводим его к единому холсту ниже.
  if (width < 500 || height < 500) return prepared;

  const samples: [number[], number[], number[]] = [[], [], []];

  const samplePixel = (pixel: number) => {
    const offset = pixel * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    if ((red + green + blue) / 3 <= 175) return;
    samples[0].push(red);
    samples[1].push(green);
    samples[2].push(blue);
  };

  for (let x = 0; x < width; x += 1) {
    samplePixel(x);
    samplePixel((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    samplePixel(y * width);
    samplePixel(y * width + width - 1);
  }

  const background = samples.map(median);
  const backgroundBrightness =
    (background[0] + background[1] + background[2]) / 3;
  const backgroundChroma =
    Math.max(...background) - Math.min(...background);
  if (
    backgroundBrightness < 185 ||
    backgroundBrightness > 251.5 ||
    backgroundChroma > 38
  ) {
    return prepared;
  }

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let queueHead = 0;
  let queueTail = 0;

  const crossesObjectEdge = (
    pixel: number,
    red: number,
    green: number,
    blue: number,
  ) => {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const neighbours: number[] = [];
    if (x > 0) neighbours.push(pixel - 1);
    if (x + 1 < width) neighbours.push(pixel + 1);
    if (y > 0) neighbours.push(pixel - width);
    if (y + 1 < height) neighbours.push(pixel + width);
    return neighbours.some((neighbour) => {
      const offset = neighbour * channels;
      return (
        Math.abs(data[offset] - red) > 20 ||
        Math.abs(data[offset + 1] - green) > 20 ||
        Math.abs(data[offset + 2] - blue) > 20
      );
    });
  };

  const belongsToBackground = (pixel: number) => {
    if (visited[pixel]) return false;
    const offset = pixel * channels;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const brightness = (red + green + blue) / 3;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const redDistance = red - background[0];
    const greenDistance = green - background[1];
    const blueDistance = blue - background[2];
    const distanceSquared =
      redDistance * redDistance +
      greenDistance * greenDistance +
      blueDistance * blueDistance;
    return (
      brightness > 175 &&
      chroma < 42 &&
      distanceSquared < 4900 &&
      !crossesObjectEdge(pixel, red, green, blue)
    );
  };

  const enqueue = (pixel: number) => {
    if (!belongsToBackground(pixel)) return;
    visited[pixel] = 1;
    queue[queueTail] = pixel;
    queueTail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (queueHead < queueTail) {
    const pixel = queue[queueHead];
    queueHead += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }

  if (queueTail < width * height * 0.02) return prepared;

  const mask = Buffer.alloc(width * height);
  for (let pixel = 0; pixel < visited.length; pixel += 1) {
    mask[pixel] = visited[pixel] ? 255 : 0;
  }
  const featheredMask = await sharp(mask, {
    raw: { width, height, channels: 1 },
  })
    .blur(1.1)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const overlay = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    overlay[offset] = 255;
    overlay[offset + 1] = 255;
    overlay[offset + 2] = 255;
    overlay[offset + 3] =
      featheredMask.data[pixel * featheredMask.info.channels];
  }

  return sharp(data, { raw: { width, height, channels } })
    .composite([
      {
        input: overlay,
        raw: { width, height, channels: 4 },
      },
    ])
    .raw()
    .toBuffer({ resolveWithObject: true });
}

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

  const prepared = await whitenConnectedBorderBackground(bytes);
  const { width, height, channels } = prepared.info;
  const sourceHost = new URL(sourceUrl).hostname.toLocaleLowerCase("en");

  // This source adds a detached advertising logo to the empty upper-left
  // canvas. Remove only that overlay; factory markings on the product stay.
  if (sourceHost === "img.waimaoniu.net" && width >= 240 && height >= 240) {
    const maskWidth = Math.round(width * 0.4);
    const maskHeight = Math.round(height * 0.16);
    for (let y = 0; y < maskHeight; y += 1) {
      for (let x = 0; x < maskWidth; x += 1) {
        const offset = (y * width + x) * channels;
        prepared.data[offset] = 255;
        prepared.data[offset + 1] = 255;
        prepared.data[offset + 2] = 255;
      }
    }
  }

  return sharp(prepared.data, { raw: { width, height, channels } })
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
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  const { productId } = await context.params;
  const catalog = await readPublishedCatalog();
  const product = catalog.products.find(({ id }) => id === productId);
  const requestedVariantId = request.nextUrl.searchParams.get("variant");
  const variantImageUrl = requestedVariantId
    ? product?.variants.find(({ id }) => id === requestedVariantId)?.imageUrl
    : null;
  const imageUrl = variantImageUrl ?? product?.imageUrl;
  if (!imageUrl || !/^https?:\/\//iu.test(imageUrl)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const image = await correctedProductImage(imageUrl);
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
    return NextResponse.redirect(imageUrl, 307);
  }
}
