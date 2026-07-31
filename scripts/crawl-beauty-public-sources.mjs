#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "data/intake/beauty-kz/public-catalog-discovery-expanded.csv");
const manifestOutput = path.join(root, "data/reports/beauty-kz/public-catalog-discovery-expanded.json");
const limitPerSource = 80;
const maxPagesPerSource = 40;
const sources = [
  { key: "proff-kz", name: "PROФФ-KZ", seeds: ["https://www.proff.kz/"], categories: ["hair-care", "professional-cosmetics", "nail-products"] },
  { key: "vlaekan-kz", name: "VLAEKAN", seeds: ["https://www.vlaekan.kz/"], categories: ["face-care", "professional-cosmetics", "spa-products"] },
  { key: "nickol-kz", name: "NICKOL", seeds: ["https://nickol.kz/catalog/"], categories: ["professional-cosmetics", "face-care", "body-care", "beauty-tools"] },
  { key: "cosmex-kz", name: "COSMEX", seeds: ["https://cosmex.kz/opt"], categories: ["professional-cosmetics", "face-care", "body-care", "hair-care"] },
  { key: "konturbeauty-kz", name: "KONTUR Beauty", seeds: ["https://konturbeauty.kz/"], categories: ["face-care", "professional-cosmetics"] },
];

const decode = (value) => String(value ?? "")
  .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'")
  .replaceAll("&lt;", "<").replaceAll("&gt;", ">");
const clean = (value) => decode(String(value ?? "").replace(/<[^>]+>/gu, " ").replace(/\\u0026/gu, "&").replace(/\\"/gu, '"')).replace(/\s+/gu, " ").trim();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const key = (value) => crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
const isBeautyName = (value) => !/(?:полост[ьи] рта|зуб|десн|стомат|ортодонт|имплант|эндодонт)/iu.test(value);

async function get(url) {
  const response = await fetch(url, { headers: { "user-agent": "DentMarket public catalog research/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return { url: response.url, html: await response.text() };
}

function jsonLdProducts(html) {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)];
  const products = [];
  for (const match of blocks) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of candidates) {
        if (item?.["@type"] === "Product" && item.name) products.push(item);
        if (Array.isArray(item?.itemListElement)) {
          for (const child of item.itemListElement) {
            const product = child?.item;
            if (product?.["@type"] === "Product" && product.name) products.push(product);
          }
        }
      }
    } catch { /* public pages may contain malformed JSON-LD */ }
  }
  return products;
}

function linksFrom(html, baseUrl) {
  return [...html.matchAll(/href=["']([^"']+)["']/giu)]
    .map((match) => match[1].replaceAll("&amp;", "&"))
    .filter((href) => !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:"))
    .map((href) => { try { return new URL(href, baseUrl).href; } catch { return null; } })
    .filter(Boolean)
    .filter((url) => new URL(url).hostname === new URL(baseUrl).hostname)
    .filter((url) => !/(?:\/bitrix\/cache\/|\/cache\/|\/upload\/|\.css(?:\?|$)|\.js(?:\?|$))/iu.test(url))
    .map((url) => { const parsed = new URL(url); parsed.search = ""; parsed.hash = ""; return parsed.href.replace(/\/$/u, ""); })
    .filter((url) => /(?:catalog|shop|product|товар|item|category|katalog)/iu.test(new URL(url).pathname));
}

const rows = [];
const sourceResults = [];
for (const source of sources) {
  const visited = new Set();
  const queue = [...source.seeds];
  let discovered = 0;
  while (queue.length && visited.size < maxPagesPerSource && rows.filter((row) => row.supplierKey === source.key).length < limitPerSource) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    try {
      const page = await get(url);
      const products = jsonLdProducts(page.html);
      for (const product of products) {
        const name = clean(product.name);
        if (!isBeautyName(name)) continue;
        const image = Array.isArray(product.image) ? product.image[0] : product.image;
        rows.push({
          externalId: `${source.key}-${key(page.url + name)}`,
          name,
          supplierSku: "",
          gtin: "",
          brand: clean(product.brand?.name ?? product.brand),
          manufacturer: clean(product.manufacturer?.name ?? product.manufacturer),
          unit: "",
          description: clean(product.description),
          category: source.categories[0],
          variantLabel: "",
          imageUrl: clean(image),
          sourceUrl: page.url,
          priceMinor: "",
          currency: "",
          quantityOnHand: "",
          warehouse: "",
          leadTimeDays: "",
          dataPolicy: "CANONICAL_DISCOVERY_ONLY_NO_PRICE_OR_STOCK",
          supplierKey: source.key,
          supplierName: source.name,
        });
        if (rows.filter((row) => row.supplierKey === source.key).length >= limitPerSource) break;
      }
      const links = linksFrom(page.html, page.url);
      discovered += links.length;
      for (const link of links) if (!visited.has(link) && queue.length < limitPerSource) queue.push(link);
    } catch (error) {
      console.warn(`skip ${url}: ${error.message}`);
    }
  }
  sourceResults.push({ key: source.key, name: source.name, pagesVisited: visited.size, discoveredLinks: discovered, products: rows.filter((row) => row.supplierKey === source.key).length });
}

const unique = [...new Map(rows.map((row) => [`${row.supplierKey}:${row.sourceUrl}:${row.name}`, row])).values()];
const headers = Object.keys(unique[0] ?? {
  externalId: "", name: "", supplierSku: "", gtin: "", brand: "", manufacturer: "", unit: "", description: "", category: "", variantLabel: "", imageUrl: "", sourceUrl: "", priceMinor: "", currency: "", quantityOnHand: "", warehouse: "", leadTimeDays: "", dataPolicy: "", supplierKey: "", supplierName: "",
});
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(path.dirname(manifestOutput), { recursive: true });
await fs.writeFile(output, `${headers.join(",")}\n${unique.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`);
await fs.writeFile(manifestOutput, `${JSON.stringify({ generatedAt: new Date().toISOString(), sourcePolicy: "Public product metadata only; price, currency, stock, warehouse and lead time intentionally blank.", totals: { sources: sources.length, products: unique.length }, sources: sourceResults, products: unique.map(({ externalId, name, sourceUrl, imageUrl, supplierKey }) => ({ externalId, name, sourceUrl, imageUrl, supplierKey })) }, null, 2)}\n`);
console.log(JSON.stringify({ products: unique.length, sourceResults, output }, null, 2));
