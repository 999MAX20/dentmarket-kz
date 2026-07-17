-- Build the FTS vector from normalized lower-case text so Cyrillic queries are
-- deterministic even when the database locale does not case-fold Cyrillic.
DROP INDEX IF EXISTS "ProductSearchDocument_searchVector_idx";
ALTER TABLE "ProductSearchDocument" DROP COLUMN IF EXISTS "searchVector";
ALTER TABLE "ProductSearchDocument"
  ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', "normalizedText")) STORED;
CREATE INDEX "ProductSearchDocument_searchVector_idx"
  ON "ProductSearchDocument" USING GIN ("searchVector");
