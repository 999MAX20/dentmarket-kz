import pg from '../apps/api/node_modules/pg/lib/index.js';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const cards = await client.query(`SELECT COUNT(*)::int AS count FROM "Product" WHERE "externalMetadata"->>'importedAsCanonicalDraft' = 'true'`);
  const indexed = await client.query(`SELECT COUNT(*)::int AS count FROM "Product" p JOIN "ProductSearchDocument" d ON d."productId" = p.id WHERE p."externalMetadata"->>'importedAsCanonicalDraft' = 'true'`);
  const categories = await client.query(`SELECT COUNT(*)::int AS count FROM "Product" p WHERE p."externalMetadata"->>'importedAsCanonicalDraft' = 'true' AND EXISTS (SELECT 1 FROM "ProductCategory" pc WHERE pc."productId" = p.id)`);
  const events = await client.query(`SELECT COUNT(*)::int AS count FROM "SearchQueryEvent" WHERE "createdAt" >= NOW() - INTERVAL '30 days'`);
  const topNoResults = await client.query(`SELECT "normalizedQuery" AS query, COUNT(*)::int AS searches, COUNT(*) FILTER (WHERE "resultCount" = 0)::int AS "noResults" FROM "SearchQueryEvent" WHERE "createdAt" >= NOW() - INTERVAL '30 days' GROUP BY "normalizedQuery" ORDER BY "noResults" DESC, searches DESC LIMIT 50`);
  console.log(JSON.stringify({ cards: cards.rows[0].count, indexed: indexed.rows[0].count, categorized: categories.rows[0].count, searchEvents30d: events.rows[0].count, topNoResultQueries: topNoResults.rows }, null, 2));
} finally { await client.end(); }
