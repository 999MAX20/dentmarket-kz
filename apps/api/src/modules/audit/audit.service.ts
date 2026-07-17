import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

export type AuditQuery = {
  page: number;
  pageSize: number;
  entityType?: string;
  action?: string;
  entityId?: string;
  actorId?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, query: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
      action: query.action ? { contains: query.action, mode: "insensitive" } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize, pageCount: Math.ceil(total / query.pageSize) };
  }
}
