import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd());
const baseUrl = "https://shop-ucg.kz";
const output = path.join(root, "data/intake/beauty-kz/ucg-kz.csv");
const maxProducts = Number(process.env.BEAUTY_CRAWL_LIMIT ?? 250);
const delayMs = Number(process.env.BEAUTY_CRAWL_DELAY_MS ?? 250);
const knownBrands = [
  "Teoxane",
  "Laennec",
  "Regenyal",
  "Ial-System",
  "NEWSHA",
  "BioRePeelCl3",
  "Hamilton",
  "Gehwol",
  "Payot",
  "Mansard",
  "CHI",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const html = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "DentMarket catalog research bot/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
};
const decode = (value) =>
  value
    .replaceAll("&amp;lt;", "&lt;")
    .replaceAll("&amp;gt;", "&gt;")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const attribute = (tag, name) => {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ?? "";
};
const metaContent = (html, key, attributeName) => {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((item) => {
    const value = attribute(item, attributeName);
    return value.toLocaleLowerCase("en") === key.toLocaleLowerCase("en");
  });
  return tag ? attribute(tag, "content") : "";
};
const productImage = (html, url) => {
  const itemprop = html.match(/<img\b[^>]*itemprop=["']image["'][^>]*>/i)?.[0];
  const imageTag =
    itemprop ??
    (html.match(/<img\b[^>]*class=["'][^"']*product[^"']*["'][^>]*>/i) ?? [
      "",
    ])[0];
  const source =
    attribute(imageTag, "src") || metaContent(html, "og:image", "property");
  return source ? new URL(source, url).toString() : "";
};
const absolute = (href) => new URL(href, baseUrl).toString();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const slugId = (url) =>
  `ucg-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 16)}`;

const categoryPages = new Set([`${baseUrl}/catalog/`]);
const home = await html(`${baseUrl}/`);
for (const href of home.matchAll(/href=["']([^"']*\/catalog\/[^"']*)["']/gi))
  categoryPages.add(absolute(href[1]));
const catalogIndex = await html(`${baseUrl}/catalog/`);
for (const href of catalogIndex.matchAll(
  /href=["']([^"']*\/catalog\/[^"']*)["']/gi,
))
  categoryPages.add(absolute(href[1]));
const productUrls = new Set();
for (const categoryUrl of [...categoryPages].slice(0, 80)) {
  try {
    const page = await html(categoryUrl);
    for (const match of page.matchAll(
      /href=["']([^"']*\/catalog\/[^"']+\/[^"']+\/[^"']+\/)["']/gi,
    )) {
      const url = absolute(match[1]);
      const pathParts = new URL(url).pathname.split("/").filter(Boolean);
      if (
        pathParts.length >= 4 &&
        !url.includes("/catalog/search") &&
        !url.endsWith("/catalog/")
      )
        productUrls.add(url);
      if (productUrls.size >= maxProducts) break;
    }
  } catch (error) {
    console.warn(`skip category ${categoryUrl}: ${error.message}`);
  }
  if (productUrls.size >= maxProducts) break;
  await sleep(delayMs);
}

const rows = [];
for (const url of productUrls) {
  try {
    const page = await html(url);
    const titleMatch =
      page.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
      page.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
      );
    const description = metaContent(page, "description", "name");
    const name = decode(titleMatch?.[1] ?? "");
    if (!name) continue;
    const brandFromPage = page.match(
      /product-item-detail-properties-name[\s\S]{0,500}?Бренд:[\s\S]{0,220}?<a[^>]*>([^<]+)<\/a>/iu,
    )?.[1];
    const brand =
      decode(brandFromPage ?? "").toLocaleUpperCase("ru") ||
      knownBrands.find((candidate) =>
        name
          .toLocaleLowerCase("ru")
          .includes(candidate.toLocaleLowerCase("ru")),
      ) ||
      "";
    const pathParts = new URL(url).pathname.split("/").filter(Boolean);
    rows.push({
      externalId: slugId(url),
      name,
      supplierSku: "",
      gtin: "",
      brand,
      manufacturer: "",
      unit: "",
      description: decode(description),
      category: pathParts[1] ?? "professional-cosmetics",
      variantLabel: "",
      imageUrl: productImage(page, url),
      sourceUrl: url,
      priceMinor: "",
      currency: "",
      quantityOnHand: "",
      warehouse: "",
      leadTimeDays: "",
      lotNumber: "",
      expirationDate: "",
    });
  } catch (error) {
    console.warn(`skip product ${url}: ${error.message}`);
  }
  await sleep(delayMs);
}

const headers = [
  "externalId",
  "name",
  "supplierSku",
  "gtin",
  "brand",
  "manufacturer",
  "unit",
  "description",
  "category",
  "variantLabel",
  "imageUrl",
  "sourceUrl",
  "priceMinor",
  "currency",
  "quantityOnHand",
  "warehouse",
  "leadTimeDays",
  "lotNumber",
  "expirationDate",
];
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(
  output,
  [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csv(row[header])).join(",")),
  ].join("\n") + "\n",
);
console.log(
  `UCG catalog intake written: ${rows.length} rows from ${productUrls.size} public product URLs.`,
);
