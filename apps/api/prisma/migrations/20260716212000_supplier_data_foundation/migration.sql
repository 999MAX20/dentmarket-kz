-- CreateEnum
CREATE TYPE "SupplierDataSourceType" AS ENUM ('MANUAL', 'CSV', 'EXCEL', 'API', 'ERP');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'MAPPED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('RAW', 'NORMALIZED', 'MATCH_PENDING', 'MATCHED', 'REJECTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MatchCandidateStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplierOfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OfferPublicationStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'HIDDEN', 'BLOCKED', 'PAUSED', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "OfferPriceStatus" AS ENUM ('ACTIVE', 'SCHEDULED', 'EXPIRED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OfferConfirmationMode" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "OfferSourceType" AS ENUM ('MANUAL', 'IMPORT', 'API', 'ERP');

-- CreateEnum
CREATE TYPE "InventoryAvailabilityStatus" AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InventoryFreshnessStatus" AS ENUM ('FRESH', 'STALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InventoryLotStatus" AS ENUM ('ACTIVE', 'QUARANTINED', 'BLOCKED', 'RECALLED', 'EXPIRED', 'DEPLETED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "InventoryReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED', 'CONSUMED');

-- CreateTable
CREATE TABLE "SupplierProfile" (
    "organizationId" UUID NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "regulatoryDetails" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProfile_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" UUID,
    "addressLine" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Almaty',
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierDataSource" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierDataSourceType" NOT NULL,
    "configuration" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierDataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" "SupplierDataSourceType" NOT NULL,
    "checksum" TEXT,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "columnMapping" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'RAW',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierExternalItem" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "importRowId" UUID,
    "externalId" TEXT NOT NULL,
    "supplierSku" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "brandText" TEXT,
    "manufacturerText" TEXT,
    "gtin" TEXT,
    "unitText" TEXT,
    "rawData" JSONB NOT NULL,
    "matchedVariantId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierExternalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierItemMatchCandidate" (
    "id" UUID NOT NULL,
    "externalItemId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "score" DECIMAL(5,4) NOT NULL,
    "reasons" JSONB NOT NULL,
    "status" "MatchCandidateStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierItemMatchCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOffer" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "saleUnitId" UUID,
    "sourceId" UUID,
    "supplierSku" TEXT,
    "baseUnitsPerSaleUnit" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "minimumOrderQuantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "orderIncrement" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "confirmationMode" "OfferConfirmationMode" NOT NULL DEFAULT 'MANUAL',
    "sourceType" "OfferSourceType" NOT NULL DEFAULT 'MANUAL',
    "externalId" TEXT,
    "status" "SupplierOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferPublication" (
    "offerId" UUID NOT NULL,
    "status" "OfferPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "marketplaceVisible" BOOLEAN NOT NULL DEFAULT false,
    "allowedBuyerIds" JSONB,
    "allowedCityIds" JSONB,
    "industryVisibility" JSONB,
    "publishedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferPublication_pkey" PRIMARY KEY ("offerId")
);

-- CreateTable
CREATE TABLE "OfferPrice" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "includesVat" BOOLEAN NOT NULL DEFAULT true,
    "vatRate" DECIMAL(5,2),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "source" "OfferSourceType" NOT NULL DEFAULT 'MANUAL',
    "status" "OfferPriceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferPriceHistory" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "includesVat" BOOLEAN NOT NULL,
    "vatRate" DECIMAL(5,2),
    "source" "OfferSourceType" NOT NULL,
    "changedById" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferPriceTier" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "minimumQuantity" DECIMAL(18,6) NOT NULL,
    "maximumQuantity" DECIMAL(18,6),
    "unitPriceMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "offerId" UUID,
    "quantityOnHand" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "safetyStock" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "quantityAvailable" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "availabilityStatus" "InventoryAvailabilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "freshnessStatus" "InventoryFreshnessStatus" NOT NULL DEFAULT 'UNKNOWN',
    "source" "OfferSourceType" NOT NULL DEFAULT 'MANUAL',
    "externalUpdatedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" UUID NOT NULL,
    "inventoryBalanceId" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "offerId" UUID,
    "lotNumber" TEXT NOT NULL,
    "series" TEXT,
    "serialNumber" TEXT,
    "manufactureDate" DATE,
    "expirationDate" DATE,
    "registrationCertificate" TEXT,
    "importerOrganizationId" UUID,
    "originSource" TEXT,
    "quantityOnHand" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "quantityReserved" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "quantityAvailable" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "status" "InventoryLotStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" UUID NOT NULL,
    "inventoryBalanceId" UUID NOT NULL,
    "inventoryLotId" UUID,
    "supplierOrganizationId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "quantity" DECIMAL(24,6) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "InventoryReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Warehouse_supplierOrganizationId_status_idx" ON "Warehouse"("supplierOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_supplierOrganizationId_code_key" ON "Warehouse"("supplierOrganizationId", "code");

-- CreateIndex
CREATE INDEX "SupplierDataSource_supplierOrganizationId_status_idx" ON "SupplierDataSource"("supplierOrganizationId", "status");

-- CreateIndex
CREATE INDEX "ImportBatch_supplierOrganizationId_createdAt_idx" ON "ImportBatch"("supplierOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_sourceId_status_idx" ON "ImportBatch"("sourceId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_batchId_status_idx" ON "ImportRow"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_batchId_rowNumber_key" ON "ImportRow"("batchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierExternalItem_importRowId_key" ON "SupplierExternalItem"("importRowId");

-- CreateIndex
CREATE INDEX "SupplierExternalItem_supplierOrganizationId_normalizedName_idx" ON "SupplierExternalItem"("supplierOrganizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "SupplierExternalItem_matchedVariantId_idx" ON "SupplierExternalItem"("matchedVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierExternalItem_sourceId_externalId_key" ON "SupplierExternalItem"("sourceId", "externalId");

-- CreateIndex
CREATE INDEX "SupplierItemMatchCandidate_status_score_idx" ON "SupplierItemMatchCandidate"("status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierItemMatchCandidate_externalItemId_productVariantId_key" ON "SupplierItemMatchCandidate"("externalItemId", "productVariantId");

-- CreateIndex
CREATE INDEX "SupplierOffer_supplierOrganizationId_status_idx" ON "SupplierOffer"("supplierOrganizationId", "status");

-- CreateIndex
CREATE INDEX "SupplierOffer_productVariantId_status_idx" ON "SupplierOffer"("productVariantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOffer_supplierOrganizationId_productVariantId_saleU_key" ON "SupplierOffer"("supplierOrganizationId", "productVariantId", "saleUnitId");

-- Enforce offer identity even when the optional sale unit is NULL.
CREATE UNIQUE INDEX "SupplierOffer_identity_with_nullable_unit_key" ON "SupplierOffer"("supplierOrganizationId", "productVariantId", COALESCE("saleUnitId", '00000000-0000-0000-0000-000000000000'::uuid));

-- CreateIndex
CREATE INDEX "OfferPrice_offerId_status_validFrom_idx" ON "OfferPrice"("offerId", "status", "validFrom");

-- A supplier offer can have only one current base price.
CREATE UNIQUE INDEX "OfferPrice_one_active_per_offer_key" ON "OfferPrice"("offerId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "OfferPriceHistory_offerId_createdAt_idx" ON "OfferPriceHistory"("offerId", "createdAt");

-- CreateIndex
CREATE INDEX "OfferPriceTier_offerId_minimumQuantity_idx" ON "OfferPriceTier"("offerId", "minimumQuantity");

-- CreateIndex
CREATE INDEX "InventoryBalance_offerId_idx" ON "InventoryBalance"("offerId");

-- CreateIndex
CREATE INDEX "InventoryBalance_availabilityStatus_freshnessStatus_idx" ON "InventoryBalance"("availabilityStatus", "freshnessStatus");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_supplierOrganizationId_warehouseId_product_key" ON "InventoryBalance"("supplierOrganizationId", "warehouseId", "productVariantId");

-- CreateIndex
CREATE INDEX "InventoryLot_status_expirationDate_idx" ON "InventoryLot"("status", "expirationDate");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_warehouseId_productVariantId_lotNumber_key" ON "InventoryLot"("warehouseId", "productVariantId", "lotNumber");

-- CreateIndex
CREATE INDEX "InventoryReservation_inventoryBalanceId_status_expiresAt_idx" ON "InventoryReservation"("inventoryBalanceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "InventoryReservation_inventoryLotId_status_idx" ON "InventoryReservation"("inventoryLotId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_supplierOrganizationId_idempotencyKey_key" ON "InventoryReservation"("supplierOrganizationId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "SupplierProfile" ADD CONSTRAINT "SupplierProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierDataSource" ADD CONSTRAINT "SupplierDataSource_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SupplierDataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierExternalItem" ADD CONSTRAINT "SupplierExternalItem_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierExternalItem" ADD CONSTRAINT "SupplierExternalItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SupplierDataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierExternalItem" ADD CONSTRAINT "SupplierExternalItem_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "ImportRow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierExternalItem" ADD CONSTRAINT "SupplierExternalItem_matchedVariantId_fkey" FOREIGN KEY ("matchedVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItemMatchCandidate" ADD CONSTRAINT "SupplierItemMatchCandidate_externalItemId_fkey" FOREIGN KEY ("externalItemId") REFERENCES "SupplierExternalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierItemMatchCandidate" ADD CONSTRAINT "SupplierItemMatchCandidate_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_saleUnitId_fkey" FOREIGN KEY ("saleUnitId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOffer" ADD CONSTRAINT "SupplierOffer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SupplierDataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPublication" ADD CONSTRAINT "OfferPublication_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPrice" ADD CONSTRAINT "OfferPrice_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPriceHistory" ADD CONSTRAINT "OfferPriceHistory_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPriceTier" ADD CONSTRAINT "OfferPriceTier_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryBalance" ADD CONSTRAINT "InventoryBalance_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_inventoryBalanceId_fkey" FOREIGN KEY ("inventoryBalanceId") REFERENCES "InventoryBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryBalanceId_fkey" FOREIGN KEY ("inventoryBalanceId") REFERENCES "InventoryBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
