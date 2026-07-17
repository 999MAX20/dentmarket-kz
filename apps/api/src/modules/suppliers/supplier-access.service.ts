import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../platform/prisma/prisma.service";

export type SupplierActorContext = { actorId: string; organizationId: string };

@Injectable()
export class SupplierAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanManage(supplierOrganizationId: string, context: SupplierActorContext) {
    if (supplierOrganizationId === context.organizationId) return;
    const operatorCapability = await this.prisma.organizationCapability.findUnique({
      where: { organizationId_capability: { organizationId: context.organizationId, capability: "MARKETPLACE_OPERATOR" } },
    });
    if (!operatorCapability) throw new ForbiddenException("Supplier data belongs to another organization");
  }

  async requireProfile(supplierOrganizationId: string) {
    const profile = await this.prisma.supplierProfile.findUnique({ where: { organizationId: supplierOrganizationId } });
    if (!profile) throw new NotFoundException("Supplier profile not found");
    return profile;
  }
}
