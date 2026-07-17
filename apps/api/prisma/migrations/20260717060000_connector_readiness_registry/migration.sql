CREATE TYPE "ConnectorReadinessStatus" AS ENUM ('READY', 'PARTIAL', 'BLOCKED');
CREATE TYPE "ConnectorGoLiveStatus" AS ENUM ('INTERNAL_READY', 'CONNECTOR_NEEDED', 'PILOT', 'LIVE_VERIFIED', 'BLOCKED');

CREATE TABLE "ConnectorReadiness" (
    "id" UUID NOT NULL,
    "providerCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "readinessStatus" "ConnectorReadinessStatus" NOT NULL,
    "goLiveStatus" "ConnectorGoLiveStatus" NOT NULL,
    "environment" TEXT NOT NULL,
    "directions" JSONB NOT NULL,
    "supportsRead" BOOLEAN NOT NULL DEFAULT false,
    "supportsWrite" BOOLEAN NOT NULL DEFAULT false,
    "credentialsRequired" BOOLEAN NOT NULL DEFAULT false,
    "externalConnectorRequired" BOOLEAN NOT NULL DEFAULT false,
    "supportedVersions" JSONB,
    "limitations" JSONB,
    "evidence" JSONB,
    "runbookPath" TEXT,
    "owner" TEXT NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConnectorReadiness_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectorReadiness_providerCode_key" ON "ConnectorReadiness"("providerCode");
CREATE INDEX "ConnectorReadiness_readinessStatus_goLiveStatus_idx" ON "ConnectorReadiness"("readinessStatus", "goLiveStatus");
CREATE INDEX "ConnectorReadiness_owner_idx" ON "ConnectorReadiness"("owner");
