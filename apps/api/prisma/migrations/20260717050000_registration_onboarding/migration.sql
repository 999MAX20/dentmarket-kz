CREATE TYPE "RegistrationIntentStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "RegistrationIntent" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "ownerDisplayName" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "organizationDisplayName" TEXT NOT NULL,
    "bin" VARCHAR(12) NOT NULL,
    "capability" "OrganizationCapabilityType" NOT NULL,
    "status" "RegistrationIntentStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "privacyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'landing',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedByUserId" UUID,
    "organizationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RegistrationIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationIntent_tokenHash_key" ON "RegistrationIntent"("tokenHash");
CREATE UNIQUE INDEX "RegistrationIntent_idempotencyKey_key" ON "RegistrationIntent"("idempotencyKey");
CREATE INDEX "RegistrationIntent_email_status_expiresAt_idx" ON "RegistrationIntent"("email", "status", "expiresAt");
CREATE INDEX "RegistrationIntent_bin_status_idx" ON "RegistrationIntent"("bin", "status");
CREATE INDEX "RegistrationIntent_capability_status_createdAt_idx" ON "RegistrationIntent"("capability", "status", "createdAt");

ALTER TABLE "RegistrationIntent" ADD CONSTRAINT "RegistrationIntent_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RegistrationIntent" ADD CONSTRAINT "RegistrationIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
