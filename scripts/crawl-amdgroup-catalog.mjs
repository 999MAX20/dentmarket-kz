import fs from "node:fs/promises";
const base = "https://amdgroup.kz";
const headers = {
  "user-agent":
    "Mozilla/5.0 (compatible; DentalMarketplaceCatalogResearch/1.0)",
};
const concurrency = 24;
const clean = (s) =>
  (s || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const esc = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
async function get(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw Error(r.status);
  return r.text();
}
async function pool(items, worker) {
  const out = [];
  let n = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = n++;
        if (i >= items.length) return;
        try {
          out[i] = await worker(items[i]);
        } catch {
          out[i] = "";
        }
      }
    }),
  );
  return out;
}
const hrefs = (html) => [
  ...new Set(
    [...html.matchAll(/href=["'](\/catalog\/[^"'#?]+\/?)["']/gi)].map(
      (m) => m[1],
    ),
  ),
];
const home = await get(base + "/catalog/materialy_/");
const cats = [
  ...new Set(
    hrefs(home).filter((x) => x.split("/").filter(Boolean).length === 2),
  ),
].slice(0, 18);
const pages = await pool(
  cats.flatMap((c) =>
    Array.from(
      { length: 6 },
      (_, i) => `${base}${c}${i ? "?PAGEN_1=" + (i + 1) : ""}`,
    ),
  ),
  async (u) => {
    try {
      return await get(u);
    } catch {
      return "";
    }
  },
);
const productLinks = new Set();
for (const html of pages) {
  for (const h of hrefs(html)) {
    const parts = h.split("/").filter(Boolean);
    if (parts.length >= 3 && !h.includes("compare")) productLinks.add(h);
  }
}
const rows = await pool([...productLinks], async (path) => {
  const h = await get(base + path);
  const title = clean(
    h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ||
      h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
  );
  if (!title) return null;
  const sku =
    clean(h.match(/(?:Артикул|Код товара|Код)\s*[:№]?\s*([^<\n]+)/i)?.[1]) ||
    path.split("/").filter(Boolean).pop();
  return {
    source_slug: "amdgroup",
    supplier_name: "ТОО AMDgroup",
    source_url: base + path,
    external_id: sku,
    name: title,
    brand: "",
    category: "Стоматологические товары",
    unit: "piece",
    currency: "KZT",
    price: "",
    quantity: "",
    is_regulated: "false",
    notes:
      "Публичная карточка каталога AMDgroup; цена и наличие требуют подтверждения поставщиком",
  };
});
const uniq = new Map();
for (const r of rows.filter(Boolean)) uniq.set(`${r.external_id}|${r.name}`, r);
const cols = [
  "source_slug",
  "supplier_name",
  "source_url",
  "external_id",
  "name",
  "brand",
  "category",
  "unit",
  "currency",
  "price",
  "quantity",
  "is_regulated",
  "notes",
];
await fs.writeFile(
  "data/imports/amdgroup-crawled-catalog.csv",
  [
    cols.join(","),
    ...[...uniq.values()].map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n") + "\n",
);
console.log(
  JSON.stringify({
    categories: cats.length,
    productLinks: productLinks.size,
    rows: uniq.size,
  }),
);
