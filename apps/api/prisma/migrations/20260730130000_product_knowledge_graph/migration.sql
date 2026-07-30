CREATE TYPE "ProductRelationType" AS ENUM (
  'COMPATIBLE_WITH',
  'REPLACES',
  'CONSUMABLE_FOR',
  'USED_WITH',
  'SUCCESSOR_OF',
  'DISCONTINUED_REPLACED_BY'
);

CREATE TYPE "ProductRelationStatus" AS ENUM (
  'SUGGESTED',
  'VERIFIED',
  'REJECTED',
  'ARCHIVED'
);

CREATE TABLE "ProductRelation" (
  "id" UUID NOT NULL,
  "fromProductId" UUID NOT NULL,
  "toProductId" UUID NOT NULL,
  "type" "ProductRelationType" NOT NULL,
  "status" "ProductRelationStatus" NOT NULL DEFAULT 'SUGGESTED',
  "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  "sourceType" "ProductContentSourceType" NOT NULL DEFAULT 'DENTMARKET_EDITOR',
  "sourceUrl" TEXT,
  "evidence" JSONB,
  "notes" TEXT,
  "validFrom" TIMESTAMP(3),
  "validTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductRelation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductRelation_fromProductId_toProductId_type_key"
  ON "ProductRelation"("fromProductId", "toProductId", "type");
CREATE INDEX "ProductRelation_fromProductId_type_status_idx"
  ON "ProductRelation"("fromProductId", "type", "status");
CREATE INDEX "ProductRelation_toProductId_type_status_idx"
  ON "ProductRelation"("toProductId", "type", "status");

ALTER TABLE "ProductRelation"
  ADD CONSTRAINT "ProductRelation_fromProductId_fkey"
  FOREIGN KEY ("fromProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductRelation"
  ADD CONSTRAINT "ProductRelation_toProductId_fkey"
  FOREIGN KEY ("toProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
