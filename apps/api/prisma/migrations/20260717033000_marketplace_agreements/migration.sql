-- CreateEnum
CREATE TYPE "MarketplaceAgreementStatus" AS ENUM ('DRAFT', 'AWAITING_SIGNATURE', 'ACTIVE', 'NON_RENEWING', 'EXPIRED', 'TERMINATED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AgreementRenewalMode" AS ENUM ('AUTO_ANNUAL', 'MANUAL_ANNUAL');

-- CreateTable
CREATE TABLE "MarketplaceAgreement" (
    "id" UUID NOT NULL,
    "agreementNumber" TEXT NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "operatorOrganizationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" "MarketplaceAgreementStatus" NOT NULL DEFAULT 'AWAITING_SIGNATURE',
    "renewalMode" "AgreementRenewalMode" NOT NULL DEFAULT 'AUTO_ANNUAL',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "renewalCount" INTEGER NOT NULL DEFAULT 0,
    "lastRenewedAt" TIMESTAMP(3),
    "nonRenewalRequestedAt" TIMESTAMP(3),
    "nonRenewalRequestedById" UUID,
    "terminatedAt" TIMESTAMP(3),
    "terminatedById" UUID,
    "terminationReason" TEXT,
    "activatedAt" TIMESTAMP(3),
    "activatedBySystem" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAgreement_agreementNumber_key" ON "MarketplaceAgreement"("agreementNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceAgreement_documentId_key" ON "MarketplaceAgreement"("documentId");

-- CreateIndex
CREATE INDEX "MarketplaceAgreement_supplierOrganizationId_status_endsAt_idx" ON "MarketplaceAgreement"("supplierOrganizationId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "MarketplaceAgreement_operatorOrganizationId_status_endsAt_idx" ON "MarketplaceAgreement"("operatorOrganizationId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "MarketplaceAgreement_status_endsAt_autoRenew_idx" ON "MarketplaceAgreement"("status", "endsAt", "autoRenew");

-- AddForeignKey
ALTER TABLE "MarketplaceAgreement" ADD CONSTRAINT "MarketplaceAgreement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- One live agreement per supplier/operator pair; historical agreements remain immutable.
CREATE UNIQUE INDEX "MarketplaceAgreement_one_live_pair_key"
ON "MarketplaceAgreement" ("supplierOrganizationId", "operatorOrganizationId")
WHERE "status" IN ('DRAFT', 'AWAITING_SIGNATURE', 'ACTIVE', 'NON_RENEWING');

