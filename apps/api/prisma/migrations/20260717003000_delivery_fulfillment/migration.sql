-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('PICKUP', 'SUPPLIER_CITY', 'SELECTED_CITIES', 'NATIONWIDE', 'CARRIER', 'MARKETPLACE_LOGISTICS', 'PRICE_ON_REQUEST', 'SPECIAL');

-- CreateEnum
CREATE TYPE "DeliveryPriceType" AS ENUM ('FREE', 'FIXED', 'FREE_FROM_AMOUNT', 'PRICE_ON_REQUEST');

-- CreateEnum
CREATE TYPE "DeliveryRuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'PLANNED', 'PACKING', 'READY', 'DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_DELIVERED', 'DELIVERED', 'FAILED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "FulfillmentStepType" AS ENUM ('PICKUP', 'DELIVERY', 'INSTALLATION', 'TRAINING', 'SERVICE');

-- CreateEnum
CREATE TYPE "FulfillmentStepStatus" AS ENUM ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SupplierOrderStatus" ADD VALUE 'DRAFT';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'RESERVED';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'AWAITING_PAYMENT';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'PAID';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'ASSEMBLING';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'READY_TO_SHIP';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'SHIPPED';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'PARTIALLY_FULFILLED';
ALTER TYPE "SupplierOrderStatus" ADD VALUE 'RETURN_DISPUTE';

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZoneCity" (
    "deliveryZoneId" UUID NOT NULL,
    "cityId" UUID NOT NULL,

    CONSTRAINT "DeliveryZoneCity_pkey" PRIMARY KEY ("deliveryZoneId","cityId")
);

-- CreateTable
CREATE TABLE "OfferDeliveryOption" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "priceType" "DeliveryPriceType" NOT NULL,
    "fixedAmountMinor" DECIMAL(20,0),
    "freeFromAmountMinor" DECIMAL(20,0),
    "currency" CHAR(3) NOT NULL DEFAULT 'KZT',
    "minLeadTimeHours" INTEGER NOT NULL DEFAULT 0,
    "maxLeadTimeHours" INTEGER,
    "pickupInstructions" TEXT,
    "temperatureControlled" BOOLEAN NOT NULL DEFAULT false,
    "installationRequired" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferDeliveryOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryRule" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "warehouseId" UUID,
    "deliveryZoneId" UUID,
    "categoryId" UUID,
    "name" TEXT NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "priceType" "DeliveryPriceType" NOT NULL,
    "fixedAmountMinor" DECIMAL(20,0),
    "freeFromAmountMinor" DECIMAL(20,0),
    "currency" CHAR(3) NOT NULL DEFAULT 'KZT',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "minLeadTimeHours" INTEGER NOT NULL DEFAULT 0,
    "maxLeadTimeHours" INTEGER,
    "conditions" JSONB,
    "status" "DeliveryRuleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL,
    "supplierOrderId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "shipmentNumber" TEXT NOT NULL,
    "method" "DeliveryMethod" NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "trackingNumber" TEXT,
    "carrierName" TEXT,
    "pickup" BOOLEAN NOT NULL DEFAULT false,
    "deliveryWindowStart" TIMESTAMP(3),
    "deliveryWindowEnd" TIMESTAMP(3),
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT,
    "destinationAddress" JSONB,
    "proofOfDelivery" JSONB,
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentItem" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "supplierOrderItemId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "deliveredQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentStep" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "type" "FulfillmentStepType" NOT NULL,
    "status" "FulfillmentStepStatus" NOT NULL DEFAULT 'PENDING',
    "sequence" INTEGER NOT NULL,
    "providerOrganizationId" UUID,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryZone_supplierOrganizationId_status_idx" ON "DeliveryZone"("supplierOrganizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryZone_supplierOrganizationId_name_key" ON "DeliveryZone"("supplierOrganizationId", "name");

-- CreateIndex
CREATE INDEX "DeliveryZoneCity_cityId_idx" ON "DeliveryZoneCity"("cityId");

-- CreateIndex
CREATE INDEX "OfferDeliveryOption_warehouseId_status_method_idx" ON "OfferDeliveryOption"("warehouseId", "status", "method");

-- CreateIndex
CREATE UNIQUE INDEX "OfferDeliveryOption_offerId_warehouseId_method_key" ON "OfferDeliveryOption"("offerId", "warehouseId", "method");

-- CreateIndex
CREATE INDEX "DeliveryRule_supplierOrganizationId_status_priority_idx" ON "DeliveryRule"("supplierOrganizationId", "status", "priority");

-- CreateIndex
CREATE INDEX "DeliveryRule_deliveryZoneId_status_idx" ON "DeliveryRule"("deliveryZoneId", "status");

-- CreateIndex
CREATE INDEX "DeliveryRule_warehouseId_status_idx" ON "DeliveryRule"("warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentNumber_key" ON "Shipment"("shipmentNumber");

-- CreateIndex
CREATE INDEX "Shipment_supplierOrderId_status_createdAt_idx" ON "Shipment"("supplierOrderId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_trackingNumber_idx" ON "Shipment"("trackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_status_deliveryWindowStart_idx" ON "Shipment"("status", "deliveryWindowStart");

-- CreateIndex
CREATE INDEX "ShipmentItem_supplierOrderItemId_idx" ON "ShipmentItem"("supplierOrderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentItem_shipmentId_supplierOrderItemId_key" ON "ShipmentItem"("shipmentId", "supplierOrderItemId");

-- CreateIndex
CREATE INDEX "FulfillmentStep_status_scheduledAt_idx" ON "FulfillmentStep"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentStep_shipmentId_sequence_key" ON "FulfillmentStep"("shipmentId", "sequence");

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZoneCity" ADD CONSTRAINT "DeliveryZoneCity_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZoneCity" ADD CONSTRAINT "DeliveryZoneCity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferDeliveryOption" ADD CONSTRAINT "OfferDeliveryOption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferDeliveryOption" ADD CONSTRAINT "OfferDeliveryOption_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRule" ADD CONSTRAINT "DeliveryRule_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRule" ADD CONSTRAINT "DeliveryRule_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRule" ADD CONSTRAINT "DeliveryRule_deliveryZoneId_fkey" FOREIGN KEY ("deliveryZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryRule" ADD CONSTRAINT "DeliveryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_supplierOrderId_fkey" FOREIGN KEY ("supplierOrderId") REFERENCES "SupplierOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentItem" ADD CONSTRAINT "ShipmentItem_supplierOrderItemId_fkey" FOREIGN KEY ("supplierOrderItemId") REFERENCES "SupplierOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentStep" ADD CONSTRAINT "FulfillmentStep_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Delivery and fulfillment invariants
ALTER TABLE "OfferDeliveryOption"
  ADD CONSTRAINT "OfferDeliveryOption_amounts_and_lead_time_check"
  CHECK (
    "minLeadTimeHours" >= 0
    AND ("maxLeadTimeHours" IS NULL OR "maxLeadTimeHours" >= "minLeadTimeHours")
    AND ("fixedAmountMinor" IS NULL OR "fixedAmountMinor" >= 0)
    AND ("freeFromAmountMinor" IS NULL OR "freeFromAmountMinor" >= 0)
    AND ("priceType" <> 'FIXED' OR "fixedAmountMinor" IS NOT NULL)
    AND ("priceType" <> 'FREE_FROM_AMOUNT' OR "freeFromAmountMinor" IS NOT NULL)
  );

ALTER TABLE "DeliveryRule"
  ADD CONSTRAINT "DeliveryRule_amounts_priority_and_lead_time_check"
  CHECK (
    "priority" >= 0
    AND "minLeadTimeHours" >= 0
    AND ("maxLeadTimeHours" IS NULL OR "maxLeadTimeHours" >= "minLeadTimeHours")
    AND ("fixedAmountMinor" IS NULL OR "fixedAmountMinor" >= 0)
    AND ("freeFromAmountMinor" IS NULL OR "freeFromAmountMinor" >= 0)
    AND ("priceType" <> 'FIXED' OR "fixedAmountMinor" IS NOT NULL)
    AND ("priceType" <> 'FREE_FROM_AMOUNT' OR "freeFromAmountMinor" IS NOT NULL)
  );

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_delivery_window_check"
  CHECK ("deliveryWindowEnd" IS NULL OR "deliveryWindowStart" IS NULL OR "deliveryWindowEnd" >= "deliveryWindowStart");

ALTER TABLE "ShipmentItem"
  ADD CONSTRAINT "ShipmentItem_quantities_check"
  CHECK ("quantity" > 0 AND "deliveredQuantity" >= 0 AND "deliveredQuantity" <= "quantity");

ALTER TABLE "FulfillmentStep"
  ADD CONSTRAINT "FulfillmentStep_sequence_check"
  CHECK ("sequence" >= 0);
