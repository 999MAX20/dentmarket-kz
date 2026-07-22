import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { DecideProductCorrectionInput, SubmitProductCorrectionInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

type CorrectionField = SubmitProductCorrectionInput["field"];
type CorrectionStatus = "PENDING" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";

const fieldValue = (product: {
  canonicalName: string;
  description: string | null;
  manufacturerSku: string | null;
  gtin: string | null;
  productType: string;
  regulatoryClass: string | null;
}, field: CorrectionField) => {
  const values: Record<CorrectionField, string | null> = {
    CANONICAL_NAME: product.canonicalName,
    DESCRIPTION: product.description,
    MANUFACTURER_SKU: product.manufacturerSku,
    GTIN: product.gtin,
    PRODUCT_TYPE: product.productType,
    REGULATORY_CLASS: product.regulatoryClass,
  };
  return values[field];
};

const updateForField = (field: CorrectionField, value: string): Prisma.ProductUpdateInput => {
  if (field === "CANONICAL_NAME") return { canonicalName: value };
  if (field === "DESCRIPTION") return { description: value };
  if (field === "MANUFACTURER_SKU") return { manufacturerSku: value };
  if (field === "GTIN") return { gtin: value };
  if (field === "PRODUCT_TYPE") return { productType: value };
  return { regulatoryClass: value };
};

@Injectable()
export class ProductCorrectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({
      where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } },
    }));
  }

  async submit(input: SubmitProductCorrectionInput, context: SupplierActorContext) {
    const [product, linkedOffer, pending] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: input.productId } }),
      this.prisma.supplierOffer.findFirst({
        where: { supplierOrganizationId: context.organizationId, productVariant: { productId: input.productId } },
        select: { id: true },
      }),
      this.prisma.productCorrectionRequest.findFirst({
        where: { productId: input.productId, supplierOrganizationId: context.organizationId, field: input.field, status: "PENDING" },
        select: { id: true },
      }),
    ]);
    if (!product || !linkedOffer) throw new NotFoundException("Product is not available in the supplier assortment");
    if (pending) throw new ConflictException("A correction for this field is already awaiting moderation");
    const currentValue = fieldValue(product, input.field);
    if (currentValue?.trim() === input.proposedValue.trim()) throw new ConflictException("The proposed value already matches the catalog card");

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.productCorrectionRequest.create({
        data: {
          productId: input.productId,
          supplierOrganizationId: context.organizationId,
          field: input.field,
          currentValue,
          proposedValue: input.proposedValue,
          reason: input.reason,
          evidenceUrl: input.evidenceUrl ?? null,
          evidence: input.evidence ? input.evidence as Prisma.InputJsonValue : undefined,
        },
        include: { product: true },
      });
      await tx.auditLog.create({ data: { ...context, action: "catalog.product_correction.submitted", entityType: "ProductCorrectionRequest", entityId: request.id, after: request } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductCorrectionRequest", aggregateId: request.id, eventType: "ProductCorrectionSubmitted", payload: { requestId: request.id, productId: input.productId, field: input.field } } });
      return request;
    });
  }

  async list(status: CorrectionStatus | undefined, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.productCorrectionRequest.findMany({
      where: { status, supplierOrganizationId: operator ? undefined : context.organizationId },
      include: { product: { include: { brand: true, manufacturer: true } }, supplier: { include: { organization: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 200,
    });
  }

  private async pendingRequest(requestId: string, context: SupplierActorContext) {
    if (!await this.isOperator(context.organizationId)) throw new NotFoundException("Correction request not found");
    const request = await this.prisma.productCorrectionRequest.findUnique({ where: { id: requestId }, include: { product: true } });
    if (!request) throw new NotFoundException("Correction request not found");
    if (request.status !== "PENDING") throw new ConflictException("Correction request has already been decided");
    return request;
  }

  async approve(requestId: string, input: DecideProductCorrectionInput, context: SupplierActorContext) {
    const request = await this.pendingRequest(requestId, context);
    const acceptedValue = input.acceptedValue?.trim() || request.proposedValue;
    const partial = acceptedValue !== request.proposedValue;
    const previousSources = request.product.descriptionSources && typeof request.product.descriptionSources === "object" && !Array.isArray(request.product.descriptionSources)
      ? request.product.descriptionSources as Prisma.JsonObject
      : {};
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id: request.productId },
        data: {
          ...updateForField(request.field as CorrectionField, acceptedValue),
          descriptionSources: {
            ...previousSources,
            ownership: "DENTMARKET",
            lastModeratedCorrection: { requestId, field: request.field, decidedAt: new Date().toISOString() },
          },
          version: { increment: 1 },
        },
      });
      if (request.field === "CANONICAL_NAME") {
        await tx.productSearchDocument.updateMany({
          where: { productId: request.productId },
          data: { searchableText: acceptedValue, normalizedText: acceptedValue.toLocaleLowerCase("ru"), projectionVersion: { increment: 1 } },
        });
      }
      await tx.productContentSource.create({
        data: {
          productId: request.productId,
          supplierOrganizationId: request.supplierOrganizationId,
          field: request.field,
          value: acceptedValue,
          sourceType: "SUPPLIER_FEED",
          sourceName: "Запрос поставщика, проверенный DentMarket",
          sourceUrl: request.evidenceUrl,
          confidence: 0.9,
          verified: true,
          metadata: { correctionRequestId: requestId, moderatorComment: input.moderatorComment },
        },
      });
      const decided = await tx.productCorrectionRequest.update({
        where: { id: requestId },
        data: {
          status: partial ? "PARTIALLY_APPROVED" : "APPROVED",
          moderatorComment: input.moderatorComment,
          appliedValue: acceptedValue,
          appliedProductVersion: product.version,
          decidedById: context.actorId,
          decidedAt: new Date(),
        },
      });
      await tx.auditLog.create({ data: { ...context, action: "catalog.product_correction.approved", entityType: "ProductCorrectionRequest", entityId: requestId, before: request, after: { request: decided, product } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductCorrectionRequest", aggregateId: requestId, eventType: "ProductCorrectionApproved", payload: { requestId, productId: request.productId, field: request.field, productVersion: product.version } } });
      return decided;
    });
  }

  async reject(requestId: string, input: DecideProductCorrectionInput, context: SupplierActorContext) {
    const request = await this.pendingRequest(requestId, context);
    return this.prisma.$transaction(async (tx) => {
      const rejected = await tx.productCorrectionRequest.update({ where: { id: requestId }, data: { status: "REJECTED", moderatorComment: input.moderatorComment, decidedById: context.actorId, decidedAt: new Date() } });
      await tx.auditLog.create({ data: { ...context, action: "catalog.product_correction.rejected", entityType: "ProductCorrectionRequest", entityId: requestId, before: request, after: rejected } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductCorrectionRequest", aggregateId: requestId, eventType: "ProductCorrectionRejected", payload: { requestId, productId: request.productId, field: request.field } } });
      return rejected;
    });
  }
}
