import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.shining3ddental.com";
const quoteSourceUrl = `${baseUrl}/ko/solutions-ko/cad-software-ko/`;
const jsonOutputPath = path.resolve("data/catalog-evidence/shining3d-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/shining3d-manufacturer-catalog-queue.csv");
const decode = (value) => String(value ?? "").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const modelRows = [
  ["Aoralscan Elite Wireless", "Intraoral scanners", "/en/solution/aoralscan-elite-wireless/"],
  ["Aoralscan Elite", "Intraoral scanners", "/solution/aoralscan-elite/"],
  ["Aoralscan Elf", "Intraoral scanners", "/solution/aoralscan-elf"],
  ["Aoralscan 3 Wireless", "Intraoral scanners", "/solution/aoralscan-3-wireless-intraoral-scanner"],
  ["Aoralscan 3", "Intraoral scanners", "/solution/aoralscan-3/"],
  ["MetiSmile-MR", "Face scanners", quoteSourceUrl],
  ["MetiSmile", "Face scanners", "/en/solution/metismile-face-scanner"],
  ["e-Motion", "Dental workstations", "/en/solution/e-motion"],
  ["AutoScan-DS-EX Pro(C)", "Laboratory scanners", "/brochure-download-autoscan-ds-ex-proc"],
  ["AutoScan-DS-EX Pro(H)", "Laboratory scanners", "/solution/autoscan-ds-ex-pro-h"],
  ["AccuFab-CEL", "Dental 3D printers", "/solution/accufab-cel"],
  ["AccuFab-L4D", "Dental 3D printers", "/solution/accufab-l4d-k"],
  ["AccuFab-F1", "Dental 3D printers", "/solution/accufab-f1/"],
  ["AccuFab-D1s", "Dental 3D printers", quoteSourceUrl],
  ["FabWash", "Post-processing", "/solution/fabwash-2/"],
  ["FabCure N2", "Post-processing", "/solution/fabcure-n2"],
  ["FabCure 2", "Post-processing", "/solution/fabcure-2"],
];
const concurrency = 6;
async function requestText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(45_000) });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.text();
    } catch (error) { lastError = error; if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500)); }
  }
  throw lastError;
}
async function pool(items, worker) {
  const output = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) { const index = cursor++; if (index >= items.length) return;
      try { output[index] = await worker(items[index]); } catch (error) { output[index] = { row: items[index], error: String(error) }; }
    }
  })); return output;
}

const sitemapXml = await requestText(`${baseUrl}/sitemap.xml`);
const sitemapImagesByPage = new Map([...sitemapXml.matchAll(/<url>([\s\S]*?)<\/url>/giu)].map((match) => {
  const pageUrl = decode(match[1].match(/<loc>([^<]+)<\/loc>/iu)?.[1]).replace(/\/$/u, "");
  const images = [...match[1].matchAll(/<image:loc>([^<]+)<\/image:loc>/giu)].map((image) => decode(image[1]));
  return [pageUrl, images];
}));
const crawled = await pool(modelRows, async (row) => {
  const [model, categoryPath, route] = row;
  const sourcePageUrl = route.startsWith("http") ? route : new URL(route, baseUrl).href;
  const html = await requestText(sourcePageUrl);
  const meta = (property) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, "iu"))?.[1]);
  const modelTokens = model.toLowerCase().replace(/[^a-z0-9]+/gu, " ").split(" ").filter((token) => token.length >= 4 && !["wireless"].includes(token));
  const sitemapImages = sitemapImagesByPage.get(sourcePageUrl.replace(/\/$/u, "")) ?? [];
  const exactSitemapImage = sitemapImages.find((url) => {
    const normalizedUrl = decodeURIComponent(url).toLowerCase().replace(/[^a-z0-9]+/gu, "");
    return modelTokens.some((token) => normalizedUrl.includes(token));
  });
  const ogImage = meta("og:image");
  const genericOgImage = /(?:logo|facebook|twitter|whatsapp|social|share)/iu.test(ogImage);
  const imageUrl = sourcePageUrl === quoteSourceUrl ? "" : (exactSitemapImage || (genericOgImage ? "" : ogImage));
  return {
    officialProductId: `SHINING3D-${model.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`,
    brand: "SHINING 3D", manufacturer: "SHINING 3D Tech Co., Ltd.", name: `SHINING 3D ${model}`,
    manufacturerRef: model, manufacturerRefs: model, variantCount: 1,
    variants: [{ manufacturerRef: model, label: model }], categoryPath, description: meta("description") || meta("og:description"),
    sourceImageUrl: imageUrl, imageUrls: imageUrl, imageCount: imageUrl ? 1 : 0, sourcePageUrl,
    kzEvidence: "BRAND_AND_SELECTED_MODELS_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET",
    status: imageUrl ? "KZ_SKU_EVIDENCE_REQUIRED" : "PHOTO_REQUIRED",
  };
});
const errors = crawled.filter((record) => record.error);
const products = crawled.filter((record) => !record.error);
for (const failure of errors) {
  const [model, categoryPath, route] = failure.row;
  const sourcePageUrl = route.startsWith("http") ? route : new URL(route, baseUrl).href;
  products.push({ officialProductId: `SHINING3D-${model.toUpperCase().replace(/[^A-Z0-9]+/gu, "-")}`, brand: "SHINING 3D",
    manufacturer: "SHINING 3D Tech Co., Ltd.", name: `SHINING 3D ${model}`, manufacturerRef: model, manufacturerRefs: model,
    variantCount: 1, variants: [{ manufacturerRef: model, label: model }], categoryPath, description: "", sourceImageUrl: "", imageUrls: "",
    imageCount: 0, sourcePageUrl, kzEvidence: "BRAND_AND_SELECTED_MODELS_PRESENTED_IN_KAZAKHSTAN_DENTAL_MARKET", status: "PHOTO_REQUIRED" });
}
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const report = { brand: "SHINING 3D", manufacturer: "SHINING 3D Tech Co., Ltd.", sourceType: "MANUFACTURER_CURRENT_QUOTE_PRODUCT_LINE",
  sourceUrl: quoteSourceUrl, lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: modelRows.length,
    crawledProducts: products.length, productsWithReferences: products.filter((product) => product.manufacturerRefs).length,
    productsWithImages: products.filter((product) => product.imageCount > 0).length, crawlErrors: errors.length }, errors, products };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
