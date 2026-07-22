import fs from "node:fs/promises";
import path from "node:path";

const argumentsMap = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  argumentsMap.set(process.argv[index], process.argv[index + 1]);
}

const brandId = argumentsMap.get("--brand-id");
const expectedBrand = argumentsMap.get("--brand");
const outputPath = argumentsMap.get("--output");
if (!brandId || !expectedBrand || !outputPath) {
  throw new Error(
    "Usage: node scripts/audit-nordstom-brand.mjs --brand-id ID --brand BRAND --output FILE",
  );
}

const baseUrl = "https://nordstom.kz";
const brandUrl = `${baseUrl}/brand?id=${encodeURIComponent(brandId)}`;
const userAgent = "DentMarket Kazakhstan catalog audit/1.0";
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const decode = (value) =>
  String(value ?? "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&laquo;/giu, "«")
    .replace(/&raquo;/giu, "»")
    .replace(/&times;/giu, "×")
    .replace(/&Oslash;/giu, "Ø")
    .replace(/&micro;/giu, "µ")
    .replace(/&deg;/giu, "°")
    .replace(/&amp;/giu, "&")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
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

const brandHtml = await fetchHtml(brandUrl);
const actualBrand = decode(
  brandHtml.match(/Все товары бренда\s+"([^"]+)"/u)?.[1],
);
if (actualBrand !== expectedBrand) {
  throw new Error(
    `Brand page mismatch: expected ${expectedBrand}, received ${actualBrand || "nothing"}`,
  );
}

const brandPattern = new RegExp(
  `<a href="([^"]+item-\\d+)" class="img"[^>]*><\\/a><div class="brand">${escapeRegExp(expectedBrand)}<\\/div>\\s*<a href="[^"]+" class="title">([\\s\\S]*?)<\\/a>`,
  "gu",
);
const listedProducts = [...brandHtml.matchAll(brandPattern)].map((match) => ({
  sourcePageUrl: new URL(match[1], baseUrl).href,
  listedName: decode(match[2]),
}));
const uniqueUrls = new Set(listedProducts.map((product) => product.sourcePageUrl));
if (uniqueUrls.size !== listedProducts.length) {
  throw new Error(`Duplicate product links found on ${brandUrl}`);
}
if (listedProducts.length === 0) {
  throw new Error(`No ${expectedBrand} products found on ${brandUrl}`);
}

async function auditProduct(product) {
  const html = await fetchHtml(product.sourcePageUrl);
  const pageName = decode(html.match(/<h1 class="title">([\s\S]*?)<\/h1>/u)?.[1]);
  const pageBrand = decode(
    html.match(/Бренд:\s*<span class="v">([\s\S]*?)<\/span>/u)?.[1],
  );
  if (pageBrand && pageBrand !== expectedBrand) {
    throw new Error(`${product.sourcePageUrl}: expected ${expectedBrand}, received ${pageBrand}`);
  }
  const sourceArticle = decode(
    html.match(/Артикул:\s*<span class="v">([\s\S]*?)<\/span>/u)?.[1],
  );
  const summary = decode(html.match(/<div class="anons">([\s\S]*?)<\/div>/u)?.[1]);
  const sourceImagePath = html.match(
    /(?:href|src)=["']?(\/userfiles\/item\/\d+\/(?:fullimage|image)[^"')\s>]+)/iu,
  )?.[1];
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/giu)]
    .map((tableMatch) =>
      [...tableMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/giu)]
        .map((rowMatch) =>
          [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu)]
            .map((cellMatch) => decode(cellMatch[1]))
            .filter(Boolean),
        )
        .filter((row) => row.length > 0),
    )
    .filter((table) => table.length > 0);
  return {
    listedName: product.listedName,
    pageName: pageName || product.listedName,
    sourceArticle: sourceArticle || null,
    summary: summary || null,
    sourcePageUrl: product.sourcePageUrl,
    sourceImageUrl: sourceImagePath
      ? new URL(sourceImagePath, baseUrl).href
      : null,
    tables,
  };
}

const products = [];
for (let index = 0; index < listedProducts.length; index += 8) {
  products.push(
    ...(await Promise.all(listedProducts.slice(index, index + 8).map(auditProduct))),
  );
}

const report = {
  brand: expectedBrand,
  market: "KZ",
  sourceType: "KZ_DISTRIBUTOR_CATALOG",
  sourceUrl: brandUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  totals: {
    products: products.length,
    productsWithSourceArticle: products.filter((product) => product.sourceArticle).length,
    productsWithExactImage: products.filter((product) => product.sourceImageUrl).length,
    productsWithTables: products.filter((product) => product.tables.length > 0).length,
    tableRows: products.reduce(
      (total, product) =>
        total + product.tables.reduce((rows, table) => rows + table.length, 0),
      0,
    ),
  },
  products,
};

await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.totals, null, 2));
