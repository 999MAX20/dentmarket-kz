-- Provider-independent integration foundation.
-- Runtime secrets are encrypted by the application; only ciphertext is persisted.

CREATE TYPE "IntegrationProvider" AS ENUM ('MOYSKLAD', 'ONE_C', 'CUSTOM_API', 'MOCK');
CREATE TYPE "IntegrationConnectionMode" AS ENUM ('API', 'AGENT', 'WEBHOOK', 'HYBRID');
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'ERROR', 'REVOKED');
CREATE TYPE "IntegrationDataType" AS ENUM ('CATALOG', 'PRICE', 'INVENTORY', 'ORDER', 'RESERVATION', 'SHIPMENT', 'RETURN', 'IMAGE');
CREATE TYPE "IntegrationMappingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ERROR');
CREATE TYPE "IntegrationEntityType" AS ENUM ('PRODUCT', 'VARIANT', 'WAREHOUSE', 'PRICE_TYPE', 'COUNTERPARTY', 'ORDER_STATE');
CREATE TYPE "IntegrationJobType" AS ENUM ('TEST_CONNECTION', 'DISCOVER', 'FULL_SYNC', 'INCREMENTAL_SYNC', 'CATALOG_SYNC', 'PRICE_SYNC', 'INVENTORY_SYNC', 'ORDER_EXPORT', 'RESERVATION_CREATE', 'RESERVATION_RELEASE', 'WEBHOOK_PROCESS', 'RECONCILIATION');
CREATE TYPE "IntegrationJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');
CREATE TYPE "IntegrationJobTrigger" AS ENUM ('MANUAL', 'SCHEDULE', 'WEBHOOK', 'OUTBOX', 'RETRY', 'AGENT');
CREATE TYPE "IntegrationWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');
CREATE TYPE "IntegrationSignatureStatus" AS ENUM ('VERIFIED', 'SKIPPED', 'INVALID');
CREATE TYPE "IntegrationReconciliationKind" AS ENUM ('CATALOG', 'PRICE', 'INVENTORY', 'ORDER', 'RESERVATION');
CREATE TYPE "IntegrationReconciliationStatus" AS ENUM ('MATCHED', 'MISMATCH', 'MISSING_EXTERNAL', 'MISSING_INTERNAL', 'RESOLVED');
CREATE TYPE "ConnectorAgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'OFFLINE', 'REVOKED');
CREATE TYPE "ExternalReservationStatus" AS ENUM ('PENDING', 'ACTIVE', 'RELEASED', 'CONSUMED', 'FAILED');

CREATE TABLE "IntegrationConnection" (
    "id" UUID NOT NULL,
    "supplierOrganizationId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "mode" "IntegrationConnectionMode" NOT NULL,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "displayName" TEXT NOT NULL,
    "encryptedCredentials" TEXT,
    "credentialKeyVersion" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB,
    "capabilities" JSONB,
    "externalAccountId" TEXT,
    "webhookEndpointId" TEXT,
    "encryptedWebhookSecret" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "nextSyncAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntegrationConnection_failure_count_check" CHECK ("consecutiveFailures" >= 0),
    CONSTRAINT "IntegrationConnection_version_check" CHECK ("version" > 0)
);

CREATE TABLE "IntegrationDataBinding" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "dataType" "IntegrationDataType" NOT NULL,
    "warehouseId" UUID,
    "offerId" UUID,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" "IntegrationMappingStatus" NOT NULL DEFAULT 'ACTIVE',
    "configuration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationDataBinding_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntegrationDataBinding_single_scope_check" CHECK (num_nonnulls("warehouseId", "offerId") <= 1),
    CONSTRAINT "IntegrationDataBinding_priority_check" CHECK ("priority" >= 0)
);

CREATE TABLE "IntegrationMapping" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "entityType" "IntegrationEntityType" NOT NULL,
    "externalId" TEXT NOT NULL,
    "internalId" UUID,
    "mappingData" JSONB,
    "status" "IntegrationMappingStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSyncJob" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "type" "IntegrationJobType" NOT NULL,
    "status" "IntegrationJobStatus" NOT NULL DEFAULT 'PENDING',
    "trigger" "IntegrationJobTrigger" NOT NULL DEFAULT 'MANUAL',
    "idempotencyKey" TEXT NOT NULL,
    "cursor" JSONB,
    "payload" JSONB,
    "result" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "correlationId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationSyncJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntegrationSyncJob_attempts_check" CHECK ("attempt" >= 0 AND "maxAttempts" > 0 AND "attempt" <= "maxAttempts")
);

CREATE TABLE "IntegrationWebhookEvent" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signatureStatus" "IntegrationSignatureStatus" NOT NULL,
    "status" "IntegrationWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationWebhookEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "IntegrationWebhookEvent_attempt_check" CHECK ("attempt" >= 0)
);

CREATE TABLE "IntegrationReconciliationEntry" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "kind" "IntegrationReconciliationKind" NOT NULL,
    "status" "IntegrationReconciliationStatus" NOT NULL,
    "externalRef" TEXT,
    "internalType" TEXT,
    "internalId" UUID,
    "expected" JSONB,
    "actual" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationReconciliationEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConnectorAgent" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" "ConnectorAgentStatus" NOT NULL DEFAULT 'PENDING',
    "version" TEXT,
    "minimumSupportedVersion" TEXT,
    "capabilities" JSONB,
    "enrollmentTokenHash" TEXT,
    "enrollmentExpiresAt" TIMESTAMP(3),
    "accessTokenHash" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastIpAddress" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectorAgent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalReservation" (
    "id" UUID NOT NULL,
    "inventoryReservationId" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "externalReservationId" TEXT,
    "status" "ExternalReservationStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "lastError" TEXT,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExternalReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_sourceId_key" ON "IntegrationConnection"("sourceId");
CREATE UNIQUE INDEX "IntegrationConnection_webhookEndpointId_key" ON "IntegrationConnection"("webhookEndpointId");
CREATE INDEX "IntegrationConnection_supplierOrganizationId_status_idx" ON "IntegrationConnection"("supplierOrganizationId", "status");
CREATE INDEX "IntegrationConnection_provider_status_idx" ON "IntegrationConnection"("provider", "status");
CREATE INDEX "IntegrationConnection_status_nextSyncAt_idx" ON "IntegrationConnection"("status", "nextSyncAt");

CREATE INDEX "IntegrationDataBinding_connectionId_dataType_status_priorit_idx" ON "IntegrationDataBinding"("connectionId", "dataType", "status", "priority");
CREATE INDEX "IntegrationDataBinding_warehouseId_dataType_status_idx" ON "IntegrationDataBinding"("warehouseId", "dataType", "status");
CREATE INDEX "IntegrationDataBinding_offerId_dataType_status_idx" ON "IntegrationDataBinding"("offerId", "dataType", "status");
CREATE UNIQUE INDEX "IntegrationDataBinding_global_unique" ON "IntegrationDataBinding"("connectionId", "dataType") WHERE "warehouseId" IS NULL AND "offerId" IS NULL;
CREATE UNIQUE INDEX "IntegrationDataBinding_warehouse_unique" ON "IntegrationDataBinding"("connectionId", "dataType", "warehouseId") WHERE "warehouseId" IS NOT NULL;
CREATE UNIQUE INDEX "IntegrationDataBinding_offer_unique" ON "IntegrationDataBinding"("connectionId", "dataType", "offerId") WHERE "offerId" IS NOT NULL;

CREATE INDEX "IntegrationMapping_connectionId_entityType_internalId_idx" ON "IntegrationMapping"("connectionId", "entityType", "internalId");
CREATE INDEX "IntegrationMapping_status_lastSeenAt_idx" ON "IntegrationMapping"("status", "lastSeenAt");
CREATE UNIQUE INDEX "IntegrationMapping_connectionId_entityType_externalId_key" ON "IntegrationMapping"("connectionId", "entityType", "externalId");

CREATE INDEX "IntegrationSyncJob_status_availableAt_createdAt_idx" ON "IntegrationSyncJob"("status", "availableAt", "createdAt");
CREATE INDEX "IntegrationSyncJob_connectionId_type_status_idx" ON "IntegrationSyncJob"("connectionId", "type", "status");
CREATE INDEX "IntegrationSyncJob_lockedAt_idx" ON "IntegrationSyncJob"("lockedAt");
CREATE UNIQUE INDEX "IntegrationSyncJob_connectionId_idempotencyKey_key" ON "IntegrationSyncJob"("connectionId", "idempotencyKey");

CREATE INDEX "IntegrationWebhookEvent_status_availableAt_createdAt_idx" ON "IntegrationWebhookEvent"("status", "availableAt", "createdAt");
CREATE INDEX "IntegrationWebhookEvent_connectionId_eventType_createdAt_idx" ON "IntegrationWebhookEvent"("connectionId", "eventType", "createdAt");
CREATE UNIQUE INDEX "IntegrationWebhookEvent_connectionId_externalEventId_key" ON "IntegrationWebhookEvent"("connectionId", "externalEventId");

CREATE INDEX "IntegrationReconciliationEntry_connectionId_kind_status_det_idx" ON "IntegrationReconciliationEntry"("connectionId", "kind", "status", "detectedAt");
CREATE INDEX "IntegrationReconciliationEntry_status_detectedAt_idx" ON "IntegrationReconciliationEntry"("status", "detectedAt");
CREATE INDEX "IntegrationReconciliationEntry_internalType_internalId_idx" ON "IntegrationReconciliationEntry"("internalType", "internalId");

CREATE UNIQUE INDEX "ConnectorAgent_connectionId_key" ON "ConnectorAgent"("connectionId");
CREATE UNIQUE INDEX "ConnectorAgent_agentId_key" ON "ConnectorAgent"("agentId");
CREATE INDEX "ConnectorAgent_status_lastHeartbeatAt_idx" ON "ConnectorAgent"("status", "lastHeartbeatAt");

CREATE UNIQUE INDEX "ExternalReservation_inventoryReservationId_key" ON "ExternalReservation"("inventoryReservationId");
CREATE INDEX "ExternalReservation_connectionId_status_createdAt_idx" ON "ExternalReservation"("connectionId", "status", "createdAt");
CREATE INDEX "ExternalReservation_externalReservationId_idx" ON "ExternalReservation"("externalReservationId");
CREATE UNIQUE INDEX "ExternalReservation_connectionId_idempotencyKey_key" ON "ExternalReservation"("connectionId", "idempotencyKey");

ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_supplierOrganizationId_fkey" FOREIGN KEY ("supplierOrganizationId") REFERENCES "SupplierProfile"("organizationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "SupplierDataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IntegrationDataBinding" ADD CONSTRAINT "IntegrationDataBinding_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationDataBinding" ADD CONSTRAINT "IntegrationDataBinding_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationDataBinding" ADD CONSTRAINT "IntegrationDataBinding_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "SupplierOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationMapping" ADD CONSTRAINT "IntegrationMapping_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSyncJob" ADD CONSTRAINT "IntegrationSyncJob_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationWebhookEvent" ADD CONSTRAINT "IntegrationWebhookEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationReconciliationEntry" ADD CONSTRAINT "IntegrationReconciliationEntry_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConnectorAgent" ADD CONSTRAINT "ConnectorAgent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalReservation" ADD CONSTRAINT "ExternalReservation_inventoryReservationId_fkey" FOREIGN KEY ("inventoryReservationId") REFERENCES "InventoryReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalReservation" ADD CONSTRAINT "ExternalReservation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
