import fs from "node:fs/promises";

const base = "https://a4d.kz";
const categories = [6, 28, 31, 17, 81, 27, 41, 82, 84, 85, 86, 87, 88, 89];
const maxPages = Number(process.env.A4D_MAX_PAGES || 250);
const concurrency = Number(process.env.A4D_CONCURRENCY || 8);
const out = process.env.A4D_OUT || "data/imports/allfordent-catalog.csv";
const headers = {
  "user-agent":
    "Mozilla/5.0 (compatible; DentalMarketplaceCatalogResearch/1.0)",
};

const clean = (s) =>
  (s || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const esc = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
async function get(url) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}
function links(html) {
  const out = new Set();
  for (const m of html.matchAll(/href=["'](\/content\/[^"'#?]+)["']/gi))
    out.add(m[1]);
  return [...out];
}
function first(html, re) {
  const m = html.match(re);
  return clean(m?.[1] || "");
}
async function pool(items, worker) {
  const result = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        try {
          result[i] = await worker(items[i], i);
        } catch {
          result[i] = null;
        }
      }
    }),
  );
  return result.filter(Boolean);
}

const productLinks = new Set();
for (const category of categories) {
  let empty = 0;
  for (let page = 0; page < maxPages && empty < 2; page++) {
    const url = `${base}/products?field_category_tid=${category}&field_brand_tid=All&field_marker_tid=All&page=${page}`;
    try {
      const found = links(await get(url));
      const before = productLinks.size;
      found.forEach((x) => productLinks.add(x));
      empty = productLinks.size === before ? empty + 1 : 0;
    } catch {
      empty++;
    }
  }
}

const rows = await pool([...productLinks], async (path) => {
  const html = await get(base + path);
  const title = first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const article = first(html, /Артикул\s*:\s*([^<\n]+)/i);
  const category = first(html, /Категория\s*:\s*([^<\n]+)/i);
  if (!title) return null;
  return {
    source_slug: "allfordent",
    supplier_name: "ТОО AllForDent",
    source_url: base + path,
    external_id: article || path.split("/").pop(),
    name: title,
    brand: "",
    category: category || "Стоматологические материалы",
    unit: "piece",
    currency: "KZT",
    price: "",
    quantity: "",
    is_regulated: "false",
    notes:
      "Публичная карточка каталога AllForDent; цена и наличие требуют подтверждения поставщиком.",
  };
});

const uniq = new Map();
for (const row of rows) uniq.set(`${row.external_id}|${row.name}`, row);
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
await fs.mkdir("data/imports", { recursive: true });
await fs.writeFile(
  out,
  [
    cols.join(","),
    ...[...uniq.values()].map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n") + "\n",
);
console.log(
  JSON.stringify({
    categories: categories.length,
    productLinks: productLinks.size,
    rows: uniq.size,
    out,
  }),
);
