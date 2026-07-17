import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { expandDentalSearchQuery } from "./dental-search-lexicon";

@Injectable()
export class SearchAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  record(query: string, resultCount: number, context: { actorId?: string; organizationId?: string }) {
    const intent = expandDentalSearchQuery(query);
    if (!intent.normalizedQuery) return;
    void this.prisma.searchQueryEvent.create({ data: {
      actorId: context.actorId,
      organizationId: context.organizationId,
      query: query.trim().slice(0, 240),
      normalizedQuery: intent.normalizedQuery,
      matchedAliases: intent.matchedAliases,
      resultCount,
    } }).catch(() => undefined);
  }

  async report(days = 30) {
    const safeDays = Math.min(90, Math.max(1, Math.trunc(days)));
    const rows = await this.prisma.$queryRaw<Array<{ query: string; searches: bigint; noResults: bigint; avgResults: number }>>(Prisma.sql`
      SELECT "normalizedQuery" AS query,
        COUNT(*)::bigint AS searches,
        COUNT(*) FILTER (WHERE "resultCount" = 0)::bigint AS "noResults",
        AVG("resultCount")::float AS "avgResults"
      FROM "SearchQueryEvent"
      WHERE "createdAt" >= NOW() - (${safeDays} * INTERVAL '1 day')
      GROUP BY "normalizedQuery"
      ORDER BY "noResults" DESC, searches DESC
      LIMIT 100
    `);
    return { days: safeDays, queries: rows.map((row) => ({ query: row.query, searches: Number(row.searches), noResults: Number(row.noResults), avgResults: Number(row.avgResults ?? 0) })) };
  }
}
