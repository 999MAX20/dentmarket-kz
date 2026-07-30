import { ConflictException, Injectable } from "@nestjs/common";
import type { CreateOrganizationInput, SwitchOrganizationIndustryInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.organization.findMany({
      include: { capabilities: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(input: CreateOrganizationInput, context: { actorId: string; organizationId: string }) {
    try {
      return await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          legalName: input.legalName,
          displayName: input.displayName,
          bin: input.bin,
          primaryIndustry: { connect: { code: input.industryCode } },
          capabilities: {
            create: input.capabilities.map((capability) => ({ capability })),
          },
        },
        include: { capabilities: true },
      });

      await tx.auditLog.create({
        data: {
          action: "organization.created",
          entityType: "Organization",
          entityId: organization.id,
          ...context,
          after: organization,
        },
      });
      await tx.outboxEvent.create({
        data: {
          aggregateType: "Organization",
          aggregateId: organization.id,
          eventType: "OrganizationCreated",
          payload: { organizationId: organization.id },
        },
      });
        return organization;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Organization with this BIN already exists");
      }
      throw error;
    }
  }

  async switchIndustry(organizationId: string, input: SwitchOrganizationIndustryInput, context: { actorId: string; organizationId: string }) {
    const industry = await this.prisma.industry.findFirst({ where: { code: input.industryCode, status: "ACTIVE" } });
    if (!industry) throw new ConflictException("Industry is not active or does not exist");
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, primaryIndustryId: true } });
    if (!organization) throw new ConflictException("Organization not found");
    if (organization.primaryIndustryId === industry.id) return { organizationId, industryCode: input.industryCode, changed: false };
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.organization.update({ where: { id: organizationId }, data: { primaryIndustryId: industry.id, version: { increment: 1 } }, include: { primaryIndustry: true } });
      await tx.auditLog.create({ data: { ...context, organizationId, action: "organization.industry.changed", entityType: "Organization", entityId: organizationId, before: { primaryIndustryId: organization.primaryIndustryId }, after: { primaryIndustryId: industry.id, industryCode: industry.code } } });
      return result;
    });
    return { organizationId: updated.id, industryCode: updated.primaryIndustry?.code ?? input.industryCode, changed: true };
  }
}
