import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT_PART_UID = "234807537752";
const RECORD_ID = "1590129303";
const PROJECT_ID = "14201023";
const PAGE_SIZE = 100;
const ENDPOINT = "https://store.tildaapi.pro/api/getproductslist/";
const SOURCE_URL = "https://medstom.kz/catalog";
const OUTPUT_PATH = resolve("apps/buyer-web/app/data/medstom-catalog.json");
const CSV_PATH = resolve("data/imports/medstom-catalog.csv");

const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

function endpointFor(slice) {
  const query = new URLSearchParams({
    storepartuid: ROOT_PART_UID,
    recid: RECORD_ID,
    getparts: "true",
    getoptions: "true",
    size: String(PAGE_SIZE),
    flag_root: "withroot",
    projectid: PROJECT_ID,
  });
  if (slice > 1) query.set("slice", String(slice));
  return `${ENDPOINT}?${query}`;
}

async function loadSlice(slice) {
  const response = await fetch(endpointFor(slice), {
    headers: { "user-agent": "DentMarket-KZ-Catalog-Importer/1.0 (+https://dentmarket-kz.vercel.app/about)" },
  });
  if (!response.ok) throw new Error(`Medstom catalog request failed: ${response.status} ${response.statusText}`);
  return response.json();
}

function parsePartUids(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseMoney(value) {
  const amount = Number.parseFloat(String(value || ""));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(products) {
  const columns = ["externalId", "name", "supplierSku", "brand", "manufacturer", "unit", "priceMinor", "currency", "quantityOnHand", "category", "sourceUrl", "sourceUpdatedAt"];
  return [columns.join(","), ...products.map((product) => columns.map((column) => escapeCsv(product[column])).join(","))].join("\n") + "\n";
}

const first = await loadSlice(1);
const pages = Math.max(1, Math.ceil(Number(first.total || first.products?.length || 0) / PAGE_SIZE));
const responses = [first];
for (let slice = 2; slice <= pages; slice += 1) {
  await wait(350);
  responses.push(await loadSlice(slice));
}

const parts = new Map((first.parts || []).map((part) => [String(part.uid), part]));
const seen = new Set();
const importedAt = new Date().toISOString();
const products = responses
  .flatMap((response) => response.products || [])
  .filter((product) => product?.uid && product?.title && !seen.has(String(product.uid)) && seen.add(String(product.uid)))
  .map((product) => {
    const category = parsePartUids(product.partuids)
      .map((uid) => parts.get(uid))
      .find((part) => part && !part.root);
    const priceMinor = parseMoney(product.price);
    const edition = Array.isArray(product.editions) ? product.editions[0] : null;
    return {
      externalId: String(product.uid),
      name: String(product.title).replace(/\s+/g, " ").trim(),
      supplierSku: String(product.sku || edition?.sku || "").trim(),
      brand: "",
      manufacturer: "",
      unit: String(product.unit || "шт").trim(),
      priceMinor: priceMinor === null ? "" : String(priceMinor),
      currency: "KZT",
      quantityOnHand: String(product.quantity || edition?.quantity || "").trim(),
      category: String(category?.title || "Стоматология"),
      categoryExternalId: String(category?.uid || ROOT_PART_UID),
      sourceUrl: SOURCE_URL,
      sourceUpdatedAt: importedAt,
    };
  })
  .sort((left, right) => left.category.localeCompare(right.category, "ru") || left.name.localeCompare(right.name, "ru"));

const snapshot = {
  source: { supplier: "Medstom KZ", url: SOURCE_URL, importedAt, method: "public-tilda-store-api" },
  total: products.length,
  categories: [...new Set(products.map((product) => product.category))].sort((left, right) => left.localeCompare(right, "ru")),
  products,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await mkdir(dirname(CSV_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
await writeFile(CSV_PATH, toCsv(products), "utf8");
console.log(`Imported ${products.length} products from ${snapshot.categories.length} Medstom KZ categories.`);
console.log(`Marketplace snapshot: ${OUTPUT_PATH}`);
console.log(`Supplier import CSV: ${CSV_PATH}`);
