import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://www.castellini.com";
const sitemapUrl = `${baseUrl}/sitemap.xml`;
const jsonOutputPath = path.resolve("data/catalog-evidence/castellini-manufacturer-catalog.json");
const queueOutputPath = path.resolve("data/curation/castellini-manufacturer-catalog-queue.csv");
const directProducts = [
  ["/en/dental-units/area", "AREA"], ["/en/dental-units/puma-eli-r", "Puma Eli R"], ["/en/dental-units/puma-eli-ambidex", "Puma Eli Ambidextrous"],
  ["/en/dental-units/skema-8", "Skema 8"], ["/en/dental-units/skema-6", "Skema 6"], ["/en/dental-units/skema-5", "Skema 5"], ["/en/dental-units/surgical-cart", "Surgical Cart"],
];
const categoryProducts = [
  ["/en/sterilisation/sealing-machines", "Упаковочное оборудование", ["Millseal+ EVO", "Millseal+ Manual", "Millseal Rolling"]],
  ["/en/sterilisation/rotary-instrument-maintenance", "Обслуживание наконечников", ["Thalya", "Thalya PLUS"]],
  ["/en/sterilisation/thermodisinfectors", "Термодезинфекторы", ["Tethys H10", "HMD accessory", "Tethys"]],
  ["/en/sterilisation/autoclaves", "Автоклавы", ["C-Platinum", "C Plus", "C-17", "C-22", "C-28"]],
  ["/en/extraoral-devices", "Экстраоральная визуализация", ["X-RADiUS TRiO PLUS", "X-RADiUS TRiO PLUS FullView"]],
  ["/en/imaging/sensors", "Интраоральные датчики", ["X-VISUS DCiS", "X-VS E", "X-VS"]],
  ["/en/imaging/intraoral-scanners", "Интраоральные сканеры", ["AlphaScan WR", "AlphaScan WL"]],
  ["/en/imaging/radiographic-devices", "Интраоральные рентген-аппараты", ["RX DC"]],
  ["/en/dental-units/stools", "Стулья врача и ассистента", ["C7 Stool", "C8 Stool", "C9 Stool"]],
  ["/en/dental-units/disinfectants-and-lubricants", "Расходные материалы для оборудования", ["Ster 1 Plus", "Ster 3 Plus", "PEROXY Ag+", "DAILY OIL PLUS"]],
  ["/en/dental-units/turbines-and-contra-angles", "Наконечники", ["Silent Power Evo", "Goldspeed Evo"]],
  ["/en/dental-units/scalers", "Скалеры", ["Piezolight 6 / Piezosteril 6", "Surgison 2"]],
  ["/en/dental-units/micromotors", "Микромоторы", ["Handy Power Micromotor", "Implantor LED Micromotor", "Implantor LED Fluo Micromotor"]],
  ["/en/dental-units/syringes", "Стоматологические шприцы", ["Castellini Syringes"]],
  ["/en/dental-units/autosteril-and-mwb", "Гигиена стоматологической установки", ["Autosteril", "M.W.B."]],
  ["/en/products/neowise", "Программное обеспечение", ["Neowise"]], ["/en/products/diva", "Программное обеспечение", ["Di.V.A."]],
  ["/en/software/irys", "Программное обеспечение", ["iRYS"]], ["/en/software/exocad", "Программное обеспечение", ["exocad"]],
];
const decode = (value) => String(value ?? "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&quot;/giu, '"').replace(/&#0?39;|&apos;/giu, "'").replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
const token = (value) => decode(value).normalize("NFKD").replace(/[^A-Za-z0-9А-Яа-я]+/gu, "-").replace(/^-|-$/gu, "").toUpperCase();
const escapeCsv = (value) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text; };
async function requestText(url) { const response = await fetch(url, { headers: { "user-agent": "DentMarket Kazakhstan manufacturer catalog audit/1.0" }, signal: AbortSignal.timeout(30_000) }); if (!response.ok) throw new Error(url + ": HTTP " + response.status); return response.text(); }
const meta = (html, property) => decode(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)`, "iu"))?.[1] ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, "iu"))?.[1]);
const images = (html) => [...html.matchAll(/<img\b[^>]*>/giu)].map((match) => ({ alt: decode(match[0].match(/alt=["']([^"']*)/iu)?.[1]), src: decode(match[0].match(/src=["']([^"']*)/iu)?.[1]) })).filter((image) => image.src);
const exactImage = (name, pageImages) => { const search = token(name).replace(/-(?:STOOL|MICROMOTOR)$/u, ""); return pageImages.find((image) => token(image.alt || new URL(image.src, baseUrl).pathname).includes(search))?.src ?? ""; };
const variantsFor = (name) => name === "Piezolight 6 / Piezosteril 6" ? ["Piezolight 6", "Piezosteril 6"].map((label) => ({ variantId: token(label), label, manufacturerRef: "" }))
  : name === "Handy Power Micromotor" ? ["Handy Power", "Handy Power LED", "Handy Power LED FLUO"].map((label) => ({ variantId: token(label), label, manufacturerRef: "" })) : [];
const products = [];
const errors = [];
for (const [pathname, name] of directProducts) {
  const sourcePageUrl = new URL(pathname, baseUrl).href; try { const html = await requestText(sourcePageUrl); const sourceImageUrl = meta(html, "og:image");
    products.push({ name, categoryPath: "Стоматологические установки", description: meta(html, "description"), sourceImageUrl, sourcePageUrl, variants: [] });
  } catch (error) { errors.push({ sourcePageUrl, error: String(error) }); }
}
for (const [pathname, categoryPath, names] of categoryProducts) {
  const sourcePageUrl = new URL(pathname, baseUrl).href; try { const html = await requestText(sourcePageUrl); const pageImages = images(html); const description = meta(html, "description");
    for (const name of names) products.push({ name, categoryPath, description, sourceImageUrl: exactImage(name, pageImages), sourcePageUrl, variants: variantsFor(name) });
  } catch (error) { errors.push({ sourcePageUrl, error: String(error) }); }
}
const normalized = products.map((product) => { const variants = product.variants ?? []; const sourceImageUrl = product.sourceImageUrl ? new URL(product.sourceImageUrl, baseUrl).href : ""; return {
  officialProductId: `CASTELLINI-${token(product.name)}`, brand: "Castellini", manufacturer: "Cefla S.C.", name: product.name,
  manufacturerRef: "", manufacturerRefs: "", variantCount: Math.max(1, variants.length), variants, categoryPath: product.categoryPath,
  description: product.description, sourceImageUrl, imageUrls: sourceImageUrl, imageCount: sourceImageUrl ? 1 : 0, sourcePageUrl: product.sourcePageUrl,
  kzEvidence: "BRAND_PRESENTED_BY_KZ_SPECIALIZED_SELLER", status: sourceImageUrl ? "MANUFACTURER_REFERENCE_REQUIRED" : "PHOTO_REQUIRED" };
}).sort((a, b) => a.categoryPath.localeCompare(b.categoryPath, "ru") || a.name.localeCompare(b.name, "en"));
const report = { brand: "Castellini", manufacturer: "Cefla S.C.", sourceType: "OFFICIAL_CURRENT_ENGLISH_PRODUCT_PAGES", sourceUrl: sitemapUrl,
  lastChecked: new Date().toISOString().slice(0, 10), totals: { discoveredProducts: normalized.length, variantSkus: normalized.reduce((sum, product) => sum + product.variantCount, 0),
    productsWithReferences: 0, productsWithImages: normalized.filter((product) => product.imageCount > 0).length, productsQueuedForPhoto: normalized.filter((product) => product.imageCount === 0).length,
    crawlErrors: errors.length }, errors, products: normalized };
const headers = ["officialProductId", "brand", "manufacturer", "name", "manufacturerRef", "manufacturerRefs", "variantCount", "categoryPath", "description", "sourceImageUrl", "imageCount", "kzEvidence", "status", "sourcePageUrl"];
const csv = [headers.join(","), ...normalized.map((product) => headers.map((header) => escapeCsv(product[header])).join(","))].join("\n") + "\n";
await fs.mkdir(path.dirname(jsonOutputPath), { recursive: true }); await fs.mkdir(path.dirname(queueOutputPath), { recursive: true });
await Promise.all([fs.writeFile(jsonOutputPath, JSON.stringify(report, null, 2) + "\n"), fs.writeFile(queueOutputPath, csv)]);
console.log(JSON.stringify(report.totals, null, 2));
