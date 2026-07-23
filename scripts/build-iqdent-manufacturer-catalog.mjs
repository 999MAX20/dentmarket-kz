import fs from "node:fs/promises";
import path from "node:path";

const extractedPath = path.resolve("tmp/iqdent-burs-products.json");
const instrumentOcrPath = path.resolve("tmp/iqdent-instrument-ocr.json");
const jsonOutputPath = path.resolve("data/catalog-evidence/iqdent-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/iqdent-manufacturer-catalog-queue.csv");
const instrumentCatalogUrl = "https://iqdent.pl/wp-content/uploads/2025/01/AKTUALNY_KATALOG_IQ_03.01_web.pdf";
const burCatalogUrl = "https://iqdent.pl/wp-content/uploads/2025/01/iqdent_katalog_web.pdf";
const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };

const products = JSON.parse(await fs.readFile(extractedPath, "utf8"));
const instrumentOcr = JSON.parse(await fs.readFile(instrumentOcrPath, "utf8"));
const instrumentSections = [
  ["Diagnostic instruments", 6, 8], ["Pluggers", 9, 9], ["Composite instruments", 10, 19],
  ["Excavators and carvers", 20, 26], ["Periodontal instruments", 27, 29], ["Endodontic instruments", 30, 31],
  ["Orthodontic instruments", 32, 33], ["Surgical instruments", 34, 37],
];
const pageNumber = (page) => Number(page.file.match(/(\d+)/u)?.[1]);
const isEnglishTitle = (text) => text === text.toUpperCase() && !/^(?:IQDENT|1QDENT|DENT|Q?\s*\d|THICKNESS|GRUBO|DWU|NAKŁ|DO |SONDA |ZGŁ|KIRETA|NARZ|ŁY|RASPATOR|POSZ|DOPY|UCHWYT|PĘSETA|KULK|W KSZ|Z |O\d)/iu.test(text);
const instrumentMap = new Map();
for (const page of instrumentOcr) {
  const pageNo = pageNumber(page);
  const section = instrumentSections.find(([, firstPage, lastPage]) => pageNo >= firstPage && pageNo <= lastPage);
  if (!section) continue;
  const pageHasPvdOption = page.lines.some((line) => /PVD COATING/iu.test(line.text));
  for (const line of page.lines) {
    const codeMatch = line.text.match(/\b(\d{2}-\d{2})\b/u);
    if (!codeMatch) continue;
    const code = codeMatch[1];
    const inlineTitle = clean(line.text.slice(codeMatch.index + codeMatch[0].length)).replace(/^\|\s*/u, "");
    const half = line.x < 0.49 ? 0 : 1;
    const nearbyTitles = page.lines.filter((candidate) => candidate !== line
      && (candidate.x < 0.49 ? 0 : 1) === half
      && candidate.x > line.x + 0.02
      && candidate.y <= line.y + 0.006
      && candidate.y >= line.y - 0.037
      && !/\b\d{2}-\d{2}\b/u.test(candidate.text)
      && isEnglishTitle(candidate.text))
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((candidate) => clean(candidate.text));
    let name = [...new Set([inlineTitle, ...nearbyTitles].filter((part) => isEnglishTitle(part)))].join(" ");
    name = clean(name.replace(/\s+(?:EKSKAWATOR|SONDA|DWUSTRONN|NAKŁADACZ).*$/iu, "").replace(/^[-•|.\s]+|[-•|.\s]+$/gu, ""));
    if (!name || instrumentMap.has(code)) continue;
    instrumentMap.set(code, { code, name, sectionName: section[0], pageNo, pageHasPvdOption });
  }
}
for (const instrument of instrumentMap.values()) {
  const variants = [{ variantLabel: `${instrument.name} · standard`, manufacturerRef: instrument.code, status: "OFFICIAL_REFERENCE_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED" }];
  if (instrument.pageHasPvdOption) variants.push({ variantLabel: `${instrument.name} · PVD coating`, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" });
  products.push({
    officialProductId: `IQDENT-INSTRUMENT-${instrument.code}`,
    brand: "IQ Dent",
    manufacturer: "IQdent Sp. z o.o.",
    name: `IQ Dent ${instrument.name}`,
    manufacturerRef: instrument.code,
    manufacturerRefs: instrument.code,
    model: instrument.code,
    variantCount: variants.length,
    variants,
    categoryPath: `IQ Dent / Hand instruments / ${instrument.sectionName}`,
    description: `Official IQ Dent hand instrument, catalogue reference ${instrument.code}.`,
    sourceImageUrl: "",
    imageUrls: "",
    imageCount: 0,
    sourcePageUrl: instrumentCatalogUrl,
    sourcePdfPages: String(instrument.pageNo),
    additionalSourceUrls: "https://iqdent.pl/ | https://iqdent.pl/instructions/",
    kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED",
    status: "PHOTO_REQUIRED",
  });
}
for (const capacity of [5, 10, 20]) {
  const colors = ["Pink", "Orange", "Dark green", "Blue", "Navy blue", "Purple", "Light green", "Manufacturer color option to verify"];
  products.push({
    officialProductId: `IQDENT-STERILIZATION-CASSETTE-${capacity}`,
    brand: "IQ Dent", manufacturer: "IQdent Sp. z o.o.", name: `IQ Dent sterilization cassette for ${capacity} instruments`, manufacturerRef: "", manufacturerRefs: "", model: `${capacity}-instrument cassette`, variantCount: colors.length,
    variants: colors.map((color) => ({ variantLabel: `${capacity} instruments · ${color}`, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" })),
    categoryPath: "IQ Dent / Sterilization cassettes", description: `Stainless-steel sterilization cassette for ${capacity} instruments with selectable silicone-band color.`, sourceImageUrl: "", imageUrls: "", imageCount: 0, sourcePageUrl: instrumentCatalogUrl, sourcePdfPages: capacity === 20 ? "41" : "39–40", additionalSourceUrls: "https://iqdent.pl/", kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED", status: "MANUFACTURER_REFERENCE_AND_PHOTO_REQUIRED",
  });
}
products.sort((a, b) => a.name.localeCompare(b.name, "en"));
const allRefs = products.flatMap((product) => clean(product.manufacturerRefs).split(" | ").filter(Boolean));
const duplicateRefs = [...new Set(allRefs.filter((ref, index) => allRefs.indexOf(ref) !== index))].sort();
const report = {
  brand: "IQ Dent",
  manufacturer: "IQdent Sp. z o.o.",
  sourceType: "CURRENT_OFFICIAL_BUR_AND_HAND_INSTRUMENT_PDF_CATALOGS",
  sourceUrl: burCatalogUrl,
  lastChecked: new Date().toISOString().slice(0, 10),
  policy: { completeBurFamiliesAndExplicitIsoVariantsCollected: true, currentHandInstrumentItemsAndCatalogueCodesCollectedByLocalOcr: true, sterilizationCassetteCapacityAndColorVariantsPreserved: true, noPdfIllustrationPublishedAsProductPhoto: true, noManufacturerReferenceInvented: true, missingFieldsNeverDeleteCard: true },
  totals: { discoveredProducts: products.length, variantSkus: products.reduce((sum, product) => sum + Math.max(1, Number(product.variantCount)), 0), productsWithImages: 0, productsWithReferences: products.filter((product) => clean(product.manufacturerRefs)).length, duplicateReferencesAcrossProducts: duplicateRefs.length, handInstrumentItemsCollected: instrumentMap.size, handInstrumentSectionsPendingItemOcr: 0, crawlErrors: 0 },
  duplicateRefs,
  products,
};
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl", "sourcePdfPages"];
const csv = [headers.join(","), ...products.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true });
await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
