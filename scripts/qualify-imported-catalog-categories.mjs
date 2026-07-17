import pg from '../apps/api/node_modules/pg/lib/index.js';

const { Client } = pg;
const categories = [
  ['auto-endodontics', 'Эндодонтия'], ['auto-therapy', 'Терапия'], ['auto-surgery', 'Хирургия'],
  ['auto-implantology', 'Имплантология'], ['auto-orthodontics', 'Ортодонтия'], ['auto-orthopedics', 'Ортопедия'],
  ['auto-laboratory', 'Зуботехническая лаборатория'], ['auto-instruments', 'Инструменты'], ['auto-equipment', 'Оборудование'],
  ['auto-prevention', 'Профилактика и гигиена'], ['auto-consumables', 'Расходные материалы'],
];
const categoryCase = `CASE
  WHEN lower(p."canonicalName") ~ '(энд|канал|гуттапер|силер|апекслок|файл|ирригац|обтурац)' THEN 'auto-endodontics'
  WHEN lower(p."canonicalName") ~ '(имплант|абатмент|формировател|мембран|костн|трансфер)' THEN 'auto-implantology'
  WHEN lower(p."canonicalName") ~ '(брекет|ортодонт|элайнер|капп|дуг[аи]|лигатур|ретейнер|трейнер|мини.?винт)' THEN 'auto-orthodontics'
  WHEN lower(p."canonicalName") ~ '(коронк|винир|циркон|керамик|артикулятор|слепочн|оттиск|альгинат|силикон)' THEN 'auto-orthopedics'
  WHEN lower(p."canonicalName") ~ '(хирург|элеватор|щипц|скальпел|шовн|гемостат|кюрет|распатор|физиодиспенсер)' THEN 'auto-surgery'
  WHEN lower(p."canonicalName") ~ '(пломб|композит|бонд|адгезив|протрав|цемент|стеклоиономер|герметик|фторлак|прокладк|ламп|фотополимер)' THEN 'auto-therapy'
  WHEN lower(p."canonicalName") ~ '(бр|бор|фрез|зеркал|зонд|пинцет|экскаватор|гладилк|штопфер|скейлер|наконечник)' THEN 'auto-instruments'
  WHEN lower(p."canonicalName") ~ '(установк|автоклав|компрессор|сканер|рентген|визиограф|ортопантомограф|фрезер|печь|муфель)' THEN 'auto-equipment'
  WHEN lower(p."canonicalName") ~ '(полиров|паста|отбел|air.?flow|профилакт|чистк|аппликатор|щетк)' THEN 'auto-prevention'
  WHEN lower(p."canonicalName") ~ '(гипс|воск|акрил|пластмасс|кювет|лаборатор|моделиров|пескостру)' THEN 'auto-laboratory'
  WHEN lower(p."canonicalName") ~ '(перчат|маск|салфет|нагруд|ватн|слюноотсос|аспирац|картридж|пакет|дезинф|стерилиз)' THEN 'auto-consumables'
  ELSE 'auto-consumables' END`;
const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('BEGIN');
  const industry = (await client.query('SELECT id FROM "Industry" WHERE code = $1', ['dentistry-kz'])).rows[0];
  if (!industry) throw new Error('dentistry-kz industry is missing');
  for (const [code, name] of categories) {
    await client.query(`INSERT INTO "Category" (id, "industryId", code, "nameRu", "nameKk", path, depth, status) VALUES (gen_random_uuid(), $1, $2, $3, $3, $2, 0, 'ACTIVE') ON CONFLICT ("industryId", code) DO NOTHING`, [industry.id, code, name]);
  }
  const removed = await client.query(`DELETE FROM "ProductCategory" pc USING "Category" c, "Product" p WHERE pc."categoryId" = c.id AND pc."productId" = p.id AND c.code = 'imported-catalog' AND p."externalMetadata"->>'importedAsCanonicalDraft' = 'true'`);
  const assigned = await client.query(`INSERT INTO "ProductCategory" ("productId", "categoryId") SELECT p.id, c.id FROM "Product" p JOIN "Category" c ON c."industryId" = $1 AND c.code = ${categoryCase} WHERE p."externalMetadata"->>'importedAsCanonicalDraft' = 'true' AND NOT EXISTS (SELECT 1 FROM "ProductCategory" existing WHERE existing."productId" = p.id) ON CONFLICT DO NOTHING`, [industry.id]);
  await client.query(`UPDATE "ProductSearchDocument" d SET "categoryIds" = source.ids, facets = jsonb_set(COALESCE(d.facets, '{}'::jsonb), '{categoryIds}', to_jsonb(source.ids)) FROM (SELECT p.id, ARRAY_AGG(pc."categoryId") AS ids FROM "Product" p JOIN "ProductCategory" pc ON pc."productId" = p.id WHERE p."externalMetadata"->>'importedAsCanonicalDraft' = 'true' GROUP BY p.id) source WHERE d."productId" = source.id`);
  await client.query('COMMIT');
  console.log(JSON.stringify({ removedTechnicalCategoryLinks: removed.rowCount, assignedCategories: assigned.rowCount }));
} catch (error) { await client.query('ROLLBACK'); throw error; } finally { await client.end(); }
