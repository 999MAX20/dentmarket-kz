ALTER TABLE "RegistrationIntent"
  ADD COLUMN "acceptanceIpAddress" TEXT,
  ADD COLUMN "acceptanceUserAgent" TEXT,
  ADD COLUMN "acceptanceMethod" TEXT NOT NULL DEFAULT 'REGISTRATION_FORM',
  ADD COLUMN "offerDocumentHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "evidenceSnapshot" JSONB;

CREATE TABLE "PlatformOfferAcceptance" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "registrationIntentId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "termsVersion" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "acceptanceMethod" TEXT NOT NULL,
  "documentHash" TEXT NOT NULL,
  "evidenceSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformOfferAcceptance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformOfferAcceptance_organizationId_key" UNIQUE ("organizationId"),
  CONSTRAINT "PlatformOfferAcceptance_registrationIntentId_key" UNIQUE ("registrationIntentId"),
  CONSTRAINT "PlatformOfferAcceptance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlatformOfferAcceptance_registrationIntentId_fkey" FOREIGN KEY ("registrationIntentId") REFERENCES "RegistrationIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlatformOfferAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "PlatformOfferAcceptance_userId_acceptedAt_idx" ON "PlatformOfferAcceptance"("userId", "acceptedAt");
CREATE INDEX "PlatformOfferAcceptance_termsVersion_acceptedAt_idx" ON "PlatformOfferAcceptance"("termsVersion", "acceptedAt");

ALTER TABLE "SupplierExternalItem"
  ADD COLUMN "complianceStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  ADD COLUMN "complianceReasons" JSONB;
