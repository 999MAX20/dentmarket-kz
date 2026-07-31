#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const output = path.join(root, "data/intake/beauty-kz/public-catalog-discovery.csv");
const manifestOutput = path.join(root, "data/reports/beauty-kz/public-catalog-discovery.json");
const source = "https://www.procosmetics.kz/";
const limit = 80;

const decode = (value) => value
  .replaceAll("&amp;", "&")
  .replaceAll("&quot;", '"')
  .replaceAll("&#x27;", "'")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">");
const clean = (value) => decode(String(value ?? "").replace(/<[^>]+>/gu, " ").replace(/\\u0026/gu, "&").replace(/\\"/gu, '"')).replace(/\s+/gu, " ").trim();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const key = (value) => crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);

async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "DentMarket public catalog research/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return { url: response.url, html: await response.text() };
}

function jsonLd(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const product = candidates.find((item) => item?.["@type"] === "Product");
      if (product?.name) return product;
    } catch { /* ignore malformed embedded metadata */ }
  }
  return null;
}

const homeResponse = await get(source);
const links = [...homeResponse.html.matchAll(/href=["']([^"']+)["']/giu)]
  .map((match) => match[1])
  .filter((href) => /\/api\/products\/by-id-redirect\//u.test(href) || /\/shop\/[^/?#]+$/u.test(href))
  .map((href) => new URL(href, source).href);
const productUrls = [...new Set(links)].slice(0, limit);
const products = [];
for (const productUrl of productUrls) {
  try {
    const page = await get(productUrl);
    const product = jsonLd(page.html);
    if (!product?.name) continue;
    if (/(?:полост[ьи] рта|зуб|десн|стомат|ортодонт)/iu.test(clean(product.name))) continue;
    const image = Array.isArray(product.image) ? product.image[0] : product.image;
    products.push({
      externalId: `procosmetics-${key(productUrl)}`,
      name: clean(product.name),
      supplierSku: "",
      gtin: "",
      brand: "",
      manufacturer: "",
      unit: "",
      description: clean(product.description),
      category: "professional-cosmetics",
      variantLabel: "",
      imageUrl: clean(image),
      sourceUrl: page.url,
      priceMinor: "",
      currency: "",
      quantityOnHand: "",
      warehouse: "",
      leadTimeDays: "",
      dataPolicy: "CANONICAL_DISCOVERY_ONLY_NO_PRICE_OR_STOCK",
    });
  } catch (error) {
    console.warn(`skip ${productUrl}: ${error.message}`);
  }
}

const unique = [...new Map(products.map((item) => [item.sourceUrl, item])).values()];
const headers = Object.keys(unique[0] ?? {
  externalId: "", name: "", supplierSku: "", gtin: "", brand: "", manufacturer: "", unit: "", description: "", category: "", variantLabel: "", imageUrl: "", sourceUrl: "", priceMinor: "", currency: "", quantityOnHand: "", warehouse: "", leadTimeDays: "", dataPolicy: "",
});
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(path.dirname(manifestOutput), { recursive: true });
await fs.writeFile(output, `${headers.join(",")}\n${unique.map((item) => headers.map((header) => csv(item[header])).join(",")).join("\n")}\n`);
await fs.writeFile(manifestOutput, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  source,
  sourcePolicy: "Public product metadata only; price, currency, stock, warehouse and lead time intentionally blank.",
  totals: { discoveredLinks: productUrls.length, extractedProducts: unique.length },
  products: unique.map(({ externalId, name, sourceUrl, imageUrl }) => ({ externalId, name, sourceUrl, imageUrl })),
}, null, 2)}\n`);
console.log(JSON.stringify({ discoveredLinks: productUrls.length, extractedProducts: unique.length, output }, null, 2));
