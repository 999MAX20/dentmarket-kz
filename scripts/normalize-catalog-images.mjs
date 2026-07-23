#!/usr/bin/env node

/**
 * Downloads product images from supplier product pages, normalizes them to a
 * single protected catalog asset format, and updates ProductMedia metadata.
 *
 * Usage:
 *   node scripts/normalize-catalog-images.mjs --limit 100 --concurrency 6
 *
 * The script deliberately keeps the supplier page URL and rights status in
 * metadata. A public marketplace must still clear image rights before using
 * SOURCE_UNVERIFIED assets in paid advertising or private-label materials.
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDir = join(projectRoot, "apps/buyer-web/public/catalog/products");
const localStorageDir = join(projectRoot, ".local-storage/catalog/products");
const restBase = "https://tlxxicjzppflpkcgnauo.supabase.co/rest/v1";
const args = new Map(process.argv.slice(2).flatMap((value, index, values) => {
  if (!value.startsWith("--")) return [];
  return [[value.slice(2), values[index + 1]?.startsWith("--") ? "true" : values[index + 1] ?? "true"]];
}));
const limit = Number(args.get("limit") ?? Number.POSITIVE_INFINITY);
const concurrency = Math.max(1, Number(args.get("concurrency") ?? 6));
const userAgent = "DentMarketCatalogImageBot/1.0 (+supplier-image-import)";

function serviceRoleKey() {
  return JSON.parse(execFileSync("pnpm", ["dlx", "supabase", "projects", "api-keys", "--project-ref", "tlxxicjzppflpkcgnauo"], { encoding: "utf8" })).keys.find((key) => key.id === "service_role").api_key;
}

const apiKey = serviceRoleKey();
const restHeaders = { apikey: apiKey, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

async function restPage(table, query, from) {
  const response = await fetch(`${restBase}/${table}?${query}`, { headers: { ...restHeaders, Range: `${from}-${from + 999}` } });
  if (!response.ok) throw new Error(`${table} ${response.status}: ${await response.text()}`);
  return response.json();
}

async function restAll(table, query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const page = await restPage(table, query, from);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function absoluteUrl(value, pageUrl) {
  try {
    const url = new URL(value, pageUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function validSourcePage(product) {
  const candidates = [
    product.externalMetadata?.sourceUrl,
    ...(Array.isArray(product.externalMetadata?.sourceRecords)
      ? product.externalMetadata.sourceRecords.map((record) => record?.sourceUrl)
      : []),
  ];
  return candidates.find((value) => /^https?:\/\//i.test(String(value ?? ""))) ?? null;
}

function htmlImageCandidates(html, pageUrl) {
  const candidates = [];
  const metaPattern = /<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
  const metaPatternReversed = /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*>/gi;
  for (const match of html.matchAll(metaPattern)) candidates.push(match[1]);
  for (const match of html.matchAll(metaPatternReversed)) candidates.push(match[1]);
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (/(logo|header|footer|menu|social|payment|phone|contact|messenger|banner)/i.test(tag)) continue;
    const source = tag.match(/(?:src|data-src|data-original)=["']([^"']+)["']/i)?.[1];
    if (source) candidates.push(source);
  }
  return [...new Set(candidates.map((value) => absoluteUrl(value, pageUrl)).filter(Boolean))]
    .filter((value) => !/(logo|favicon|icon|sprite|avatar|cart|basket|instagram|whatsapp|loading|pixel|captcha|phone[-_]?ico|placeholder|no[-_]?image|default[-_]?image)/i.test(value))
    .filter((value) => !/\/(?:themes?|templates?|assets\/icons?|images?\/icons?)\//i.test(value))
    .filter((value) => !/\.(svg|gif)(?:\?|$)/i.test(value));
}

async function fetchImageFromPage(pageUrl) {
  const page = await fetch(pageUrl, { headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" }, redirect: "follow" });
  if (!page.ok) throw new Error(`page ${page.status}`);
  const html = await page.text();
  const candidates = htmlImageCandidates(html, page.url || pageUrl);
  for (const candidate of candidates.slice(0, 12)) {
    try {
      const image = await fetch(candidate, { headers: { "user-agent": userAgent, accept: "image/avif,image/webp,image/png,image/jpeg,*/*" }, redirect: "follow" });
      if (!image.ok) continue;
      const contentType = image.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) continue;
      const bytes = Buffer.from(await image.arrayBuffer());
      if (bytes.byteLength < 2_000) continue;
      return { bytes, sourceUrl: candidate, pageUrl: page.url || pageUrl };
    } catch {
      // Try the next candidate from the same supplier page.
    }
  }
  throw new Error("no product image candidate");
}

const overlayHosts = new Set([
  "denti.kz",
  "www.denti.kz",
  "img.waimaoniu.net",
  "dental-market.kz",
  "www.dental-market.kz",
]);

async function normalize(bytes, sourceUrl, pageUrl) {
  const sharpPackage = (await readdir(join(projectRoot, "node_modules/.pnpm"))).find((name) => name.startsWith("sharp@"));
  if (!sharpPackage) throw new Error("sharp is not installed; run pnpm install first");
  const requireSharp = createRequire(join(projectRoot, "node_modules/.pnpm", sharpPackage, "node_modules/sharp/package.json"));
  const sharp = requireSharp("sharp");
  const metadata = await sharp(bytes).metadata();
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const sourceHost = new URL(sourceUrl).hostname.toLocaleLowerCase("en");
  let image = sharp(bytes).autoOrient().flatten({ background: "#ffffff" });
  if (
    overlayHosts.has(sourceHost) &&
    !/\/(?:aktsii|promotions?|special-offers?)(?:\/|$)/iu.test(pageUrl) &&
    height >= 240 &&
    width >= 240
  ) {
    const top = Math.max(1, Math.round(height * 0.12));
    image = image.extract({ left: 0, top, width, height: height - top });
  }
  return image
    .trim({ background: "#ffffff", threshold: 10 })
    .resize(1000, 1000, {
      fit: "contain",
      background: "#ffffff",
    })
    .extend({
      top: 100,
      right: 100,
      bottom: 100,
      left: 100,
      background: "#ffffff",
    })
    .webp({ quality: 88, effort: 4 })
    .toBuffer({ resolveWithObject: true });
}

async function updateMedia(id, payload) {
  const response = await fetch(`${restBase}/ProductMedia?id=eq.${id}`, { method: "PATCH", headers: { ...restHeaders, Prefer: "return=minimal" }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`media ${id} ${response.status}: ${await response.text()}`);
}

const products = await restAll("Product", "select=id,canonicalName,externalMetadata&slug=like.canonical-*");
const media = await restAll("ProductMedia", "select=id,productId,status,sourceUrl,metadata");
const mediaByProduct = new Map(media.map((item) => [item.productId, item]));
const jobs = products
  .map((product) => ({ product, media: mediaByProduct.get(product.id), pageUrl: validSourcePage(product) }))
  .filter((job) => job.media && job.pageUrl && job.media.metadata?.exactProductPhoto !== true)
  .slice(0, limit);

await mkdir(outputDir, { recursive: true });
await mkdir(localStorageDir, { recursive: true });
let completed = 0;
let exact = 0;
let failed = 0;
let cursor = 0;
async function worker() {
  while (true) {
    const index = cursor++;
    if (index >= jobs.length) return;
    const { product, media: item, pageUrl } = jobs[index];
    try {
      const source = await fetchImageFromPage(pageUrl);
      const normalized = await normalize(
        source.bytes,
        source.sourceUrl,
        source.pageUrl,
      );
      const storageKey = `catalog/products/${product.id}.webp`;
      await writeFile(join(projectRoot, "apps/buyer-web/public", storageKey), normalized.data);
      await writeFile(join(projectRoot, ".local-storage", storageKey), normalized.data);
      await updateMedia(item.id, {
        sourceUrl: `/${storageKey}`,
        originalStorageKey: source.sourceUrl,
        normalizedStorageKey: storageKey,
        originalName: source.sourceUrl.split("/").pop()?.split("?")[0] ?? `${product.id}.source`,
        mimeType: "image/webp",
        width: normalized.info.width,
        height: normalized.info.height,
        status: "READY",
        metadata: {
          ...(item.metadata ?? {}),
          kind: "supplier-product-photo",
          aiGenerated: false,
          exactProductPhoto: true,
          rightsStatus: "SOURCE_UNVERIFIED",
          sourcePageUrl: source.pageUrl,
          sourceImageUrl: source.sourceUrl,
          normalizedFormat: "webp",
          normalizedSize: "1200x1200",
          visualCompliance: "auto_corrected",
          visualComplianceRules: [
            "detached_brand_strip_removed",
            "inner_canvas_trimmed",
            "product_centered",
          ],
          protectedDelivery: "frontend-friction-only",
        },
        updatedAt: new Date().toISOString(),
      });
      exact += 1;
    } catch (error) {
      failed += 1;
      if (failed <= 20) console.warn(`skip ${product.canonicalName}: ${error.message}`);
    } finally {
      completed += 1;
      if (completed % 25 === 0 || completed === jobs.length) console.log(`${completed}/${jobs.length} processed; exact=${exact}; failed=${failed}`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length || 1) }, worker));
console.log(JSON.stringify({ candidates: jobs.length, exact, failed, outputDir }, null, 2));
