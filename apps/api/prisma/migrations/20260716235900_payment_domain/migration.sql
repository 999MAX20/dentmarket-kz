-- CreateEnum
CREATE TYPE "PaymentMerchantOnboardingStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'IN_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentMerchantVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentPayoutStatus" AS ENUM ('NOT_READY', 'READY', 'ON_HOLD', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentTransactionType" AS ENUM ('AUTHORIZATION', 'CAPTURE', 'VOID', 'REFUND', 'PAYOUT', 'CHARGEBACK', 'REVERSAL');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentAuthorizationStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PARTIALLY_CAPTURED', 'CAPTURED', 'VOIDED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentReconciliationStatus" AS ENUM ('MATCHED', 'MISMATCH', 'MISSING_PROVIDER', 'MISSING_INTERNAL', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PaymentWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "PaymentMerchantChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "OrderPaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentAllocationStatus" ADD VALUE 'AUTHORIZED';
ALTER TYPE "PaymentAllocationStatus" ADD VALUE 'PARTIALLY_CAPTURED';
ALTER TYPE "PaymentAllocationStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentAllocationStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentIntentStatus" ADD VALUE 'DRAFT';
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'AWAITING_CONFIRMATION';
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'AUTHORIZED';
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'PARTIALLY_CAPTURED';
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "PaymentIntentStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "PaymentAllocation" ADD COLUMN     "merchantAccountId" UUID,
ADD COLUMN     "payoutStatus" "PaymentPayoutStatus" NOT NULL DEFAULT 'NOT_READY',
ADD COLUMN     "refundedAmountMinor" DECIMAL(20,0) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentMerchantAccount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "externalMerchantId" TEXT,
    "onboardingStatus" "PaymentMerchantOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "verificationStatus" "PaymentMerchantVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "payoutStatus" "PaymentPayoutStatus" NOT NULL DEFAULT 'NOT_READY',
    "capabilities" JSONB,
    "onboardingUrl" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMerchantAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMerchantChangeRequest" (
    "id" UUID NOT NULL,
    "merchantAccountId" UUID NOT NULL,
    "requestedExternalMerchantId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PaymentMerchantChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" UUID,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMerchantChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "externalSessionId" TEXT,
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "paymentAllocationId" UUID,
    "providerId" UUID NOT NULL,
    "parentTransactionId" UUID,
    "type" "PaymentTransactionType" NOT NULL,
    "status" "PaymentTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "externalTransactionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "failureReason" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAuthorization" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "paymentTransactionId" UUID NOT NULL,
    "authorizedAmountMinor" DECIMAL(20,0) NOT NULL,
    "capturedAmountMinor" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "voidedAmountMinor" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "status" "PaymentAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCapture" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "paymentTransactionId" UUID NOT NULL,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "paymentAllocationId" UUID NOT NULL,
    "supplierOrderId" UUID NOT NULL,
    "supplierOrderItemId" UUID,
    "paymentTransactionId" UUID,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "platformFeeRefundMinor" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "netRefundMinor" DECIMAL(20,0) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(18,6),
    "reason" TEXT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "externalRefundId" TEXT,
    "failureReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentFee" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "paymentAllocationId" UUID,
    "feeType" TEXT NOT NULL,
    "payer" TEXT NOT NULL,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "ruleSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" UUID NOT NULL,
    "paymentAllocationId" UUID NOT NULL,
    "merchantAccountId" UUID NOT NULL,
    "paymentTransactionId" UUID,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentPayoutStatus" NOT NULL DEFAULT 'READY',
    "idempotencyKey" TEXT NOT NULL,
    "externalPayoutId" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentReconciliationEntry" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "paymentIntentId" UUID,
    "paymentTransactionId" UUID,
    "externalRef" TEXT,
    "status" "PaymentReconciliationStatus" NOT NULL,
    "expected" JSONB,
    "actual" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentReconciliationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureStatus" "IntegrationSignatureStatus" NOT NULL,
    "status" "PaymentWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentMerchantAccount_providerId_onboardingStatus_verifica_idx" ON "PaymentMerchantAccount"("providerId", "onboardingStatus", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMerchantAccount_organizationId_providerId_key" ON "PaymentMerchantAccount"("organizationId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMerchantAccount_providerId_externalMerchantId_key" ON "PaymentMerchantAccount"("providerId", "externalMerchantId");

-- CreateIndex
CREATE INDEX "PaymentMerchantChangeRequest_merchantAccountId_status_creat_idx" ON "PaymentMerchantChangeRequest"("merchantAccountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentSession_externalSessionId_idx" ON "PaymentSession"("externalSessionId");

-- CreateIndex
CREATE INDEX "PaymentSession_status_expiresAt_idx" ON "PaymentSession"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_paymentIntentId_idempotencyKey_key" ON "PaymentSession"("paymentIntentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentIntentId_type_status_createdAt_idx" ON "PaymentTransaction"("paymentIntentId", "type", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransaction_providerId_externalTransactionId_idx" ON "PaymentTransaction"("providerId", "externalTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_providerId_idempotencyKey_key" ON "PaymentTransaction"("providerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAuthorization_paymentIntentId_key" ON "PaymentAuthorization"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAuthorization_paymentTransactionId_key" ON "PaymentAuthorization"("paymentTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCapture_paymentTransactionId_key" ON "PaymentCapture"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "PaymentCapture_paymentIntentId_createdAt_idx" ON "PaymentCapture"("paymentIntentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentTransactionId_key" ON "Refund"("paymentTransactionId");

-- CreateIndex
CREATE INDEX "Refund_paymentAllocationId_status_createdAt_idx" ON "Refund"("paymentAllocationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_supplierOrderId_createdAt_idx" ON "Refund"("supplierOrderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_paymentIntentId_idempotencyKey_key" ON "Refund"("paymentIntentId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentFee_paymentIntentId_feeType_idx" ON "PaymentFee"("paymentIntentId", "feeType");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_paymentTransactionId_key" ON "Payout"("paymentTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_idempotencyKey_key" ON "Payout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payout_status_availableAt_idx" ON "Payout"("status", "availableAt");

-- CreateIndex
CREATE INDEX "Payout_merchantAccountId_status_idx" ON "Payout"("merchantAccountId", "status");

-- CreateIndex
CREATE INDEX "PaymentReconciliationEntry_providerId_status_detectedAt_idx" ON "PaymentReconciliationEntry"("providerId", "status", "detectedAt");

-- CreateIndex
CREATE INDEX "PaymentReconciliationEntry_paymentIntentId_status_idx" ON "PaymentReconciliationEntry"("paymentIntentId", "status");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_createdAt_idx" ON "PaymentWebhookEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_providerId_externalEventId_key" ON "PaymentWebhookEvent"("providerId", "externalEventId");

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "PaymentMerchantAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMerchantAccount" ADD CONSTRAINT "PaymentMerchantAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMerchantAccount" ADD CONSTRAINT "PaymentMerchantAccount_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMerchantChangeRequest" ADD CONSTRAINT "PaymentMerchantChangeRequest_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "PaymentMerchantAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentAllocationId_fkey" FOREIGN KEY ("paymentAllocationId") REFERENCES "PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_parentTransactionId_fkey" FOREIGN KEY ("parentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAuthorization" ADD CONSTRAINT "PaymentAuthorization_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAuthorization" ADD CONSTRAINT "PaymentAuthorization_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCapture" ADD CONSTRAINT "PaymentCapture_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCapture" ADD CONSTRAINT "PaymentCapture_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentAllocationId_fkey" FOREIGN KEY ("paymentAllocationId") REFERENCES "PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_supplierOrderItemId_fkey" FOREIGN KEY ("supplierOrderItemId") REFERENCES "SupplierOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentFee" ADD CONSTRAINT "PaymentFee_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentFee" ADD CONSTRAINT "PaymentFee_paymentAllocationId_fkey" FOREIGN KEY ("paymentAllocationId") REFERENCES "PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paymentAllocationId_fkey" FOREIGN KEY ("paymentAllocationId") REFERENCES "PaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "PaymentMerchantAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliationEntry" ADD CONSTRAINT "PaymentReconciliationEntry_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliationEntry" ADD CONSTRAINT "PaymentReconciliationEntry_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReconciliationEntry" ADD CONSTRAINT "PaymentReconciliationEntry_paymentTransactionId_fkey" FOREIGN KEY ("paymentTransactionId") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants
ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_refunded_amount_check"
  CHECK ("refundedAmountMinor" >= 0 AND "refundedAmountMinor" <= "grossAmountMinor");

ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_positive_amount_check"
  CHECK ("amountMinor" > 0);

ALTER TABLE "PaymentAuthorization"
  ADD CONSTRAINT "PaymentAuthorization_amounts_check"
  CHECK (
    "authorizedAmountMinor" > 0
    AND "capturedAmountMinor" >= 0
    AND "voidedAmountMinor" >= 0
    AND "capturedAmountMinor" + "voidedAmountMinor" <= "authorizedAmountMinor"
  );

ALTER TABLE "PaymentCapture"
  ADD CONSTRAINT "PaymentCapture_positive_amount_check"
  CHECK ("amountMinor" > 0);

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_amounts_check"
  CHECK (
    "amountMinor" > 0
    AND "platformFeeRefundMinor" >= 0
    AND "netRefundMinor" >= 0
    AND "platformFeeRefundMinor" + "netRefundMinor" = "amountMinor"
  );

ALTER TABLE "PaymentFee"
  ADD CONSTRAINT "PaymentFee_nonnegative_amount_check"
  CHECK ("amountMinor" >= 0);

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_nonnegative_amount_check"
  CHECK ("amountMinor" >= 0);
