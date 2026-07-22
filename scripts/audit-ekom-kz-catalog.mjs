import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const outputPath = path.join(root, "data/reports/ekom-kz-source-audit.json");
const baseUrl = "https://www.ekom.sk";
const localProductUrl =
  "https://nordstom.kz/catalog/dental-equipment/compressors/item-499";
const representativeUrl =
  "https://www.medexim.sk/en/contacts/corporate-representation/kazakhstan";
const categoryPaths = [
  "/en/products/dentistry/compressors",
  "/en/products/dentistry/compressors-with-dental-suction-system",
  "/en/products/dentistry/dental-suction-systems",
  "/en/products/dentistry/optional-equipment",
];
const userAgent = "DentMarket Kazakhstan catalog audit/1.0";

const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/\s+/gu, " ")
    .trim();

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "user-agent": userAgent },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

function categoryFor(url) {
  if (url.includes("compressors-with-dental-suction-system"))
    return "Компрессоры с аспирацией";
  if (url.includes("dental-suction-systems")) return "Системы аспирации";
  if (url.includes("optional-equipment")) return "Аксессуары для компрессоров";
  return "Стоматологические компрессоры";
}

const categoryProducts = [];
for (const categoryPath of categoryPaths) {
  const categoryUrl = new URL(categoryPath, baseUrl).href;
  const html = await fetchHtml(categoryUrl);
  const cardPattern =
    /<div class="col-md-4 page-menu-box"><a href="([^"]+)" title="([^"]+)"><h3>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"[^>]*>/gu;
  const cards = [...html.matchAll(cardPattern)].map((match) => ({
    model: decode(match[2]),
    sourcePageUrl: new URL(match[1], baseUrl).href,
    sourceImageUrl: new URL(match[3], baseUrl).href,
    category: categoryFor(categoryUrl),
  }));
  if (cards.length === 0) throw new Error(`No product cards found: ${categoryUrl}`);
  categoryProducts.push(...cards);
}

const products = [];
for (let index = 0; index < categoryProducts.length; index += 4) {
  products.push(
    ...(await Promise.all(
      categoryProducts.slice(index, index + 4).map(async (product) => {
        const html = await fetchHtml(product.sourcePageUrl);
        const metaDescription = decode(
          html.match(/<meta name="description" content="([^"]*)"/iu)?.[1],
        );
        const variants = [
          ...new Set(
            [...html.matchAll(/\bdataname="([^"]+)"/giu)]
              .map((match) => decode(match[1]))
              .filter(Boolean),
          ),
        ];
        return { ...product, summary: metaDescription || null, variants };
      }),
    )),
  );
}

const uniquePages = new Set(products.map((product) => product.sourcePageUrl));
const uniqueNames = new Set(products.map((product) => product.model));
if (products.length !== 30 || uniquePages.size !== products.length)
  throw new Error(`Expected 30 unique EKOM dental products, received ${products.length}`);
if (uniqueNames.size !== products.length)
  throw new Error("EKOM product model names are not unique");

const localHtml = await fetchHtml(localProductUrl);
if (!/Бренд:\s*<a class="v" href="\/brand\?id=71">Ekom<\/a>/u.test(localHtml))
  throw new Error("Kazakhstan product page is no longer assigned to Ekom");
const representativeHtml = await fetchHtml(representativeUrl);
if (!/TOO «Nord Stom»/u.test(representativeHtml))
  throw new Error("Official Kazakhstan representation page no longer lists Nord Stom");

const report = {
  brand: "Ekom",
  manufacturer: "EKOM spol. s r.o.",
  market: "KZ",
  officialCatalogUrl: new URL(categoryPaths[0], baseUrl).href,
  representativeUrl,
  localCatalogUrl: "https://nordstom.kz/brand?id=71",
  localExactProductUrl: localProductUrl,
  localExactModel: "DK50-10 S",
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    products: products.length,
    productsWithExactImage: products.filter((product) => product.sourceImageUrl).length,
    productFamiliesWithVariants: products.filter((product) => product.variants.length > 0)
      .length,
    variants: products.reduce((total, product) => total + product.variants.length, 0),
    exactKzProducts: 1,
    exactKzVariants: 1,
  },
  products,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.totals, null, 2));
