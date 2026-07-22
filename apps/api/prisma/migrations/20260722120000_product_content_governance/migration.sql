CREATE TYPE "ProductContentSourceType" AS ENUM (
  'MANUFACTURER',
  'REGULATORY_DOCUMENT',
  'OFFICIAL_DISTRIBUTOR',
  'SUPPLIER_FEED',
  'OPEN_CATALOG',
  'DENTMARKET_EDITOR'
);

CREATE TYPE "ProductCorrectionStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'PARTIALLY_APPROVED',
  'REJECTED'
);

CREATE TABLE "ProductContentSource" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "supplierOrganizationId" UUID,
  "field" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "sourceType" "ProductContentSourceType" NOT NULL,
  "sourceName" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0.5,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductContentSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductCorrectionRequest" (
  "id" UUID NOT NULL,
  "productId" UUID NOT NULL,
  "supplierOrganizationId" UUID NOT NULL,
  "field" TEXT NOT NULL,
  "currentValue" TEXT,
  "proposedValue" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "evidenceUrl" TEXT,
  "evidence" JSONB,
  "status" "ProductCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "moderatorComment" TEXT,
  "appliedValue" TEXT,
  "appliedProductVersion" INTEGER,
  "decidedById" UUID,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductContentSource_productId_field_verified_idx" ON "ProductContentSource"("productId", "field", "verified");
CREATE INDEX "ProductContentSource_supplierOrganizationId_createdAt_idx" ON "ProductContentSource"("supplierOrganizationId", "createdAt");
CREATE INDEX "ProductCorrectionRequest_status_createdAt_idx" ON "ProductCorrectionRequest"("status", "createdAt");
CREATE INDEX "ProductCorrectionRequest_supplierOrganizationId_status_idx" ON "ProductCorrectionRequest"("supplierOrganizationId", "status");
CREATE INDEX "ProductCorrectionRequest_productId_field_status_idx" ON "ProductCorrectionRequest"("productId", "field", "status");

ALTER TABLE "ProductContentSource" ADD CONSTRAINT "ProductContentSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductContentSource" ADD CONSTRAINT "ProductContentSource_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductCorrectionRequest" ADD CONSTRAINT "ProductCorrectionRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCorrectionRequest" ADD CONSTRAINT "ProductCorrectionRequest_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
