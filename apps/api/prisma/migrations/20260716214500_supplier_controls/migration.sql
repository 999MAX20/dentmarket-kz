-- CreateEnum
CREATE TYPE "ProductCandidateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContractPriceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LotRecallSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "LotRecallStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateTable
CREATE TABLE "ContractPrice" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "contractReference" TEXT,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "minimumQuantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "status" "ContractPriceStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCandidate" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "externalItemId" UUID NOT NULL,
    "proposedName" TEXT NOT NULL,
    "proposedSku" TEXT,
    "proposedGtin" TEXT,
    "proposedBrand" TEXT,
    "suggestedCategoryId" UUID,
    "status" "ProductCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "approvedProductId" UUID,
    "approvedVariantId" UUID,
    "rejectionReason" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotRecall" (
    "id" UUID NOT NULL,
    "inventoryLotId" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "severity" "LotRecallSeverity" NOT NULL,
    "status" "LotRecallStatus" NOT NULL DEFAULT 'ACTIVE',
    "comment" TEXT,
    "affectedReservations" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotRecall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractPrice_offerId_buyerOrganizationId_status_priority_idx" ON "ContractPrice"("offerId", "buyerOrganizationId", "status", "priority");

-- CreateIndex
CREATE INDEX "ContractPrice_productVariantId_buyerOrganizationId_idx" ON "ContractPrice"("productVariantId", "buyerOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractPrice_supplierOrganizationId_buyerOrganizationId_of_key" ON "ContractPrice"("supplierOrganizationId", "buyerOrganizationId", "offerId", "validFrom");

-- Only one current contract rule can win for a buyer and offer.
CREATE UNIQUE INDEX "ContractPrice_one_active_rule_key" ON "ContractPrice"("supplierOrganizationId", "buyerOrganizationId", "offerId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "ProductCandidate_externalItemId_key" ON "ProductCandidate"("externalItemId");

-- CreateIndex
CREATE INDEX "ProductCandidate_status_createdAt_idx" ON "ProductCandidate"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductCandidate_supplierOrganizationId_status_idx" ON "ProductCandidate"("supplierOrganizationId", "status");

-- CreateIndex
CREATE INDEX "LotRecall_supplierOrganizationId_status_severity_idx" ON "LotRecall"("supplierOrganizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "LotRecall_inventoryLotId_status_idx" ON "LotRecall"("inventoryLotId", "status");

-- A lot can have only one unresolved recall incident.
CREATE UNIQUE INDEX "LotRecall_one_active_per_lot_key" ON "LotRecall"("inventoryLotId") WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "ContractPrice" ADD CONSTRAINT "ContractPrice_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPrice" ADD CONSTRAINT "ContractPrice_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPrice" ADD CONSTRAINT "ContractPrice_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractPrice" ADD CONSTRAINT "ContractPrice_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_externalItemId_fkey" FOREIGN KEY ("externalItemId") REFERENCES "SupplierExternalItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_suggestedCategoryId_fkey" FOREIGN KEY ("suggestedCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_approvedProductId_fkey" FOREIGN KEY ("approvedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCandidate" ADD CONSTRAINT "ProductCandidate_approvedVariantId_fkey" FOREIGN KEY ("approvedVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotRecall" ADD CONSTRAINT "LotRecall_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotRecall" ADD CONSTRAINT "LotRecall_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
