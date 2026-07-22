CREATE TYPE "EmailAuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

ALTER TABLE "User"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

CREATE TABLE "EmailAuthToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "type" "EmailAuthTokenType" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailAuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAuthToken_tokenHash_key" ON "EmailAuthToken"("tokenHash");
CREATE INDEX "EmailAuthToken_userId_type_expiresAt_idx" ON "EmailAuthToken"("userId", "type", "expiresAt");
CREATE INDEX "EmailAuthToken_type_consumedAt_expiresAt_idx" ON "EmailAuthToken"("type", "consumedAt", "expiresAt");
ALTER TABLE "EmailAuthToken" ADD CONSTRAINT "EmailAuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
