-- Historical pilot imports could leave ProductPackaging.unitId pointing at a
-- unit that was later removed before the FK was enforced. Prisma treats the
-- relation as required and rejects the whole catalog result when this occurs.
-- Repair the reference from the variant sale unit, then the product base unit,
-- and finally the canonical active "piece" unit. No product, offer, or price is
-- removed by this migration.
UPDATE "ProductPackaging" AS packaging
SET "unitId" = COALESCE(
  variant."saleUnitId",
  product."baseUnitId",
  (
    SELECT unit.id
    FROM "UnitOfMeasure" AS unit
    ORDER BY CASE WHEN lower(unit.symbol) IN ('шт', 'шт.', 'pcs', 'piece') THEN 0 ELSE 1 END,
             unit.code ASC
    LIMIT 1
  )
)
FROM "ProductVariant" AS variant
JOIN "Product" AS product ON product.id = variant."productId"
WHERE packaging."productVariantId" = variant.id
  AND NOT EXISTS (
    SELECT 1
    FROM "UnitOfMeasure" AS existing_unit
    WHERE existing_unit.id = packaging."unitId"
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProductPackaging" AS packaging
    LEFT JOIN "UnitOfMeasure" AS unit ON unit.id = packaging."unitId"
    WHERE unit.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ProductPackaging rows with invalid unit references remain after repair';
  END IF;
END $$;
