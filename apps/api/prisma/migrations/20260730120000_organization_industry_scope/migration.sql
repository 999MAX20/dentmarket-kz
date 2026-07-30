ALTER TABLE "Organization" ADD COLUMN "primaryIndustryId" UUID;
ALTER TABLE "RegistrationIntent" ADD COLUMN "industryCode" TEXT NOT NULL DEFAULT 'dentistry-kz';

CREATE INDEX "Organization_primaryIndustryId_idx" ON "Organization"("primaryIndustryId");

ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_primaryIndustryId_fkey"
  FOREIGN KEY ("primaryIndustryId") REFERENCES "Industry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Organization" o
SET "primaryIndustryId" = i.id
FROM "Industry" i
WHERE i.code = 'dentistry-kz'
  AND "primaryIndustryId" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "OrganizationCapability" c
    WHERE c."organizationId" = o.id
      AND c.capability = 'BUYER'
  );
