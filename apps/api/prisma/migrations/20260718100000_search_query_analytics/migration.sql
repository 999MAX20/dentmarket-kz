CREATE TABLE "SearchQueryEvent" (
    "id" UUID NOT NULL,
    "actorId" TEXT,
    "organizationId" TEXT,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "matchedAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resultCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchQueryEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SearchQueryEvent_createdAt_idx" ON "SearchQueryEvent"("createdAt");
CREATE INDEX "SearchQueryEvent_normalizedQuery_createdAt_idx" ON "SearchQueryEvent"("normalizedQuery", "createdAt");
CREATE INDEX "SearchQueryEvent_resultCount_createdAt_idx" ON "SearchQueryEvent"("resultCount", "createdAt");
