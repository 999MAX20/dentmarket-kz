import fs from "node:fs/promises";
import path from "node:path";

const registryPath = path.resolve("data/kz-market-brands.json");
const jsonOutputPath = path.resolve("data/catalog-evidence/denti-kz-brand-listings.json");
const queueOutputPath = path.resolve("data/curation/denti-kz-brand-listings-queue.csv");
const searchUrl = "https://denti.kz/orders/blank_zakaza/index.php";
const filterAliases = new Map([
  ["ESCO Medical", "Suzhou Esco Medical Equipment"], ["Huons", "Huons Co. Ltd"], ["OSUNG MND", "OSUNG MND Co"],
  ["Plasmapp", "Plasmapp Co., Ltd"], ["RAY", "Ray Medical"], ["SIGER", "ZHUHAI SIGER MEDICAL EQUIPMENT CO., LTD."],
  ["Tokuyama Dental", "TOKUYAMA"], ["Wellmed", "Wellmed Dental Medical Supply Co., Ltd"], ["ZION", "ZION Co., Ltd"],
]);
const decode = (value) => String(value ?? "").replace(/\\n|\\r|\\t/gu, " ").replace(/\\'/gu, "'").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code))).replace(/<script[\s\S]*?<\/script>/giu, " ").replace(/<style[\s\S]*?<\/style>/giu, " ").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const key = (value) => decode(value).normalize("NFKC").toLocaleLowerCase("ru");
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url, attempts = 3) { let error; for (let attempt = 1; attempt <= attempts; attempt += 1) { try { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan catalog evidence audit/1.0" }, signal: AbortSignal.timeout(45_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return await response.text(); } catch (caught) { error = caught; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 600)); } } throw error; }
async function pool(items, worker) { const output = new Array(items.length); let cursor = 0; await Promise.all(Array.from({ length: Math.min(6, items.length) }, async () => { while (true) { const index = cursor++; if (index >= items.length) return; try { output[index] = await worker(items[index]); } catch (error) { output[index] = { brand: items[index], error: String(error), products: [] }; } } })); return output; }
const fullImage = (source) => {
  const url = new URL(decode(source), "https://denti.kz");
  url.pathname = url.pathname.replace(/\/resize_cache\/iblock\/([^/]+)\/\d+_\d+_\d+\//u, "/iblock/$1/");
  return url.href;
};
const parsePage = (html, brand) => {
  const starts = [...html.matchAll(/<!-- rendered item: (\d+) -->/gu)];
  const offerIds = new Set([...html.matchAll(/'ID':'(\d+)','OFFER':'Y'/gu)].map((match) => match[1]));
  const products = [];
  for (let index = 0; index < starts.length; index += 1) {
    const baseId = starts[index][1];
    if (offerIds.has(baseId)) continue;
    const chunk = html.slice(starts[index].index, starts[index + 1]?.index ?? html.length);
    const tbody = chunk.match(/<tbody class=["']blank-zakaza__item["'][\s\S]*?<\/tbody>/iu)?.[0] ?? "";
    const name = decode(tbody.match(/class=["']product__link product__link_d["'][^>]+title=["']([^"']+)/iu)?.[1]);
    const rawUrl = decode(tbody.match(/class=["']product__link product__link_d["'][^>]+href=["']([^"']+)/iu)?.[1]);
    const rawImage = decode(tbody.match(/class=["']product__image["'][^>]+src=["']([^"']+)/iu)?.[1]);
    if (!name || !rawUrl) continue;
    const sourcePageUrl = new URL(rawUrl, "https://denti.kz").href;
    const sourceImageUrl = rawImage && !/no_photo/iu.test(rawImage) ? fullImage(rawImage) : "";
    const description = decode(chunk.match(/'DETAIL_TEXT':'([\s\S]*?)','~DETAIL_TEXT'/u)?.[1]).slice(0, 6000);
    const offers = [...html.matchAll(new RegExp(`'(\\d+)':\\{'ID':'\\1','OFFER':'Y','MAIN_PRODUCT':\\{'ID':'${baseId}'\\},'NAME':'([^']*)'`, "gu"))]
      .map((match) => ({ listingOfferId: match[1], name: decode(match[2]), label: decode(match[2]).match(/\(\((.*?)\)\)/u)?.[1] ?? decode(match[2]), manufacturerRef: "" }));
    const uniqueOffers = [...new Map(offers.map((offer) => [offer.listingOfferId, offer])).values()];
    products.push({ officialProductId: `DENTI-KZ-${token(brand)}-${baseId}`, listingProductId: baseId, brand, manufacturer: "",
      name, manufacturerRef: "", manufacturerRefs: "", variantCount: Math.max(1, uniqueOffers.length), variants: uniqueOffers,
      categoryPath: decode(rawUrl.split("/").slice(3, -1).join(" / ").replaceAll("-", " ")), description,
      sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl,
      kzEvidence: "EXACT_KZ_SPECIALIZED_MARKETPLACE_LISTING", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" });
  }
  return products;
};

const registry = JSON.parse(await fs.readFile(registryPath, "utf8"));
const brands = registry.sources.find((source) => source.id === "denti-kz")?.brands ?? [];
const results = await pool(brands, async (brand) => {
  const queryUrl = `${searchUrl}?q=${encodeURIComponent(brand)}`;
  const searchHtml = await requestText(queryUrl);
  const filters = [...searchHtml.matchAll(/<input type=["']checkbox["'][^>]+name=["']([^"']+)["'][^>]*>[\s\S]{0,600}?<label[^>]*>([\s\S]*?)<span data-role=[^>]*>\s*\((\d+)\)/giu)]
    .map((match) => ({ name: match[1], label: decode(match[2]), count: Number(match[3]) }));
  const filterLabel = filterAliases.get(brand) ?? brand;
  const filter = filters.find((candidate) => key(candidate.label) === key(filterLabel));
  if (!filter) return { brand, expectedListings: 0, filterFound: false, pages: 0, products: [], error: "Exact Denti.kz brand filter not found" };
  const filteredUrl = `${queryUrl}&${encodeURIComponent(filter.name)}=Y&set_filter=Y`;
  const firstHtml = await requestText(filteredUrl);
  const pagerNumber = firstHtml.match(/PAGEN_(\d+)=\d+/iu)?.[1] ?? "2";
  const pageUrls = [filteredUrl, ...Array.from({ length: Math.max(0, Math.ceil(filter.count / 10) - 1) }, (_, index) => `${filteredUrl}&PAGEN_${pagerNumber}=${index + 2}`)];
  const pages = [firstHtml, ...await Promise.all(pageUrls.slice(1).map((url) => requestText(url)))];
  const products = [...new Map(pages.flatMap((html) => parsePage(html, brand)).map((product) => [product.officialProductId, product])).values()];
  return { brand, expectedListings: filter.count, filterFound: true, pages: pages.length, products,
    countMatches: products.length === filter.count, filteredUrl };
});
const errors = results.filter((result) => result.error).map(({ brand, error }) => ({ brand, error }));
const products = results.flatMap((result) => result.products).sort((a, b) => a.brand.localeCompare(b.brand, "en") || a.name.localeCompare(b.name, "ru"));
const countMismatches = results.filter((result) => result.filterFound && !result.countMatches).map((result) => ({ brand: result.brand, expected: result.expectedListings, collected: result.products.length }));
const report = { source: "Denti.kz", sourceType: "KZ_SPECIALIZED_MARKETPLACE_EXACT_BRAND_FILTERS", sourceUrl: searchUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { brandsRequested: brands.length, brandsWithExactFilter: results.filter((result) => result.filterFound).length,
    expectedListings: results.reduce((sum, result) => sum + result.expectedListings, 0), discoveredProducts: products.length,
    variantSkus: products.reduce((sum, product) => sum + product.variantCount, 0), productsWithImages: products.filter((product) => product.imageCount > 0).length,
    productsWithoutImages: products.filter((product) => product.imageCount === 0).length, countMismatches: countMismatches.length, crawlErrors: errors.length },
  brandSummaries: results.map(({ products: brandProducts, ...result }) => ({ ...result, collectedProducts: brandProducts.length, variantSkus: brandProducts.reduce((sum, product) => sum + product.variantCount, 0) })),
  countMismatches, errors, products };
const headers = ["officialProductId", "listingProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
