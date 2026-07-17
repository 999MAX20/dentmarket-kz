-- DropIndex
DROP INDEX "NotificationPreference_organizationId_userId_eventType_chan_key";

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "scopeKey" TEXT NOT NULL DEFAULT 'organization';

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_organizationId_scopeKey_eventType_ch_key" ON "NotificationPreference"("organizationId", "scopeKey", "eventType", "channel");
