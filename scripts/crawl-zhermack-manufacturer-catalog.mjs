import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.zhermack.com";
const sitemapUrl = `${baseUrl}/product-sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/zhermack-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/zhermack-manufacturer-catalog-queue.csv");
const concurrency = Math.max(1, Number(process.env.ZHERMACK_CONCURRENCY || 10));
const userAgent = "DentMarket Kazakhstan manufacturer catalog audit/1.0";
const decode = (value) => String(value ?? "").replace(/<br\s*\/?\s*>/giu, " ").replace(/<[^>]+>/gu, " ")
  .replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'")
  .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
async function requestText(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(35_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return { html: await response.text(), finalUrl: response.url };
    } catch (error) { lastError = error; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 450)); }
  }
  throw lastError;
}
async function pool(items, worker) {
  const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) { const index = cursor++; if (index >= items.length) return;
      try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; }
    }
  })); return output;
}
const { html: sitemap } = await requestText(sitemapUrl);
const sourceUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))]
  .filter((url) => /^\/en\/product\/[^/]+\/$/u.test(new URL(url).pathname));
const crawled = await pool(sourceUrls, async (requestedUrl) => {
  const { html, finalUrl } = await requestText(requestedUrl);
  const canonicalUrl = decode(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/iu)?.[1]) || finalUrl;
  if (!/\/en\/product\/[^/]+\/$/u.test(new URL(canonicalUrl).pathname)) return { skipped: true, sourcePageUrl: requestedUrl, finalUrl };
  const name = decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/iu)?.[1]);
  const description = decode(html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/iu)?.[1]);
  const sourceImageUrlRaw = decode(html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/iu)?.[1]);
  const sourceImageUrl = sourceImageUrlRaw ? new URL(sourceImageUrlRaw, baseUrl).href : "";
  const refs = [...new Set([...decode(html).matchAll(/\b[A-Z]{1,3}\d{5,8}\b/gu)].map((match) => match[0]))];
  const slug = new URL(canonicalUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
  const breadcrumbs = [...html.matchAll(/<p[^>]+id=["']breadcrumbs["'][^>]*>([\s\S]*?)<\/p>/giu)].flatMap((match) => [...match[1].matchAll(/<a[^>]*>([^<]+)<\/a>/gu)].map((item) => decode(item[1])));
  if (!name || !slug) throw new Error(`${requestedUrl}: product identity not found`);
  return {
    officialProductId: slug, brand: "Zhermack", manufacturer: "Zhermack S.p.A.", name,
    manufacturerRef: refs[0] ?? "", manufacturerRefs: refs.join(" | "), variantCount: Math.max(1, refs.length),
    variants: refs.map((manufacturerRef) => ({ manufacturerRef, label: manufacturerRef })), categoryPath: breadcrumbs.slice(1, -1).join(" > "),
    description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl: canonicalUrl,
    kzEvidence: "BRAND_PRESENTED_BY_KAZAKHSTAN_DISTRIBUTORS_AT_CADEX",
    status: !sourceImageUrl ? "PHOTO_REQUIRED" : !refs.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "KZ_SKU_EVIDENCE_REQUIRED",
  };
});
const errors = crawled.filter((record) => record.error);
const skipped = crawled.filter((record) => record.skipped);
const products = [
  ...crawled.filter((record) => !record.error && !record.skipped),
  ...errors.map((record) => {
    const slug = new URL(record.sourcePageUrl).pathname.split("/").filter(Boolean).at(-1) ?? "";
    return {
      officialProductId: slug, brand: "Zhermack", manufacturer: "Zhermack S.p.A.",
      name: slug.split("-").map((part) => part.length <= 3 ? part.toUpperCase() : `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" "),
      manufacturerRef: "", manufacturerRefs: "", variantCount: 1, variants: [], categoryPath: "",
      description: "", sourceImageUrl: "", imageUrls: "", imageCount: 0, sourcePageUrl: record.sourcePageUrl,
      kzEvidence: "BRAND_PRESENTED_BY_KAZAKHSTAN_DISTRIBUTORS_AT_CADEX", status: "SOURCE_PAGE_PHOTO_REFERENCE_REVIEW_REQUIRED",
    };
  }),
];
const report = { brand: "Zhermack", manufacturer: "Zhermack S.p.A.", sourceType: "MANUFACTURER_CATALOG", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: sourceUrls.length, crawledProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, retiredOrRedirected: skipped.length, crawlErrors: errors.length }, errors, skipped, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
