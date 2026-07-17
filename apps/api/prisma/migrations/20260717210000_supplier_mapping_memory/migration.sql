CREATE TABLE "SupplierMappingMemory" (
  "id" UUID NOT NULL,
  "supplierOrganizationId" UUID NOT NULL,
  "sourceId" UUID,
  "externalKey" TEXT NOT NULL,
  "externalId" TEXT,
  "supplierSku" TEXT,
  "productVariantId" UUID NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "confidence" DECIMAL(5,4) NOT NULL,
  "reasons" JSONB NOT NULL,
  "createdById" UUID,
  "supersedesId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierMappingMemory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupplierMappingMemory_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SupplierMappingMemory_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SupplierDataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "SupplierMappingMemory_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupplierMappingMemory_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "SupplierMappingMemory"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SupplierMappingMemory_supplier_key_version_key" ON "SupplierMappingMemory"("supplierOrganizationId", "externalKey", "version");
CREATE INDEX "SupplierMappingMemory_supplier_key_status_version_idx" ON "SupplierMappingMemory"("supplierOrganizationId", "externalKey", "status", "version");
