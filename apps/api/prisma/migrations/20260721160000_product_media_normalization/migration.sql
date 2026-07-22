CREATE TABLE "ProductMedia" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sourceUrl" TEXT,
    "originalStorageKey" TEXT,
    "normalizedStorageKey" TEXT,
    "originalName" TEXT,
    "mimeType" TEXT,
    "checksumSha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "background" TEXT NOT NULL DEFAULT '#F7F8FA',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductMedia_productId_status_sortOrder_idx" ON "ProductMedia"("productId", "status", "sortOrder");
CREATE INDEX "ProductMedia_checksumSha256_idx" ON "ProductMedia"("checksumSha256");

ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
