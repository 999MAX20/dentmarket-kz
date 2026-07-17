CREATE TYPE "MfaFactorStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

CREATE TABLE "UserMfaFactor" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "status" "MfaFactorStatus" NOT NULL DEFAULT 'PENDING',
  "encryptedSecret" TEXT NOT NULL,
  "recoveryCodeHashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "verifiedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserMfaFactor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMfaFactor_userId_key" ON "UserMfaFactor"("userId");
CREATE INDEX "UserMfaFactor_status_lockedUntil_idx" ON "UserMfaFactor"("status", "lockedUntil");
ALTER TABLE "UserMfaFactor" ADD CONSTRAINT "UserMfaFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
