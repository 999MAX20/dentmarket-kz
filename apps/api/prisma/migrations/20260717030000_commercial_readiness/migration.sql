-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'APPLE');

-- CreateEnum
CREATE TYPE "AuthSessionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SecurityEventSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "UploadAssetStatus" AS ENUM ('QUARANTINED', 'CLEAN', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AiConversationStatus" AS ENUM ('ACTIVE', 'CLOSED', 'BLOCKED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'ru-KZ';

-- CreateTable
CREATE TABLE "ExternalIdentity" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "profile" JSONB,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "previousTokenHash" TEXT,
    "status" "AuthSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "organizationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "activeOrganizationId" UUID,
    "authMethods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" UUID NOT NULL,
    "severity" "SecurityEventSeverity" NOT NULL DEFAULT 'INFO',
    "type" TEXT NOT NULL,
    "actorId" UUID,
    "organizationId" UUID,
    "sessionId" UUID,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,
    "fingerprint" TEXT,
    "metadata" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadAsset" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "uploadedById" UUID,
    "purpose" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "safeName" TEXT NOT NULL,
    "declaredMime" TEXT NOT NULL,
    "detectedMime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "status" "UploadAssetStatus" NOT NULL DEFAULT 'QUARANTINED',
    "scanProvider" TEXT,
    "scanResult" TEXT,
    "rejectionReason" TEXT,
    "availableAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "PromotionKind" NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "percentageBasisPoints" INTEGER,
    "fixedAmountMinor" DECIMAL(20,0),
    "currency" CHAR(3),
    "minimumOrderMinor" DECIMAL(20,0),
    "minimumQuantity" DECIMAL(18,6),
    "scope" JSONB NOT NULL,
    "couponCodeHash" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "usageLimit" INTEGER,
    "perBuyerLimit" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "oldPriceEvidence" JSONB,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" UUID NOT NULL,
    "promotionId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "checkoutId" UUID,
    "supplierOrderId" UUID,
    "discountAmountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionPriceSnapshot" (
    "id" UUID NOT NULL,
    "promotionId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedList" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedListItem" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedListItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCenter" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" UUID,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseBudget" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "costCenterId" UUID,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "limitMinor" DECIMAL(20,0) NOT NULL,
    "committedMinor" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "spentMinor" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "assigneeId" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportPriority" NOT NULL DEFAULT 'NORMAL',
    "category" TEXT NOT NULL,
    "slaDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportLink" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportImpersonationSession" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "targetOrganizationId" UUID NOT NULL,
    "ticketId" UUID,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "audience" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "authorId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationFeature" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "limits" JSONB,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "graceDays" INTEGER NOT NULL DEFAULT 7,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanEntitlement" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "limits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSubscription" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "graceEndsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "externalReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "documentId" UUID,
    "lineItems" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "status" "AiConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT,
    "featureVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "safety" JSONB,
    "model" TEXT,
    "tokenUsage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiToolExecution" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "outputSummary" JSONB,
    "status" TEXT NOT NULL,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalIdentity_email_provider_idx" ON "ExternalIdentity"("email", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_provider_subject_key" ON "ExternalIdentity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalIdentity_userId_provider_key" ON "ExternalIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_status_expiresAt_idx" ON "AuthSession"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_familyId_status_idx" ON "AuthSession"("familyId", "status");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_createdAt_idx" ON "SecurityEvent"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_organizationId_createdAt_idx" ON "SecurityEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_fingerprint_createdAt_idx" ON "SecurityEvent"("fingerprint", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UploadAsset_storageKey_key" ON "UploadAsset"("storageKey");

-- CreateIndex
CREATE INDEX "UploadAsset_organizationId_purpose_status_idx" ON "UploadAsset"("organizationId", "purpose", "status");

-- CreateIndex
CREATE INDEX "UploadAsset_status_createdAt_idx" ON "UploadAsset"("status", "createdAt");

-- CreateIndex
CREATE INDEX "UploadAsset_checksumSha256_idx" ON "UploadAsset"("checksumSha256");

-- CreateIndex
CREATE INDEX "Promotion_supplierOrganizationId_status_startsAt_endsAt_idx" ON "Promotion"("supplierOrganizationId", "status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Promotion_couponCodeHash_status_idx" ON "Promotion"("couponCodeHash", "status");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promotionId_buyerOrganizationId_created_idx" ON "PromotionRedemption"("promotionId", "buyerOrganizationId", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionRedemption_checkoutId_idx" ON "PromotionRedemption"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_promotionId_idempotencyKey_key" ON "PromotionRedemption"("promotionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PromotionPriceSnapshot_promotionId_offerId_observedAt_idx" ON "PromotionPriceSnapshot"("promotionId", "offerId", "observedAt");

-- CreateIndex
CREATE INDEX "PromotionPriceSnapshot_offerId_observedAt_idx" ON "PromotionPriceSnapshot"("offerId", "observedAt");

-- CreateIndex
CREATE INDEX "SavedList_organizationId_updatedAt_idx" ON "SavedList"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "SavedListItem_listId_createdAt_idx" ON "SavedListItem"("listId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedListItem_listId_offerId_key" ON "SavedListItem"("listId", "offerId");

-- CreateIndex
CREATE INDEX "CostCenter_organizationId_status_idx" ON "CostCenter"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_organizationId_code_key" ON "CostCenter"("organizationId", "code");

-- CreateIndex
CREATE INDEX "PurchaseBudget_organizationId_periodStart_periodEnd_idx" ON "PurchaseBudget"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PurchaseBudget_costCenterId_periodStart_periodEnd_idx" ON "PurchaseBudget"("costCenterId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_number_key" ON "SupportTicket"("number");

-- CreateIndex
CREATE INDEX "SupportTicket_organizationId_status_updatedAt_idx" ON "SupportTicket"("organizationId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assigneeId_status_priority_slaDueAt_idx" ON "SupportTicket"("assigneeId", "status", "priority", "slaDueAt");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportLink_entityType_entityId_idx" ON "SupportLink"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportLink_ticketId_entityType_entityId_key" ON "SupportLink"("ticketId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "SupportImpersonationSession_operatorId_createdAt_idx" ON "SupportImpersonationSession"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportImpersonationSession_targetOrganizationId_expiresAt_idx" ON "SupportImpersonationSession"("targetOrganizationId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeArticle_status_publishedAt_idx" ON "KnowledgeArticle"("status", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_key_key" ON "FeatureFlag"("key");

-- CreateIndex
CREATE INDEX "OrganizationFeature_featureKey_enabled_idx" ON "OrganizationFeature"("featureKey", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationFeature_organizationId_featureKey_key" ON "OrganizationFeature"("organizationId", "featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_code_key" ON "BillingPlan"("code");

-- CreateIndex
CREATE INDEX "PlanEntitlement_featureKey_idx" ON "PlanEntitlement"("featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntitlement_planId_featureKey_key" ON "PlanEntitlement"("planId", "featureKey");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_organizationId_status_currentPerio_idx" ON "OrganizationSubscription"("organizationId", "status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "OrganizationSubscription_planId_status_idx" ON "OrganizationSubscription"("planId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_number_key" ON "BillingInvoice"("number");

-- CreateIndex
CREATE INDEX "BillingInvoice_subscriptionId_createdAt_idx" ON "BillingInvoice"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingInvoice_status_dueAt_idx" ON "BillingInvoice"("status", "dueAt");

-- CreateIndex
CREATE INDEX "AiConversation_organizationId_userId_updatedAt_idx" ON "AiConversation"("organizationId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiToolExecution_conversationId_createdAt_idx" ON "AiToolExecution"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiToolExecution_organizationId_toolName_createdAt_idx" ON "AiToolExecution"("organizationId", "toolName", "createdAt");

-- CreateIndex
CREATE INDEX "AiFeedback_conversationId_createdAt_idx" ON "AiFeedback"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ExternalIdentity" ADD CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
