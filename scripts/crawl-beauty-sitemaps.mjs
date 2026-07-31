#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "../apps/api/node_modules/csv-parse/lib/sync.js";

const root = process.cwd();
const output = path.join(root, "data/intake/beauty-kz/public-catalog-sitemap.csv");
const manifestOutput = path.join(root, "data/reports/beauty-kz/public-catalog-sitemap.json");
const concurrency = 8;
const maxUrlsPerSource = 5000;
const sources = [
  { key: "nickol-kz", name: "NICKOL", sitemap: "https://nickol.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "cosmex-kz", name: "COSMEX", sitemap: "https://cosmex.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "vlaekan-kz", name: "VLAEKAN", sitemap: "https://vlaekan.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "ucg-web-kz", name: "UCG public catalog", sitemap: "https://shop-ucg.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "procosmetics-kz", name: "PRO COSMETICS", sitemap: "https://procosmetics.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "dd-business-kz", name: "DD Business", sitemap: "https://ddup.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "janssen-kz", name: "Janssen Cosmetics Kazakhstan", sitemap: "https://janssen-cosmetics.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "beeyoung-kz", name: "Beeyoung", sitemap: "https://beeyoung.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "aif-cosmetics-kz", name: "AIF Cosmetics", sitemap: "https://aifcosmetic.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "fox-beauty-house-kz", name: "Fox Beauty House", sitemap: "https://foxbeautyhouse.com/sitemap.xml", category: "professional-cosmetics" },
  { key: "labeauty-kz", name: "LaBeauty", sitemap: "https://labeauty.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "profcare-kz", name: "Profcare", sitemap: "https://profcare.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "skinosophy-kz", name: "Skinosophy", sitemap: "https://skinosophy.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "inter-beauty-kz", name: "Inter Beauty", sitemap: "https://i-b.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "mollystore-kz", name: "Molly", sitemap: "https://mollystore.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "profcosmetics-kz", name: "Profcosmetics", sitemap: "https://profcosmetics.kz/sitemap.xml", category: "professional-cosmetics" },
  { key: "leoncosmetics-kz", name: "Leon Cosmetics", sitemap: "https://leoncosmetics.kz/sitemap.xml", category: "professional-cosmetics" },
];

const clean = (value) => String(value ?? "").replace(/<[^>]+>/gu, " ").replace(/&amp;/gu, "&").replace(/&quot;/gu, '"').replace(/&#x27;/gu, "'").replace(/\s+/gu, " ").trim();
const csv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const key = (value) => crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
const isBeauty = (value) => !/(?:полост[ьи] рта|зуб|десн|стомат|ортодонт|имплант|эндодонт|бор|файл эндо)/iu.test(value);

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": "DentMarket public catalog research/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return { url: response.url, text: await response.text() };
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/giu)].map((match) => clean(match[1])).filter(Boolean);
}

async function sitemapUrls(url, seen = new Set()) {
  if (seen.has(url)) return [];
  seen.add(url);
  const { text } = await fetchText(url);
  const children = locs(text);
  if (/<sitemapindex/iu.test(text)) {
    const nested = [];
    for (const child of children.slice(0, 50)) nested.push(...await sitemapUrls(child, seen));
    return nested;
  }
  return children;
}

function jsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)];
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1]);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const product = candidates.find((item) => item?.["@type"] === "Product" && item.name);
      if (product) return product;
    } catch { /* ignore malformed public metadata */ }
  }
  return null;
}

function meta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["']`, "iu"))?.[1] ?? "";
}

async function worker(urls, fn) {
  const results = [];
  let index = 0;
  async function run() {
    while (index < urls.length) {
      const current = urls[index++];
      try { results.push(await fn(current)); } catch (error) { results.push({ error: error.message, url: current }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => run()));
  return results;
}

const rows = [];
const sourceResults = [];
for (const source of sources) {
  if (source.key === "nickol-kz" && process.env.SKIP_NICKOL === "1") {
    sourceResults.push({ ...source, sitemapUrls: 0, fetched: 0, products: 0, errors: 0, skipped: "SKIP_NICKOL=1; source previously returned 503 for product pages" });
    continue;
  }
  let urls = [];
  try {
    const allUrls = [...new Set(await sitemapUrls(source.sitemap))];
    const candidate = (url) => {
      const pathname = new URL(url).pathname;
      if (source.key === "nickol-kz") return /\/product\//iu.test(pathname);
      if (source.key === "procosmetics-kz") return /\/shop\/[^/]+/iu.test(pathname);
      if (source.key === "ucg-web-kz") return /\/catalog\//iu.test(pathname);
      if (source.key === "mollystore-kz") return /\/p\d+-/iu.test(pathname);
      if (source.key === "profcosmetics-kz") return /route=product\/product/iu.test(url);
      if (source.key === "leoncosmetics-kz") return /\/urun\//iu.test(pathname);
      return /\/(?:catalog|product|shop|goods|товар)\//iu.test(pathname) || /\/(?:product|item)-/iu.test(pathname);
    };
    urls = allUrls.filter(candidate).slice(0, maxUrlsPerSource);
  } catch (error) {
    sourceResults.push({ ...source, sitemapUrls: 0, fetched: 0, products: 0, error: error.message });
    continue;
  }
  const pages = await worker(urls, async (url) => {
    const page = await fetchText(url);
    const product = jsonLd(page.text);
    const name = clean(product?.name || meta(page.text, "og:title") || page.text.match(/<title[^>]*>([\s\S]*?)<\/title>/iu)?.[1]);
    if (!name || !isBeauty(name) || /(?:каталог|главная|контакты|доставка|оплата|политика)/iu.test(name)) return null;
    const image = Array.isArray(product?.image) ? product.image[0] : product?.image;
    const pathname = new URL(url).pathname;
    const fallbackProductPath = source.key === "nickol-kz" ? /\/product\//iu.test(pathname)
      : source.key === "procosmetics-kz" ? /\/shop\/[^/]+/iu.test(pathname)
      : source.key === "ucg-web-kz" ? /\/catalog\//iu.test(pathname)
      : source.key === "mollystore-kz" ? /\/p\d+-/iu.test(pathname)
      : source.key === "profcosmetics-kz" ? /route=product\/product/iu.test(url)
      : source.key === "leoncosmetics-kz" ? /\/urun\//iu.test(pathname)
      : /\/catalog\//iu.test(pathname);
    const description = clean(product?.description || meta(page.text, "description") || meta(page.text, "og:description"));
    const fallbackImage = clean(image || meta(page.text, "og:image"));
    if (!product && (!fallbackProductPath || (!fallbackImage && description.length < 80))) return null;
    return {
      externalId: `${source.key}-${key(url + name)}`,
      name,
      supplierSku: "",
      gtin: "",
      brand: clean(product?.brand?.name ?? product?.brand),
      manufacturer: clean(product?.manufacturer?.name ?? product?.manufacturer),
      unit: "",
      description,
      category: source.category,
      variantLabel: "",
      imageUrl: fallbackImage,
      sourceUrl: page.url,
      priceMinor: "",
      currency: "",
      quantityOnHand: "",
      warehouse: "",
      leadTimeDays: "",
      dataPolicy: "CANONICAL_DISCOVERY_ONLY_NO_PRICE_OR_STOCK",
      supplierKey: source.key,
      supplierName: source.name,
    };
  });
  const valid = pages.filter((item) => item && !item.error);
  rows.push(...valid);
  sourceResults.push({ key: source.key, name: source.name, sitemapUrls: urls.length, fetched: pages.length, products: valid.length, errors: pages.filter((item) => item?.error).length, errorSamples: pages.filter((item) => item?.error).slice(0, 3) });
  console.log(JSON.stringify(sourceResults.at(-1)));
}

const unique = [...new Map(rows.map((row) => [`${row.supplierKey}:${row.sourceUrl}:${row.name}`, row])).values()];
let preservedExistingRows = 0;
try {
  const previous = parse(await fs.readFile(output), { columns: true, skip_empty_lines: true, bom: true });
  const merged = new Map(previous.map((row) => [`${row.supplierKey}:${row.sourceUrl}:${row.name}`, row]));
  for (const row of unique) merged.set(`${row.supplierKey}:${row.sourceUrl}:${row.name}`, row);
  preservedExistingRows = Math.max(0, merged.size - unique.length);
  unique.splice(0, unique.length, ...merged.values());
} catch { /* first run has no previous discovery file */ }
const headers = Object.keys(unique[0] ?? { externalId: "", name: "", supplierSku: "", gtin: "", brand: "", manufacturer: "", unit: "", description: "", category: "", variantLabel: "", imageUrl: "", sourceUrl: "", priceMinor: "", currency: "", quantityOnHand: "", warehouse: "", leadTimeDays: "", dataPolicy: "", supplierKey: "", supplierName: "" });
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(path.dirname(manifestOutput), { recursive: true });
await fs.writeFile(output, `${headers.join(",")}\n${unique.map((row) => headers.map((header) => csv(row[header])).join(",")).join("\n")}\n`);
await fs.writeFile(manifestOutput, `${JSON.stringify({ generatedAt: new Date().toISOString(), sourcePolicy: "Public product metadata only; price, currency, stock, warehouse and lead time intentionally blank.", totals: { products: unique.length, preservedExistingRows }, sources: sourceResults, products: unique.map(({ externalId, name, sourceUrl, imageUrl, supplierKey }) => ({ externalId, name, sourceUrl, imageUrl, supplierKey })) }, null, 2)}\n`);
console.log(JSON.stringify({ products: unique.length, preservedExistingRows, output }, null, 2));
