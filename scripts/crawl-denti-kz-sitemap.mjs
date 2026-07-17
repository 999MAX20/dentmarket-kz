import fs from 'node:fs/promises';

const base = 'https://www.denti.kz';
const sitemap = `${base}/sitemap.xml`;
const concurrency = Number(process.env.DENTI_CONCURRENCY || 12);
const maxUrls = Number(process.env.DENTI_MAX_URLS || 10000);
const out = process.env.DENTI_OUT || 'data/imports/denti-kz-catalog.csv';
const headers = { 'user-agent': 'Mozilla/5.0 (compatible; DentalMarketplaceCatalogResearch/1.0)' };
const clean = (value) => String(value || '').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
async function get(url) { const response = await fetch(url, { headers }); if (!response.ok) throw new Error(`${response.status} ${url}`); return response.text(); }
async function pool(items, worker) {
  const result = []; let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => { while (true) { const index = next++; if (index >= items.length) return; try { result[index] = await worker(items[index]); } catch { result[index] = null; } } }));
  return result.filter(Boolean);
}
const index = await get(sitemap);
const sitemapUrls = [...index.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1]);
const productUrls = new Set();
for (const url of sitemapUrls) {
  if (!/sitemap-iblock/i.test(url)) continue;
  try { for (const match of (await get(url)).matchAll(/<loc>([^<]+)<\/loc>/gi)) { if (/\/orders\/blank_zakaza\//i.test(match[1])) productUrls.add(match[1]); } } catch {}
}
const urls = [...productUrls].slice(0, maxUrls);
const rows = await pool(urls, async (url) => {
  const html = await get(url);
  const name = clean(html.match(/class="[^"]*(?:main_catalog__item__block__top__name|product-item-detail__name)[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]);
  if (!name) return null;
  const parsedUrl = new URL(url);
  const article = clean(html.match(/(?:Артикул|Код товара|article)[^\dA-Za-zА-Яа-я]{0,20}([\dA-Za-zА-Яа-я._/-]+)/i)?.[1]) || parsedUrl.searchParams.get('oid') || parsedUrl.pathname.split('/').filter(Boolean).pop();
  const price = clean(html.match(/([\d\s]+)\s*(?:₸|тг|тенге)/i)?.[1]).replace(/\s/g, '');
  const brand = clean(html.match(/(?:Бренд|Производитель)[^<:]{0,20}:?\s*<[^>]+>([\s\S]*?)<\//i)?.[1]);
  const category = clean(html.match(/(?:Категория|Раздел)[^<:]{0,20}:?\s*<[^>]+>([\s\S]*?)<\//i)?.[1]) || 'Стоматологические товары';
  return { source_slug: 'denti-kz', supplier_name: 'Denti.kz', source_url: url, external_id: article, name, brand, category, unit: 'piece', currency: 'KZT', price, quantity: '', is_regulated: 'false', notes: 'Публичная карточка Denti.kz; цена и наличие требуют подтверждения поставщиком.' };
});
const unique = new Map();
for (const row of rows) unique.set(`${row.source_url}|${row.external_id}|${row.name}`, row);
const columns = ['source_slug','supplier_name','source_url','external_id','name','brand','category','unit','currency','price','quantity','is_regulated','notes'];
await fs.mkdir('data/imports', { recursive: true });
await fs.writeFile(out, [columns.join(','), ...[...unique.values()].map((row) => columns.map((column) => esc(row[column])).join(','))].join('\n') + '\n');
console.log(JSON.stringify({ sitemapFiles: sitemapUrls.length, discovered: productUrls.size, crawled: urls.length, rows: unique.size, out }));
