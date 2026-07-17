-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('MARKETPLACE_SUPPLIER_AGREEMENT', 'MARKETPLACE_BUYER_TERMS', 'FRAMEWORK_SUPPLY_AGREEMENT', 'ORDER_SPECIFICATION', 'ORDER_CONFIRMATION', 'INVOICE', 'WAYBILL', 'ACCOMPANYING_DOCUMENT', 'TAX_CLOSING_DOCUMENT', 'INSTALLATION_ACT', 'TRAINING_ACT', 'WARRANTY', 'COMMISSIONING_ACT', 'REGISTRATION_CERTIFICATE', 'LICENSE', 'CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentFormat" AS ENUM ('PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('GENERATED', 'UPLOADED', 'INTEGRATION');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'GENERATING', 'GENERATED', 'AWAITING_SIGNATURE', 'PARTIALLY_SIGNED', 'SIGNED', 'REJECTED', 'EXPIRED', 'SUPERSEDED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentSignatureMethod" AS ENUM ('EDS', 'EGOV_QR', 'SIMPLE', 'EXTERNAL', 'MOCK');

-- CreateEnum
CREATE TYPE "DocumentSignatureStatus" AS ENUM ('PENDING', 'SESSION_CREATED', 'SIGNED', 'REJECTED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrganizationCredentialType" AS ENUM ('BUSINESS_LICENSE', 'MEDICAL_LICENSE', 'WHOLESALE_LICENSE', 'REGISTRATION_CERTIFICATE', 'DISTRIBUTOR_AUTHORIZATION', 'QUALITY_CERTIFICATE', 'OTHER');

-- CreateEnum
CREATE TYPE "OrganizationCredentialStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ComplianceRiskLevel" AS ENUM ('GREEN', 'YELLOW', 'ORANGE', 'RED');

-- CreateEnum
CREATE TYPE "ComplianceRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ComplianceDecision" AS ENUM ('ALLOWED', 'ALLOWED_WITH_DISCLOSURE', 'MANUAL_REVIEW', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ComplianceCheckStatus" AS ENUM ('PENDING', 'PASSED', 'REVIEW_REQUIRED', 'BLOCKED', 'ERROR');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD', 'CANCELLED');

-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "format" "DocumentFormat" NOT NULL DEFAULT 'PDF',
    "locale" TEXT NOT NULL DEFAULT 'ru-KZ',
    "templateBody" TEXT NOT NULL,
    "requiredSignatureCount" INTEGER NOT NULL DEFAULT 0,
    "signatureMethods" JSONB,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "ownerOrganizationId" UUID NOT NULL,
    "templateId" UUID,
    "checkoutId" UUID,
    "supplierOrderId" UUID,
    "shipmentId" UUID,
    "previousVersionId" UUID,
    "kind" "DocumentKind" NOT NULL,
    "format" "DocumentFormat" NOT NULL,
    "source" "DocumentSource" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "byteSize" INTEGER,
    "checksumSha256" TEXT,
    "templateSnapshot" JSONB,
    "dataSnapshot" JSONB,
    "requiredSignatureCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3),
    "immutableAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "externalId" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSignature" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "signerOrganizationId" UUID,
    "signerUserId" UUID,
    "signerName" TEXT,
    "method" "DocumentSignatureMethod" NOT NULL,
    "status" "DocumentSignatureStatus" NOT NULL DEFAULT 'PENDING',
    "externalSessionId" TEXT,
    "externalSignatureId" TEXT,
    "signatureHash" TEXT,
    "signedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCredential" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "OrganizationCredentialType" NOT NULL,
    "number" TEXT NOT NULL,
    "issuer" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "OrganizationCredentialStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "checksumSha256" TEXT,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRule" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "industryCode" TEXT,
    "categoryId" UUID,
    "productType" TEXT,
    "regulatoryClass" TEXT,
    "riskLevel" "ComplianceRiskLevel" NOT NULL,
    "decision" "ComplianceDecision" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditions" JSONB NOT NULL,
    "requiredCredentialTypes" JSONB,
    "disclosureText" TEXT,
    "status" "ComplianceRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "supersedesRuleId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" UUID NOT NULL,
    "sellerOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID,
    "offerId" UUID,
    "warehouseId" UUID,
    "inventoryLotId" UUID,
    "supplierOrderId" UUID,
    "matchedRuleId" UUID,
    "status" "ComplianceCheckStatus" NOT NULL DEFAULT 'PENDING',
    "decision" "ComplianceDecision" NOT NULL,
    "riskLevel" "ComplianceRiskLevel" NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "inputSnapshot" JSONB NOT NULL,
    "ruleSnapshot" JSONB,
    "reasons" JSONB NOT NULL,
    "missingCredentials" JSONB,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "eventType" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "destination" TEXT,
    "quietHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "recipientOrganizationId" UUID NOT NULL,
    "recipientUserId" UUID,
    "eventType" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "destination" TEXT,
    "aggregateType" TEXT,
    "aggregateId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDeliveryAttempt" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalMessageId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "error" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentTemplate_kind_status_effectiveFrom_idx" ON "DocumentTemplate"("kind", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_code_version_key" ON "DocumentTemplate"("code", "version");

-- CreateIndex
CREATE INDEX "Document_supplierOrderId_kind_status_idx" ON "Document"("supplierOrderId", "kind", "status");

-- CreateIndex
CREATE INDEX "Document_checkoutId_status_idx" ON "Document"("checkoutId", "status");

-- CreateIndex
CREATE INDEX "Document_shipmentId_status_idx" ON "Document"("shipmentId", "status");

-- CreateIndex
CREATE INDEX "Document_ownerOrganizationId_status_expiresAt_idx" ON "Document"("ownerOrganizationId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_ownerOrganizationId_documentNumber_version_key" ON "Document"("ownerOrganizationId", "documentNumber", "version");

-- CreateIndex
CREATE INDEX "DocumentSignature_documentId_status_idx" ON "DocumentSignature"("documentId", "status");

-- CreateIndex
CREATE INDEX "DocumentSignature_externalSessionId_idx" ON "DocumentSignature"("externalSessionId");

-- CreateIndex
CREATE INDEX "OrganizationCredential_organizationId_status_validTo_idx" ON "OrganizationCredential"("organizationId", "status", "validTo");

-- CreateIndex
CREATE INDEX "OrganizationCredential_type_status_validTo_idx" ON "OrganizationCredential"("type", "status", "validTo");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationCredential_organizationId_type_number_key" ON "OrganizationCredential"("organizationId", "type", "number");

-- CreateIndex
CREATE INDEX "ComplianceRule_status_effectiveFrom_effectiveTo_idx" ON "ComplianceRule"("status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "ComplianceRule_categoryId_status_priority_idx" ON "ComplianceRule"("categoryId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceRule_code_version_key" ON "ComplianceRule"("code", "version");

-- CreateIndex
CREATE INDEX "ComplianceCheck_sellerOrganizationId_status_evaluatedAt_idx" ON "ComplianceCheck"("sellerOrganizationId", "status", "evaluatedAt");

-- CreateIndex
CREATE INDEX "ComplianceCheck_offerId_status_evaluatedAt_idx" ON "ComplianceCheck"("offerId", "status", "evaluatedAt");

-- CreateIndex
CREATE INDEX "ComplianceCheck_supplierOrderId_status_idx" ON "ComplianceCheck"("supplierOrderId", "status");

-- CreateIndex
CREATE INDEX "ComplianceCheck_riskLevel_status_evaluatedAt_idx" ON "ComplianceCheck"("riskLevel", "status", "evaluatedAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_organizationId_eventType_enabled_idx" ON "NotificationPreference"("organizationId", "eventType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_organizationId_userId_eventType_chan_key" ON "NotificationPreference"("organizationId", "userId", "eventType", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Notification_recipientOrganizationId_status_createdAt_idx" ON "Notification"("recipientOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_status_scheduledAt_idx" ON "Notification"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Notification_aggregateType_aggregateId_idx" ON "Notification"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "NotificationDeliveryAttempt_status_processedAt_idx" ON "NotificationDeliveryAttempt"("status", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDeliveryAttempt_notificationId_attempt_key" ON "NotificationDeliveryAttempt"("notificationId", "attempt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerOrganizationId_fkey" FOREIGN KEY ("ownerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSignature" ADD CONSTRAINT "DocumentSignature_signerOrganizationId_fkey" FOREIGN KEY ("signerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationCredential" ADD CONSTRAINT "OrganizationCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_supersedesRuleId_fkey" FOREIGN KEY ("supersedesRuleId") REFERENCES "ComplianceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_sellerOrganizationId_fkey" FOREIGN KEY ("sellerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_matchedRuleId_fkey" FOREIGN KEY ("matchedRuleId") REFERENCES "ComplianceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientOrganizationId_fkey" FOREIGN KEY ("recipientOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants and immutable document history.
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_signature_count_check" CHECK ("requiredSignatureCount" >= 0);
ALTER TABLE "DocumentTemplate" ADD CONSTRAINT "DocumentTemplate_effective_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "Document" ADD CONSTRAINT "Document_signature_count_check" CHECK ("requiredSignatureCount" >= 0);
ALTER TABLE "Document" ADD CONSTRAINT "Document_file_metadata_check" CHECK (("storageKey" IS NULL AND "checksumSha256" IS NULL) OR ("storageKey" IS NOT NULL AND "checksumSha256" IS NOT NULL));
ALTER TABLE "OrganizationCredential" ADD CONSTRAINT "OrganizationCredential_validity_check" CHECK ("validTo" IS NULL OR "validFrom" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_version_check" CHECK (version > 0);
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_priority_check" CHECK (priority >= 0);
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_effective_window_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_validity_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "evaluatedAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_attempts_check" CHECK (attempts >= 0 AND "maxAttempts" > 0 AND attempts <= "maxAttempts");
ALTER TABLE "NotificationDeliveryAttempt" ADD CONSTRAINT "NotificationDeliveryAttempt_number_check" CHECK (attempt > 0);

CREATE UNIQUE INDEX "ComplianceRule_one_active_code_idx" ON "ComplianceRule" (code) WHERE status = 'ACTIVE';

CREATE OR REPLACE FUNCTION prevent_immutable_document_rewrite()
RETURNS trigger AS $$
BEGIN
  IF OLD."immutableAt" IS NOT NULL AND (
    NEW."ownerOrganizationId" IS DISTINCT FROM OLD."ownerOrganizationId" OR
    NEW."templateId" IS DISTINCT FROM OLD."templateId" OR
    NEW."checkoutId" IS DISTINCT FROM OLD."checkoutId" OR
    NEW."supplierOrderId" IS DISTINCT FROM OLD."supplierOrderId" OR
    NEW."shipmentId" IS DISTINCT FROM OLD."shipmentId" OR
    NEW.kind IS DISTINCT FROM OLD.kind OR
    NEW.format IS DISTINCT FROM OLD.format OR
    NEW.source IS DISTINCT FROM OLD.source OR
    NEW.title IS DISTINCT FROM OLD.title OR
    NEW."documentNumber" IS DISTINCT FROM OLD."documentNumber" OR
    NEW.version IS DISTINCT FROM OLD.version OR
    NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR
    NEW."checksumSha256" IS DISTINCT FROM OLD."checksumSha256" OR
    NEW."templateSnapshot" IS DISTINCT FROM OLD."templateSnapshot" OR
    NEW."dataSnapshot" IS DISTINCT FROM OLD."dataSnapshot"
  ) THEN
    RAISE EXCEPTION 'Immutable document payload cannot be rewritten; create a new version';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Document_immutable_payload_trigger"
BEFORE UPDATE ON "Document"
FOR EACH ROW EXECUTE FUNCTION prevent_immutable_document_rewrite();
