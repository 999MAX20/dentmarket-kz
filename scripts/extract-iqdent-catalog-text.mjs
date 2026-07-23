import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Usage: node extract-iqdent-catalog-text.mjs INPUT_PDF OUTPUT_JSON");
const requireFromApi = createRequire(path.resolve("apps/api/package.json"));
const pdfModulePath = requireFromApi.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const { getDocument } = await import(pathToFileURL(pdfModulePath).href);
const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();
const data = new Uint8Array(await fs.readFile(path.resolve(inputArg)));
const pdf = await getDocument({ data, useSystemFonts: true }).promise;
const products = new Map();
let section = "Dental burs";
const sectionPattern = /^(DIAMOND BURS|CARBIDE BURS|FINISHING INSTRUMENTS|CROWN CUTTERS|SURGICAL BURS)$/u;
const namedPattern = /^(C(?:B|F)\s?[A-Z0-9-]+)(?:\s+(?:FG|RA|HP|FGL|RAL|FGXL|RAXL|HPXL|FG XXL|FG XL|RA L|FG L|UF|F|L|XL))*\b/iu;
for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
  const page = await pdf.getPage(pageNo);
  const content = await page.getTextContent();
  const rawItems = content.items.map((item) => ({ text: clean(item.str), x: Number(item.transform?.[4] ?? 0), y: Number(item.transform?.[5] ?? 0) })).filter((item) => item.text);
  const rows = new Map();
  for (const item of rawItems) {
    const y = Math.round(item.y / 8) * 8;
    const row = rows.get(y) ?? []; row.push({ x: item.x, text: item.text }); rows.set(y, row);
  }
  const lines = [...rows.entries()].sort(([a], [b]) => b - a).map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "));
  for (const line of lines) {
    const sectionMatch = line.match(sectionPattern); if (sectionMatch) section = sectionMatch[1].toLocaleLowerCase("en").replace(/\b\w/gu, (char) => char.toUpperCase());
    const named = line.match(namedPattern); if (named) {
      const model = clean(named[1]).replaceAll(" ", ""); if (model.length < 3) continue; const id = `IQDENT-${model.toUpperCase().replace(/[^A-Z0-9]+/gu, "-").replace(/^-+|-+$/gu, "")}`;
      const product = products.get(id) ?? { officialProductId: id, brand: "IQ Dent", manufacturer: "IQdent Sp. z o.o.", name: `IQ Dent ${model}`, categoryPath: `IQ Dent / ${section}`, sourcePages: new Set(), refs: new Set() };
      product.sourcePages.add(pageNo); product.refs.add(model); products.set(id, product);
    }
  }
  const pageWidth = page.getViewport({ scale: 1 }).width;
  for (const item of rawItems) for (const match of item.text.matchAll(/\b((?:1|2|3)\d{2}\.\d{3}\.\d{3})\b/gu)) {
    const baseRef = match[1]; const shape = baseRef.split(".")[1]; const id = `IQDENT-BUR-${shape}`;
    const product = products.get(id) ?? { officialProductId: id, brand: "IQ Dent", manufacturer: "IQdent Sp. z o.o.", name: `IQ Dent dental bur, shape ${shape}`, categoryPath: `IQ Dent / ${section}`, sourcePages: new Set(), refs: new Set() };
    product.sourcePages.add(pageNo);
    const half = item.x < pageWidth / 2 ? 0 : 1;
    const candidateTexts = [item.text.slice((match.index ?? 0) + match[0].length), ...rawItems.filter((candidate) => candidate !== item && (candidate.x < pageWidth / 2 ? 0 : 1) === half && candidate.x >= item.x && Math.abs(candidate.y - item.y) <= 5 && !/(?:1|2|3)\d{2}\.\d{3}\.\d{3}/u.test(candidate.text)).map((candidate) => candidate.text)];
    for (const size of candidateTexts.join(" ").match(/\b\d{3}\b/gu) ?? []) product.refs.add(`${baseRef}.${size}`);
    products.set(id, product);
  }
}
const result = [...products.values()].map((product) => { const refs = [...product.refs].sort(); const pages = [...product.sourcePages].sort((a, b) => a - b); return { officialProductId: product.officialProductId, brand: product.brand, manufacturer: product.manufacturer, name: product.name, manufacturerRef: refs.length === 1 ? refs[0] : "", manufacturerRefs: refs.join(" | "), model: product.name.replace(/^IQ Dent /u, ""), variantCount: Math.max(1, refs.length), variants: refs.length ? refs.map((manufacturerRef) => ({ variantLabel: `REF ${manufacturerRef}`, manufacturerRef, status: "OFFICIAL_REFERENCE_COLLECTED_KZ_AVAILABILITY_REVIEW_REQUIRED" })) : [{ variantLabel: product.name, manufacturerRef: "", status: "MANUFACTURER_REFERENCE_REQUIRED" }], categoryPath: product.categoryPath, description: "Official IQ Dent bur family. Exact shank, grit and diameter are encoded in the manufacturer reference.", sourceImageUrl: "", imageUrls: "", imageCount: 0, sourcePageUrl: "https://iqdent.pl/wp-content/uploads/2025/01/iqdent_katalog_web.pdf", sourcePdfPages: pages.join(" | "), additionalSourceUrls: "https://iqdent.pl/ | https://iqdent.pl/instructions/", kzEvidence: "BRAND_AND_SELECTED_PRODUCTS_OBSERVED_IN_KAZAKHSTAN_EXACT_SKU_REVIEW_REQUIRED", status: "PHOTO_REQUIRED" }; }).sort((a, b) => a.name.localeCompare(b.name, "en"));
await fs.mkdir(path.dirname(path.resolve(outputArg)), { recursive: true });
await fs.writeFile(path.resolve(outputArg), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ pdfPages: pdf.numPages, discoveredBurFamilies: result.length, variantSkus: result.reduce((sum, product) => sum + product.variantCount, 0) }, null, 2));
