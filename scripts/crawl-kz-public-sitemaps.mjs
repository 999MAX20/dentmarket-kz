import fs from 'node:fs/promises';

const targets = [
  { source: 'dentalmarket-kz', supplier: 'Dentalmarket.kz', sitemap: 'https://dentalmarket.kz/sitemap.xml', pattern: /\/product\//i },
  { source: 'dental-market-kz', supplier: 'DM Market', sitemap: 'https://dental-market.kz/sitemap.xml', pattern: /\/catalog\//i },
  { source: 'ddd-kz', supplier: 'Durable Dental Development', sitemap: 'https://ddd.com.kz/sitemap_products-0.xml', pattern: /\.html$/i },
  { source: 'amdgroup-public', supplier: 'AMDgroup', sitemap: 'https://amdgroup.kz/sitemap.xml', pattern: /\/catalog\/[^/]+\/[^/]+\/$/i },
  { source: 'stomir-public', supplier: 'СТОМир', sitemap: 'https://stomir.kz/sitemap.xml', pattern: /\/catalog\/[^/]+\/\d{6,}$/i },
  { source: 'mediclus-kz', supplier: 'Mediclus', sitemap: 'https://mediclus.kz/sitemap.xml', pattern: /\/catalog\/product\//i },
  { source: 'nordstom-public', supplier: 'NORD STOM', sitemap: 'https://nordstom.kz/sitemap.xml', pattern: /\/catalog\/[^/]+\/[^/]+$/i },
  { source: 'profident-s-kz', supplier: 'Profident-S', sitemap: 'https://profident-s.kz/wp-sitemap-posts-product-1.xml', pattern: /./i },
];
const concurrency = Number(process.env.KZ_CATALOG_CONCURRENCY || 16);
const maxUrlsPerSource = Number(process.env.KZ_CATALOG_MAX_URLS || 3000);
const selectedSources = process.env.KZ_CATALOG_SOURCES ? new Set(process.env.KZ_CATALOG_SOURCES.split(',').map((value) => value.trim())) : null;
const sitemapOnly = process.env.KZ_SITEMAP_ONLY === '1';
const headers = { 'user-agent': 'Mozilla/5.0 (compatible; DentalMarketplaceCatalogResearch/1.0)' };
const clean = (value) => String(value || '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
async function get(url) {
  const signal = AbortSignal.timeout(Number(process.env.KZ_CATALOG_TIMEOUT_MS || 12000));
  const response = await fetch(url, { headers, signal });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}
async function pool(items, worker) { const result = []; let next = 0; await Promise.all(Array.from({ length: concurrency }, async () => { while (true) { const i = next++; if (i >= items.length) return; try { result[i] = await worker(items[i]); } catch { result[i] = null; } } })); return result.filter(Boolean); }
const rows = [];
for (const target of targets.filter((item) => !selectedSources || selectedSources.has(item.source))) {
  const sitemap = await get(target.sitemap);
  const discoveredUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]).filter((url) => target.pattern.test(url));
  const urls = discoveredUrls.slice(0, maxUrlsPerSource);
  const parsed = await pool(urls, async (url) => {
    const html = sitemapOnly ? '' : await get(url);
    const slugName = decodeURIComponent(url.split('/').filter(Boolean).pop() || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    const name = clean(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || slugName);
    if (!name) return null;
    const externalId = url.match(/(?:product\/|p)([0-9]+)/i)?.[1] || url.split('/').filter(Boolean).pop();
    const price = clean(html.match(/([\d\s]+)\s*(?:₸|тг|тенге)/i)?.[1]).replace(/\s/g, '');
    return { source_slug: target.source, supplier_name: target.supplier, source_url: url, external_id: externalId, name: name.replace(/\s*[|–-]\s*.+$/, ''), brand: '', category: 'Стоматологические товары', unit: 'piece', currency: 'KZT', price, quantity: '', is_regulated: 'false', notes: `Публичная карточка ${target.supplier}; цена, остаток и compliance требуют подтверждения поставщиком.` };
  });
  rows.push(...parsed);
  console.log(JSON.stringify({ source: target.source, discovered: discoveredUrls.length, sampled: urls.length, rows: parsed.length }));
}
const unique = new Map(rows.map((row) => [`${row.source_slug}|${row.external_id}|${row.name}`, row]));
const columns = ['source_slug','supplier_name','source_url','external_id','name','brand','category','unit','currency','price','quantity','is_regulated','notes'];
await fs.mkdir('data/imports', { recursive: true });
await fs.writeFile('data/imports/kz-public-sitemaps.csv', [columns.join(','), ...[...unique.values()].map((row) => columns.map((column) => esc(row[column])).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ rows: unique.size, out: 'data/imports/kz-public-sitemaps.csv' }));
