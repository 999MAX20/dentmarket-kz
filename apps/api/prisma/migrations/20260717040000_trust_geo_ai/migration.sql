-- CreateEnum
CREATE TYPE "ProductGapType" AS ENUM ('MATCHING_ERROR', 'STALE_PRICE', 'UNRELIABLE_STOCK', 'PACKAGING_ERROR', 'INCOMPLETE_DOCUMENTS', 'DELIVERY_FAILURE', 'SUSPICIOUS_PROMOTION', 'FAKE_REVIEW', 'UNVERIFIED_LOCATION', 'PAYMENT_DETAILS_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductGapSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ProductGapStatus" AS ENUM ('OPEN', 'SOFT_ACTION_ACTIVE', 'UNDER_APPEAL', 'RESOLVED', 'HARD_BLOCKED');

-- CreateEnum
CREATE TYPE "ProductGapActionType" AS ENUM ('NONE', 'REQUIRE_CONFIRMATION', 'DOWNRANK', 'DISABLE_COMPARISON', 'RESTRICT_SCOPE', 'HIDE_DISCOUNT', 'HOLD_FOR_REVIEW', 'FREEZE_CHANGE', 'HARD_BLOCK');

-- CreateEnum
CREATE TYPE "TrustAppealStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'UPHELD', 'PARTIALLY_UPHELD', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "VerifiedReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN', 'DISPUTED');

-- CreateEnum
CREATE TYPE "TrustRatingStatus" AS ENUM ('INSUFFICIENT_DATA', 'CALCULATED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "GeoVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryZoneType" AS ENUM ('CITY_LIST', 'REGION_LIST', 'RADIUS', 'HYBRID');

-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "district" TEXT,
ADD COLUMN     "geoEvidence" JSONB,
ADD COLUMN     "geoMethod" TEXT,
ADD COLUMN     "geoStatus" "GeoVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "geoVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "geoVerifiedById" UUID,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "centerLatitude" DECIMAL(10,7),
ADD COLUMN     "centerLongitude" DECIMAL(10,7),
ADD COLUMN     "excludedCityIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "radiusKm" DECIMAL(10,2),
ADD COLUMN     "regionCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "zoneType" "DeliveryZoneType" NOT NULL DEFAULT 'CITY_LIST';

-- AlterTable
ALTER TABLE "Warehouse" ADD COLUMN     "geoEvidence" JSONB,
ADD COLUMN     "geoMethod" TEXT,
ADD COLUMN     "geoStatus" "GeoVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
ADD COLUMN     "geoVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "geoVerifiedById" UUID,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "isSponsored" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sponsorshipLabel" TEXT,
ADD COLUMN     "sponsorshipApprovedById" UUID,
ADD COLUMN     "sponsorshipApprovedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ProductGapIncident" (
    "id" UUID NOT NULL,
    "ownerOrganizationId" UUID,
    "impactedOrganizationId" UUID,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "type" "ProductGapType" NOT NULL,
    "severity" "ProductGapSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ProductGapStatus" NOT NULL DEFAULT 'OPEN',
    "reasonCode" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "actionType" "ProductGapActionType" NOT NULL DEFAULT 'NONE',
    "actionExpiresAt" TIMESTAMP(3),
    "remediation" TEXT NOT NULL,
    "restorationCondition" TEXT NOT NULL,
    "hardBlockReason" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "createdById" UUID,
    "resolvedById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGapIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductGapAppeal" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "appellantOrganizationId" UUID NOT NULL,
    "appellantUserId" UUID NOT NULL,
    "status" "TrustAppealStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "decision" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGapAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPrivateComment" (
    "id" UUID NOT NULL,
    "supplierOrderId" UUID NOT NULL,
    "authorOrganizationId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PARTIES_AND_OPERATOR',
    "idempotencyKey" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPrivateComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifiedReview" (
    "id" UUID NOT NULL,
    "supplierOrderId" UUID NOT NULL,
    "reviewerOrganizationId" UUID NOT NULL,
    "reviewerUserId" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "productVariantId" UUID,
    "targetKey" TEXT NOT NULL,
    "overallRating" INTEGER NOT NULL,
    "dimensions" JSONB NOT NULL,
    "comment" TEXT,
    "status" "VerifiedReviewStatus" NOT NULL DEFAULT 'PENDING',
    "anomalyFlags" JSONB,
    "moderationReason" TEXT,
    "officialResponse" TEXT,
    "respondedById" UUID,
    "respondedAt" TIMESTAMP(3),
    "editDeadline" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerifiedReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifiedReviewRevision" (
    "id" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" UUID NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifiedReviewRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierTrustMetricEvent" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "metricCode" TEXT NOT NULL,
    "value" DECIMAL(8,5) NOT NULL,
    "weight" DECIMAL(8,5) NOT NULL DEFAULT 1,
    "categoryId" UUID,
    "cityId" UUID,
    "fulfillmentType" TEXT,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "disputed" BOOLEAN NOT NULL DEFAULT false,
    "excludedAt" TIMESTAMP(3),
    "exclusionReason" TEXT,
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierTrustMetricEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierTrustSnapshot" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "status" "TrustRatingStatus" NOT NULL DEFAULT 'INSUFFICIENT_DATA',
    "score" DECIMAL(6,3),
    "confidence" DECIMAL(6,5) NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "windowDays" INTEGER NOT NULL DEFAULT 180,
    "indicators" JSONB NOT NULL,
    "factors" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "formulaVersion" TEXT NOT NULL DEFAULT 'trust-v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierTrustSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierTrustAppeal" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "appellantUserId" UUID NOT NULL,
    "eventIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "TrustAppealStatus" NOT NULL DEFAULT 'OPEN',
    "reason" TEXT NOT NULL,
    "evidence" JSONB,
    "decision" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierTrustAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPerformanceEvent" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "warehouseId" UUID,
    "destinationCityId" UUID,
    "shipmentId" UUID NOT NULL,
    "promisedHours" INTEGER,
    "actualHours" INTEGER,
    "onTime" BOOLEAN,
    "distanceKm" DECIMAL(10,2),
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPerformanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationDecision" (
    "id" UUID NOT NULL,
    "buyerOrganizationId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "destinationAddressId" UUID,
    "mode" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "formulaVersion" TEXT NOT NULL DEFAULT 'recommend-v1',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductGapIncident_idempotencyKey_key" ON "ProductGapIncident"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductGapIncident_impactedOrganizationId_status_createdAt_idx" ON "ProductGapIncident"("impactedOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductGapIncident_subjectType_subjectId_status_idx" ON "ProductGapIncident"("subjectType", "subjectId", "status");

-- CreateIndex
CREATE INDEX "ProductGapIncident_type_status_severity_idx" ON "ProductGapIncident"("type", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "ProductGapAppeal_idempotencyKey_key" ON "ProductGapAppeal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProductGapAppeal_incidentId_status_createdAt_idx" ON "ProductGapAppeal"("incidentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductGapAppeal_appellantOrganizationId_status_createdAt_idx" ON "ProductGapAppeal"("appellantOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPrivateComment_idempotencyKey_key" ON "OrderPrivateComment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "OrderPrivateComment_supplierOrderId_createdAt_idx" ON "OrderPrivateComment"("supplierOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderPrivateComment_authorOrganizationId_createdAt_idx" ON "OrderPrivateComment"("authorOrganizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedReview_idempotencyKey_key" ON "VerifiedReview"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VerifiedReview_supplierOrganizationId_status_createdAt_idx" ON "VerifiedReview"("supplierOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "VerifiedReview_productVariantId_status_createdAt_idx" ON "VerifiedReview"("productVariantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedReview_supplierOrderId_reviewerOrganizationId_targe_key" ON "VerifiedReview"("supplierOrderId", "reviewerOrganizationId", "targetKey");

-- CreateIndex
CREATE INDEX "VerifiedReviewRevision_reviewId_createdAt_idx" ON "VerifiedReviewRevision"("reviewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedReviewRevision_reviewId_version_key" ON "VerifiedReviewRevision"("reviewId", "version");

-- CreateIndex
CREATE INDEX "SupplierTrustMetricEvent_supplierOrganizationId_metricCode__idx" ON "SupplierTrustMetricEvent"("supplierOrganizationId", "metricCode", "occurredAt");

-- CreateIndex
CREATE INDEX "SupplierTrustMetricEvent_categoryId_cityId_occurredAt_idx" ON "SupplierTrustMetricEvent"("categoryId", "cityId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierTrustMetricEvent_supplierOrganizationId_metricCode__key" ON "SupplierTrustMetricEvent"("supplierOrganizationId", "metricCode", "sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierTrustSnapshot_supplierOrganizationId_key" ON "SupplierTrustSnapshot"("supplierOrganizationId");

-- CreateIndex
CREATE INDEX "SupplierTrustSnapshot_status_score_idx" ON "SupplierTrustSnapshot"("status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierTrustAppeal_idempotencyKey_key" ON "SupplierTrustAppeal"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SupplierTrustAppeal_supplierOrganizationId_status_createdAt_idx" ON "SupplierTrustAppeal"("supplierOrganizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPerformanceEvent_shipmentId_key" ON "DeliveryPerformanceEvent"("shipmentId");

-- CreateIndex
CREATE INDEX "DeliveryPerformanceEvent_supplierOrganizationId_destination_idx" ON "DeliveryPerformanceEvent"("supplierOrganizationId", "destinationCityId", "occurredAt");

-- CreateIndex
CREATE INDEX "DeliveryPerformanceEvent_warehouseId_occurredAt_idx" ON "DeliveryPerformanceEvent"("warehouseId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationDecision_idempotencyKey_key" ON "RecommendationDecision"("idempotencyKey");

-- CreateIndex
CREATE INDEX "RecommendationDecision_buyerOrganizationId_productId_create_idx" ON "RecommendationDecision"("buyerOrganizationId", "productId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductGapAppeal" ADD CONSTRAINT "ProductGapAppeal_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "ProductGapIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedReviewRevision" ADD CONSTRAINT "VerifiedReviewRevision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "VerifiedReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierTrustAppeal" ADD CONSTRAINT "SupplierTrustAppeal_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "SupplierTrustSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
