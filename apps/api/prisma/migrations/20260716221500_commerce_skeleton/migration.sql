-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ABANDONED');

-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('AWAITING_CONFIRMATION', 'CONFIRMED', 'PARTIALLY_CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierOrderItemStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderPaymentStatus" AS ENUM ('UNPAID', 'PROCESSING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PROCESSING', 'CAPTURED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentAllocationStatus" AS ENUM ('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN     "supplierOrderItemId" UUID;

-- CreateTable
CREATE TABLE "Cart" (
    "id" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'KZT',
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPriceMinor" DECIMAL(20,0) NOT NULL,
    "totalPriceMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "priceSource" TEXT NOT NULL,
    "priceRuleId" TEXT,
    "pricingSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkout" (
    "id" UUID NOT NULL,
    "cartId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "totalAmountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PROCESSING',
    "idempotencyKey" TEXT NOT NULL,
    "pricingSnapshot" JSONB NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrder" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'AWAITING_CONFIRMATION',
    "paymentStatus" "OrderPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "subtotalAmountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierOrderItem" (
    "id" UUID NOT NULL,
    "supplierOrderId" UUID NOT NULL,
    "cartItemId" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "productVariantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "inventoryLotId" UUID,
    "quantity" DECIMAL(18,6) NOT NULL,
    "acceptedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unitPriceMinor" DECIMAL(20,0) NOT NULL,
    "totalPriceMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "offerSnapshot" JSONB NOT NULL,
    "inventorySnapshot" JSONB NOT NULL,
    "status" "SupplierOrderItemStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" UUID NOT NULL,
    "checkoutId" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "totalAmountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "supplierOrderId" UUID NOT NULL,
    "recipientOrganizationId" UUID NOT NULL,
    "grossAmountMinor" DECIMAL(20,0) NOT NULL,
    "platformFeeMinor" DECIMAL(20,0) NOT NULL,
    "netAmountMinor" DECIMAL(20,0) NOT NULL,
    "status" "PaymentAllocationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "paymentIntentId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "externalAttemptId" TEXT,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'PROCESSING',
    "idempotencyKey" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialLedgerEntry" (
    "id" UUID NOT NULL,
    "debitAccount" TEXT NOT NULL,
    "creditAccount" TEXT NOT NULL,
    "amountMinor" DECIMAL(20,0) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cart_buyerOrganizationId_status_idx" ON "Cart"("buyerOrganizationId", "status");

-- Enforce a single mutable cart per buyer while preserving checkout history.
CREATE UNIQUE INDEX "Cart_one_active_per_buyer_key" ON "Cart"("buyerOrganizationId") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "CartItem_offerId_idx" ON "CartItem"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_offerId_key" ON "CartItem"("cartId", "offerId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_cartId_key" ON "Checkout"("cartId");

-- CreateIndex
CREATE INDEX "Checkout_buyerOrganizationId_status_createdAt_idx" ON "Checkout"("buyerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_buyerOrganizationId_idempotencyKey_key" ON "Checkout"("buyerOrganizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrder_orderNumber_key" ON "SupplierOrder"("orderNumber");

-- CreateIndex
CREATE INDEX "SupplierOrder_supplierOrganizationId_status_createdAt_idx" ON "SupplierOrder"("supplierOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SupplierOrder_buyerOrganizationId_createdAt_idx" ON "SupplierOrder"("buyerOrganizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrder_checkoutId_supplierOrganizationId_key" ON "SupplierOrder"("checkoutId", "supplierOrganizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierOrderItem_cartItemId_key" ON "SupplierOrderItem"("cartItemId");

-- CreateIndex
CREATE INDEX "SupplierOrderItem_supplierOrderId_status_idx" ON "SupplierOrderItem"("supplierOrderId", "status");

-- CreateIndex
CREATE INDEX "SupplierOrderItem_offerId_idx" ON "SupplierOrderItem"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_checkoutId_key" ON "PaymentIntent"("checkoutId");

-- CreateIndex
CREATE INDEX "PaymentIntent_buyerOrganizationId_status_createdAt_idx" ON "PaymentIntent"("buyerOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_providerId_idempotencyKey_key" ON "PaymentIntent"("providerId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_supplierOrderId_key" ON "PaymentAllocation"("supplierOrderId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_recipientOrganizationId_status_idx" ON "PaymentAllocation"("recipientOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAllocation_paymentIntentId_recipientOrganizationId_key" ON "PaymentAllocation"("paymentIntentId", "recipientOrganizationId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_providerId_externalAttemptId_idx" ON "PaymentAttempt"("providerId", "externalAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_paymentIntentId_idempotencyKey_key" ON "PaymentAttempt"("paymentIntentId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialLedgerEntry_idempotencyKey_key" ON "FinancialLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_referenceType_referenceId_createdAt_idx" ON "FinancialLedgerEntry"("referenceType", "referenceId", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_debitAccount_createdAt_idx" ON "FinancialLedgerEntry"("debitAccount", "createdAt");

-- CreateIndex
CREATE INDEX "FinancialLedgerEntry_creditAccount_createdAt_idx" ON "FinancialLedgerEntry"("creditAccount", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_supplierOrderItemId_key" ON "InventoryReservation"("supplierOrderItemId");

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_supplierOrderItemId_fkey" FOREIGN KEY ("supplierOrderItemId") REFERENCES "SupplierOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrder" ADD CONSTRAINT "SupplierOrder_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_cartItemId_fkey" FOREIGN KEY ("cartItemId") REFERENCES "CartItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierOrderItem" ADD CONSTRAINT "SupplierOrderItem_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_buyerOrganizationId_fkey" FOREIGN KEY ("buyerOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_recipientOrganizationId_fkey" FOREIGN KEY ("recipientOrganizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "PaymentProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
