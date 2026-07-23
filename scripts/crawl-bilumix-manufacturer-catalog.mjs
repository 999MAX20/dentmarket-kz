import fs from "node:fs/promises";
import path from "node:path";

const sitemapUrl = "https://bilumix.com/sitemap-0.xml";
const jsonOutputPath = path.resolve("data/catalog-evidence/bilumix-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/bilumix-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { sourcePageUrl: items[index], error: String(error) }; } } })); return output; }

const sitemap = await requestText(sitemapUrl);
const productUrls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/giu)].map((match) => decode(match[1])))].filter((url) => /^https:\/\/bilumix\.com\/shop\/[^/]+\/$/u.test(url) && !/\/feeds\/|repair-service/iu.test(url));
const crawled = await pool(productUrls, async (sourcePageUrl) => {
  const html = await requestText(sourcePageUrl);
  const nextData = JSON.parse(html.match(/<script id=["']__NEXT_DATA__["'] type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/iu)?.[1] ?? "null");
  const product = nextData?.props?.pageProps?.product;
  if (!product?.id || !product?.title) throw new Error(sourcePageUrl + ": Shopify product data not found");
  const variants = (product.variants?.edges ?? []).map(({ node }) => ({
    variantId: String(node.id ?? "").split("/").pop(), label: decode(node.title), manufacturerRef: decode(node.sku),
    selectedOptions: Object.fromEntries((node.selectedOptions ?? []).map((option) => [decode(option.name), decode(option.value)])),
    sourceImageUrl: decode(node.image?.url), availableForSale: Boolean(node.availableForSale),
  }));
  const imageUrls = [...new Set([...(product.images?.edges ?? []).map(({ node }) => decode(node.url)), ...variants.map((variant) => variant.sourceImageUrl)].filter(Boolean))];
  const manufacturerRefs = [...new Set(variants.map((variant) => variant.manufacturerRef).filter(Boolean))];
  return { officialProductId: `BILUMIX-${String(product.id).split("/").pop()}`, brand: "BiLumix", manufacturer: "ChoiceTech Co., Ltd.",
    name: decode(product.title), manufacturerRef: manufacturerRefs.length === 1 ? manufacturerRefs[0] : "", manufacturerRefs: manufacturerRefs.join(" | "),
    variantCount: Math.max(1, variants.length), variants, categoryPath: decode(product.productType), description: decode(product.description),
    sourceImageUrl: imageUrls[0] ?? "", imageUrls: imageUrls.join(" | "), imageCount: imageUrls.length, sourcePageUrl,
    kzEvidence: "BRAND_PRESENTED_BY_KZ_SPECIALIZED_SELLER", status: imageUrls.length && manufacturerRefs.length ? "KZ_SKU_EVIDENCE_REQUIRED" : imageUrls.length ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
});
const errors = crawled.filter((record) => record?.error);
const products = crawled.filter((record) => record && !record.error).sort((a, b) => a.name.localeCompare(b.name, "en"));
const allRefs = products.flatMap((product) => product.variants.map((variant) => variant.manufacturerRef).filter(Boolean));
const duplicateRefs = [...new Set(allRefs.filter((ref, index) => allRefs.indexOf(ref) !== index))];
const report = { brand: "BiLumix", manufacturer: "ChoiceTech Co., Ltd.", sourceType: "OFFICIAL_CURRENT_SHOPIFY_PRODUCT_AND_VARIANT_DATA", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { physicalProductUrls: productUrls.length, discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, duplicateVariantReferences: duplicateRefs.length, crawlErrors: errors.length },
  duplicateRefs, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
