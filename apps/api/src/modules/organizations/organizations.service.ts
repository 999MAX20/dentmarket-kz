import { ConflictException, Injectable } from "@nestjs/common";
import type { CreateOrganizationInput } from "@marketplace/schemas";
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
}
