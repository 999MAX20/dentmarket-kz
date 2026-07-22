import fs from "node:fs/promises";
const base = "https://stomir.kz";
const headers = {
  "user-agent":
    "Mozilla/5.0 (compatible; DentalMarketplaceCatalogResearch/1.0)",
};
const concurrency = Number(process.env.STOMIR_CONCURRENCY || 12);
const sitemapUrl = `${base}/sitemap.xml`;
const categories = [
  "endodontiya",
  "endodonticheskie_materialy",
  "otbelivanie_i_estetika",
  "zubnye_pasty",
  "opolaskivateli",
  "nabory_pierrot",
  "zubnye_schetki",
  "skrebki_ershi_flosssy",
  "otbelivayuschaya_sistema",
  "hirurgiya",
  "shovnyi_material",
  "hirurgicheskie_instrumenty",
  "zubotehnicheskii_material",
  "plastmassy",
  "zuby_iskusstvennye_i_rascvetka",
  "splavy_metallov",
  "diski",
  "shtifty",
  "kamen_shlifovalnyi",
  "instrumenty_i_akksesuary",
  "gipsy",
  "voski",
  "frezy",
  "sredstva_zaschity_i_gigieny_odnorazovye_nabory_i_instrumenty",
  "stomatologicheskie_odnorazovye_komplekty",
  "odnorazovaya_produkciya",
  "ortopediya",
  "alginatnaya_slepochnaya_massa",
  "slepochnye_massy",
  "prochee",
  "lozhki_ottisknye",
  "terapiya",
  "plombirovochnye_materialy_himicheskogo_otverzhdeniya",
  "sredstva_dlya_uhoda_i_obrabotki_dezinficiruyuschie_sredstva",
  "golovki_polirovalnye",
  "plombirovochnye_materialy_svetovogo_otverzhdeniya",
  "bondingovye_adgezivnye_sistemy_i_protravochnye_geli",
  "materialy_s_gidrookisyu_kalciya",
  "krovoostanavlivayuschie_sredstva",
  "profilakticheskie_materialy",
  "cementy_i_vspomogatelnye_sredstva",
  "anesteziruyuschie_sredstva_i_igly",
  "terapevticheskie_stomatologicheskie_instrumenty_i_aksessuary",
  "rashodnye_materialy_i_aksessuary",
  "rashodnye_terapevticheskie_materialy_i_aksessuary",
  "nakonechniki",
  "stomatologicheskoe_oborudovanie_i_nakonechniki",
  "bory",
  "sistema_kofferdam",
  "aksessuary_ukrasheniya_dlya_zubov_i_prochee",
  "ortodontiya",
  "instrumenty_ortodonticheskie.",
  "treiner-sistema",
  "aksessuary_i_prochee",
  "mikrovinty_ortodonticheskie_mini_implanty",
  "rashodnye_ortodonticheskie_materialy",
  "breket-sistema",
];
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
function links(html) {
  return [
    ...new Set(
      [...html.matchAll(/href=["'](\/catalog\/[^"'#?]+\/\d+)["']/gi)].map(
        (m) => m[1],
      ),
    ),
  ];
}
function first(html, re) {
  return clean(html.match(re)?.[1] || "");
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
          out[i] = null;
        }
      }
    }),
  );
  return out.filter(Boolean);
}
const categoryPages = await pool(
  categories.flatMap((cat) =>
    ["", "?page=2", "?page=3"].map(
      (suffix) => `${base}/catalog/${cat}${suffix}`,
    ),
  ),
  async (url) => {
    try {
      return await get(url);
    } catch {
      return "";
    }
  },
);
const productLinks = new Set();
for (const html of categoryPages)
  for (const p of links(html)) productLinks.add(p);
try {
  const sitemap = await get(sitemapUrl);
  for (const match of sitemap.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/giu)) {
    const url = new URL(match[1].replace(/^http:/iu, "https:"));
    if (/^\/catalog\/[^/]+\/\d+\/?$/u.test(url.pathname))
      productLinks.add(url.pathname.replace(/\/$/u, ""));
  }
} catch {
  // The live category pages remain authoritative when the legacy sitemap is unavailable.
}
const rows = await pool([...productLinks], async (path) => {
  const html = await get(base + path);
  const title =
    first(html, /<div class="product-card-name">([\s\S]*?)(?:<span>|<\/div>)/i) ||
    first(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    first(html, /<title[^>]*>([\s\S]*?)<\/title>/i).replace(/\s*[|].*$/, "");
  if (!title) return null;
  const sku =
    first(
      html,
      /<div class="product-card-art">\s*(?:Артикул|Код товара|Код)\s*[:№]?\s*([A-Za-zА-Яа-я0-9._/-]+)/i,
    ) || path.split("/").pop();
  const brand = first(
    html,
    /<div class="product-card-brand">\s*Бренд:\s*([\s\S]*?)<\/div>/i,
  ).replace(/,?\s*Inc\.?$/iu, "");
  return {
    source_slug: "stomir",
    supplier_name: "ТОО СТОМир",
    source_url: base + path,
    external_id: sku,
    name: title,
    brand,
    category: decodeURIComponent(path.split("/").filter(Boolean)[1] || "Стоматологические товары"),
    unit: "piece",
    currency: "KZT",
    price: "",
    quantity: "",
    is_regulated: "false",
    notes:
      "Публичная карточка каталога СТОМир; цена и наличие требуют подтверждения поставщиком.",
  };
});
const uniq = new Map();
for (const r of rows) uniq.set(`${r.external_id}|${r.name}`, r);
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
  "data/imports/stomir-crawled-catalog.csv",
  [
    cols.join(","),
    ...[...uniq.values()].map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n") + "\n",
);
console.log(
  JSON.stringify({
    productLinks: productLinks.size,
    rows: uniq.size,
    brandedRows: [...uniq.values()].filter((row) => row.brand).length,
    brands: [...new Set([...uniq.values()].map((row) => row.brand).filter(Boolean))].sort(),
  }),
);
