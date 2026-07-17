import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateProductPackagingInput } from "@marketplace/schemas";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

@Injectable()
export class PackagingService {
  constructor(private readonly prisma: PrismaService) {}

  list(productVariantId: string) {
    return this.prisma.productPackaging.findMany({ where: { productVariantId }, include: { unit: true, parentPackaging: true }, orderBy: [{ level: "asc" }, { quantityInBaseUnit: "asc" }] });
  }

  async create(productVariantId: string, input: CreateProductPackagingInput, context: SupplierActorContext) {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: productVariantId } });
    if (!variant) throw new NotFoundException("Product variant not found");
    const unit = await this.prisma.unitOfMeasure.findUnique({ where: { id: input.unitId } });
    if (!unit) throw new BadRequestException("Packaging unit does not exist");
    if (input.parentPackagingId) {
      const parent = await this.prisma.productPackaging.findFirst({ where: { id: input.parentPackagingId, productVariantId } });
      if (!parent) throw new BadRequestException("Parent packaging belongs to another variant");
      if (input.quantityInBaseUnit <= Number(parent.quantityInBaseUnit)) throw new BadRequestException("Child transport packaging must contain more base units than its parent");
    }
    return this.prisma.$transaction(async (tx) => {
      const packaging = await tx.productPackaging.create({ data: { productVariantId, ...input } });
      await tx.auditLog.create({ data: { ...context, action: "catalog.packaging.created", entityType: "ProductPackaging", entityId: packaging.id, after: packaging } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductVariant", aggregateId: productVariantId, eventType: "ProductPackagingChanged", payload: { productVariantId, packagingId: packaging.id, quantityInBaseUnit: packaging.quantityInBaseUnit.toString() } } });
      return packaging;
    });
  }
}
