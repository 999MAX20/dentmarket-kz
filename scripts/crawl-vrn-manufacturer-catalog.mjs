import fs from "node:fs/promises";
import path from "node:path";

const indexUrl = "https://www.veirun.com/ProductsCenter";
const jsonOutputPath = path.resolve("data/catalog-evidence/vrn-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/vrn-manufacturer-catalog-queue.csv");
const clean = (value) => String(value ?? "").replace(/<[^>]*>/gu, " ").replaceAll("&amp;", "&").replaceAll("&#x2B;", "+").replaceAll("（", " (").replaceAll("）", ")").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
const fetchText = async (url) => { let lastError; for (let attempt = 0; attempt < 3; attempt += 1) { try { const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { "user-agent": "DentMarket-KZ catalog evidence audit/1.0" } }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.text(); } catch (error) { lastError = error; } } throw lastError; };
const absolute = (value, base) => { try { return new URL(clean(value), base).href; } catch { return ""; } };

const indexHtml = await fetchText(indexUrl);
const cardPattern = /<a[^>]+href="(\/ProductsCenter\/info\/(\d+))"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>[\s\S]*?<div>([^<]+)<\/div>[\s\S]*?<\/a>/giu;
const cards = [];
for (const match of indexHtml.matchAll(cardPattern)) {
  const [, relativeUrl, id, image, rawName] = match;
  const name = clean(rawName);
  if (!name || cards.some((card) => card.id === id)) continue;
  cards.push({ id, name, sourcePageUrl: absolute(relativeUrl, indexUrl), sourceImageUrl: absolute(image, indexUrl) });
}

const products = [];
const errors = [];
let cursor = 0;
const worker = async () => {
  while (cursor < cards.length) {
    const card = cards[cursor++];
    try {
      const html = await fetchText(card.sourcePageUrl);
      const description = clean(html.match(/<meta\s+name="description"\s+content="([^"]*)"/iu)?.[1]);
      const name = card.name;
      const manufacturerRef = /^[A-Z0-9][A-Z0-9 .+()/-]{1,80}$/iu.test(card.name) ? card.name : "";
      products.push({
        officialProductId: `VRN-${card.id}`,
        brand: "VRN",
        manufacturer: "Guilin Veirun Medical Technology Co., Ltd.",
        name,
        manufacturerRef,
        manufacturerRefs: manufacturerRef,
        model: card.name,
        variantCount: 1,
        variants: [{ variantLabel: card.name, manufacturerRef, status: manufacturerRef ? "OFFICIAL_MODEL_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED" }],
        categoryPath: "VRN / Dental equipment and accessories",
        description,
        sourceImageUrl: card.sourceImageUrl,
        imageUrls: card.sourceImageUrl,
        imageCount: card.sourceImageUrl ? 1 : 0,
        sourcePageUrl: card.sourcePageUrl,
        additionalSourceUrls: indexUrl,
        kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED",
        status: !card.sourceImageUrl ? "PHOTO_REQUIRED" : manufacturerRef ? "OFFICIAL_MODEL_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED" : "MANUFACTURER_REFERENCE_REQUIRED",
      });
    } catch (error) {
      errors.push({ sourcePageUrl: card.sourcePageUrl, name: card.name, error: String(error?.message ?? error) });
    }
  }
};
await Promise.all(Array.from({ length: 5 }, () => worker()));
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const refs = products.map((product) => product.manufacturerRef).filter(Boolean);
const duplicateRefs = [...new Set(refs.filter((ref, index) => refs.indexOf(ref) !== index))].sort();
const report = {
  brand: "VRN",
  manufacturer: "Guilin Veirun Medical Technology Co., Ltd.",
  sourceType: "CURRENT_OFFICIAL_PRODUCT_CENTER",
  sourceUrl: indexUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { allOfficialProductCardsCollected: true, exactOfficialCardImagesPreserved: true, modelUsedAsReferenceOnlyWhenExplicitlyDisplayed: true, missingFieldsNeverDeleteCard: true },
  totals: { officialIndexEntries: cards.length, discoveredProducts: products.length, variantSkus: products.length, productsWithImages: products.filter((product) => product.imageCount > 0).length, productsWithReferences: products.filter((product) => product.manufacturerRef).length, duplicateReferencesAcrossProducts: duplicateRefs.length, crawlErrors: errors.length },
  duplicateRefs,
  errors,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
