CREATE TYPE "BuyerSupplierAgreementStatus" AS ENUM ('DRAFT', 'AWAITING_SIGNATURE', 'ACTIVE', 'NON_RENEWING', 'EXPIRED', 'TERMINATED');

CREATE TABLE "BuyerSupplierAgreement" (
  "id" UUID NOT NULL,
  "agreementNumber" TEXT NOT NULL,
  "supplierOrganizationId" UUID NOT NULL,
  "buyerOrganizationId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "status" "BuyerSupplierAgreementStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURE',
  "renewalMode" "AgreementRenewalMode" NOT NULL DEFAULT 'AUTO_ANNUAL',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "autoRenew" BOOLEAN NOT NULL DEFAULT true,
  "renewalCount" INTEGER NOT NULL DEFAULT 0,
  "lastRenewedAt" TIMESTAMP(3),
  "terminatedAt" TIMESTAMP(3),
  "terminationReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BuyerSupplierAgreement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BuyerSupplierAgreement_agreementNumber_key" UNIQUE ("agreementNumber"),
  CONSTRAINT "BuyerSupplierAgreement_documentId_key" UNIQUE ("documentId"),
  CONSTRAINT "BuyerSupplierAgreement_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BuyerSupplierAgreement_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BuyerSupplierAgreement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BuyerSupplierAgreement_parties_status_key" ON "BuyerSupplierAgreement"("supplierOrganizationId", "buyerOrganizationId", "status");
CREATE INDEX "BuyerSupplierAgreement_parties_status_ends_idx" ON "BuyerSupplierAgreement"("supplierOrganizationId", "buyerOrganizationId", "status", "endsAt");
CREATE INDEX "BuyerSupplierAgreement_buyer_status_ends_idx" ON "BuyerSupplierAgreement"("buyerOrganizationId", "status", "endsAt");

ALTER TABLE "SupplierOrder" ADD COLUMN "buyerSupplierAgreementId" UUID;
ALTER TABLE "SupplierOrder" ADD COLUMN "transactionMode" TEXT NOT NULL DEFAULT 'ONE_TIME';
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_buyerSupplierAgreementId_fkey" FOREIGN KEY ("buyerSupplierAgreementId") REFERENCES "BuyerSupplierAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SupplierOrder_buyerSupplierAgreementId_transactionMode_idx" ON "SupplierOrder"("buyerSupplierAgreementId", "transactionMode");

INSERT INTO "DocumentTemplate" ("id", "code", "version", "kind", "name", "format", "locale", "templateBody", "requiredSignatureCount", "signatureMethods", "status", "effectiveFrom", "metadata", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'FRAMEWORK_SUPPLY_AGREEMENT_RU', 1, 'FRAMEWORK_SUPPLY_AGREEMENT', 'Рамочный договор поставки', 'PDF', 'ru-KZ',
'РАМОЧНЫЙ ДОГОВОР ПОСТАВКИ № {{agreement.number}}\n\nПоставщик: {{supplier.legalName}}, БИН {{supplier.bin}}\nПокупатель: {{buyer.legalName}}, БИН {{buyer.bin}}\n\nСрок: {{agreement.term}}. Договор вступает в силу после подписания ЭЦП обеими сторонами. {{agreement.renewal}}. Заказы могут оформляться как по рамочному договору, так и разовой сделкой без обязательного рамочного договора.',
2, '["MOCK", "EDS", "EGOV_QR"]'::jsonb, 'ACTIVE', CURRENT_TIMESTAMP, '{"agreementType":"buyer_supplier_framework"}'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "DocumentTemplate" WHERE "code" = 'FRAMEWORK_SUPPLY_AGREEMENT_RU' AND "version" = 1);
