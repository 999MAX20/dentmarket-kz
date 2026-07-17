ALTER TABLE "SupplierDataSource" ADD COLUMN IF NOT EXISTS "encryptedConfiguration" TEXT;
ALTER TABLE "IntegrationConnection" ADD COLUMN IF NOT EXISTS "encryptedConfiguration" TEXT;
