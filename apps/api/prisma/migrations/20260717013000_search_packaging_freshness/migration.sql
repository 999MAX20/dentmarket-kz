-- CreateEnum
CREATE TYPE "PackagingLevel" AS ENUM ('BASE', 'SALE', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "FreshnessDataType" AS ENUM ('PRICE', 'INVENTORY');

-- CreateEnum
CREATE TYPE "FreshnessExpirationBehavior" AS ENUM ('ALLOW_AUTO', 'REQUIRE_CONFIRMATION', 'MARK_UNKNOWN', 'PAUSE');

-- CreateEnum
CREATE TYPE "DataOverrideTarget" AS ENUM ('PRICE', 'INVENTORY');

-- CreateEnum
CREATE TYPE "DataOverrideMode" AS ENUM ('UNTIL_DATE', 'UNTIL_NEXT_SYNC', 'ONE_TIME', 'PERMANENT');

-- CreateEnum
CREATE TYPE "DataOverrideStatus" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "InventoryBalance" ADD COLUMN     "freshnessExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OfferPrice" ADD COLUMN     "freshnessExpiresAt" TIMESTAMP(3),
ADD COLUMN     "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "ProductSearchDocument" ADD COLUMN     "categoryIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "cityIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "deliveryMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "industryIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxNormalizedPriceMinor" DECIMAL(24,6),
ADD COLUMN     "maxPriceMinor" DECIMAL(20,0),
ADD COLUMN     "minNormalizedPriceMinor" DECIMAL(24,6),
ADD COLUMN     "minPriceMinor" DECIMAL(20,0),
ADD COLUMN     "supplierIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "warehouseIds" UUID[] DEFAULT ARRAY[]::UUID[];

-- AlterTable
ALTER TABLE "SupplierOffer" ADD COLUMN     "packagingId" UUID;

-- CreateTable
CREATE TABLE "ProductPackaging" (
    "id" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "unitId" UUID NOT NULL,
    "parentPackagingId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "PackagingLevel" NOT NULL,
    "quantityInBaseUnit" DECIMAL(24,6) NOT NULL,
    "unitsPerParent" DECIMAL(24,6),
    "gtin" TEXT,
    "netWeightGrams" DECIMAL(18,3),
    "grossWeightGrams" DECIMAL(18,3),
    "lengthMm" DECIMAL(18,3),
    "widthMm" DECIMAL(18,3),
    "heightMm" DECIMAL(18,3),
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductPackaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreshnessPolicy" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID,
    "scopeKey" TEXT NOT NULL,
    "source" "OfferSourceType" NOT NULL,
    "dataType" "FreshnessDataType" NOT NULL,
    "staleAfterMinutes" INTEGER NOT NULL,
    "expirationBehavior" "FreshnessExpirationBehavior" NOT NULL,
    "confirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreshnessPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataOverride" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "offerId" UUID,
    "inventoryBalanceId" UUID,
    "previousOverrideId" UUID,
    "target" "DataOverrideTarget" NOT NULL,
    "mode" "DataOverrideMode" NOT NULL,
    "status" "DataOverrideStatus" NOT NULL DEFAULT 'ACTIVE',
    "value" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductPackaging_productVariantId_level_status_idx" ON "ProductPackaging"("productVariantId", "level", "status");

-- CreateIndex
CREATE INDEX "ProductPackaging_gtin_idx" ON "ProductPackaging"("gtin");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPackaging_productVariantId_code_key" ON "ProductPackaging"("productVariantId", "code");

-- CreateIndex
CREATE INDEX "FreshnessPolicy_supplierOrganizationId_status_priority_idx" ON "FreshnessPolicy"("supplierOrganizationId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "FreshnessPolicy_scopeKey_source_dataType_key" ON "FreshnessPolicy"("scopeKey", "source", "dataType");

-- CreateIndex
CREATE INDEX "DataOverride_supplierOrganizationId_target_status_idx" ON "DataOverride"("supplierOrganizationId", "target", "status");

-- CreateIndex
CREATE INDEX "DataOverride_offerId_target_status_idx" ON "DataOverride"("offerId", "target", "status");

-- CreateIndex
CREATE INDEX "DataOverride_inventoryBalanceId_target_status_idx" ON "DataOverride"("inventoryBalanceId", "target", "status");

-- CreateIndex
CREATE INDEX "DataOverride_status_validUntil_idx" ON "DataOverride"("status", "validUntil");

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_parentPackagingId_fkey" FOREIGN KEY ("parentPackagingId") REFERENCES "ProductPackaging"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_packagingId_fkey" FOREIGN KEY ("packagingId") REFERENCES "ProductPackaging"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FreshnessPolicy" ADD CONSTRAINT "FreshnessPolicy_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataOverride" ADD CONSTRAINT "DataOverride_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataOverride" ADD CONSTRAINT "DataOverride_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataOverride" ADD CONSTRAINT "DataOverride_inventoryBalanceId_fkey" FOREIGN KEY ("inventoryBalanceId") REFERENCES "InventoryBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataOverride" ADD CONSTRAINT "DataOverride_previousOverrideId_fkey" FOREIGN KEY ("previousOverrideId") REFERENCES "DataOverride"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Packaging, freshness and manual-override invariants.
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_quantity_check" CHECK ("quantityInBaseUnit" > 0 AND ("unitsPerParent" IS NULL OR "unitsPerParent" > 0));
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_weight_check" CHECK (("netWeightGrams" IS NULL OR "netWeightGrams" > 0) AND ("grossWeightGrams" IS NULL OR "grossWeightGrams" > 0) AND ("grossWeightGrams" IS NULL OR "netWeightGrams" IS NULL OR "grossWeightGrams" >= "netWeightGrams"));
ALTER TABLE "ProductPackaging" ADD CONSTRAINT "ProductPackaging_dimensions_check" CHECK (("lengthMm" IS NULL OR "lengthMm" > 0) AND ("widthMm" IS NULL OR "widthMm" > 0) AND ("heightMm" IS NULL OR "heightMm" > 0));
ALTER TABLE "FreshnessPolicy" ADD CONSTRAINT "FreshnessPolicy_threshold_check" CHECK ("staleAfterMinutes" > 0 AND priority >= 0);
ALTER TABLE "DataOverride" ADD CONSTRAINT "DataOverride_scope_check" CHECK ((target = 'PRICE' AND "offerId" IS NOT NULL AND "inventoryBalanceId" IS NULL) OR (target = 'INVENTORY' AND "inventoryBalanceId" IS NOT NULL));
ALTER TABLE "DataOverride" ADD CONSTRAINT "DataOverride_validity_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "validFrom");
ALTER TABLE "DataOverride" ADD CONSTRAINT "DataOverride_until_date_check" CHECK (mode <> 'UNTIL_DATE' OR "validUntil" IS NOT NULL);

CREATE UNIQUE INDEX "DataOverride_one_active_offer_target_idx" ON "DataOverride" ("offerId", target) WHERE status = 'ACTIVE' AND "offerId" IS NOT NULL;
CREATE UNIQUE INDEX "DataOverride_one_active_balance_target_idx" ON "DataOverride" ("inventoryBalanceId", target) WHERE status = 'ACTIVE' AND "inventoryBalanceId" IS NOT NULL;
