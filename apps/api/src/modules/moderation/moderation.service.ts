import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ApproveProductCandidateInput, RejectProductCandidateInput, SubmitProductCandidateInput } from "@marketplace/schemas";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  async submit(input: SubmitProductCandidateInput, context: SupplierActorContext) {
    const supplier = await this.prisma.supplierProfile.findUnique({ where: { organizationId: context.organizationId } });
    if (!supplier) throw new NotFoundException("Supplier profile not found");
    if (input.suggestedCategoryId && !await this.prisma.category.findFirst({ where: { id: input.suggestedCategoryId, status: "ACTIVE" } })) throw new NotFoundException("Suggested category not found");
    const duplicateSuggestions = await this.prisma.product.findMany({
      where: { status: { in: ["ACTIVE", "UNDER_REVIEW"] }, OR: [
        ...(input.proposedGtin ? [{ gtin: input.proposedGtin }, { variants: { some: { gtin: input.proposedGtin } } }] : []),
        { canonicalName: { contains: input.proposedName, mode: "insensitive" } },
      ] },
      select: { id: true, canonicalName: true, gtin: true, status: true, variants: { select: { id: true, sku: true, gtin: true }, take: 10 } },
      take: 10,
    });
    return this.prisma.$transaction(async (tx) => {
      const existingSource = await tx.supplierDataSource.findFirst({ where: { supplierOrganizationId: context.organizationId, type: "MANUAL", name: "Supplier product proposals" } });
      const source = existingSource ?? await tx.supplierDataSource.create({ data: { supplierOrganizationId: context.organizationId, type: "MANUAL", name: "Supplier product proposals" } });
      const externalItem = await tx.supplierExternalItem.create({ data: { supplierOrganizationId: context.organizationId, sourceId: source.id, externalId: `proposal:${randomUUID()}`, supplierSku: input.proposedSku, name: input.proposedName, normalizedName: input.proposedName.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}]+/gu, " ").trim(), brandText: input.proposedBrand, gtin: input.proposedGtin, rawData: { ...input.rawSubmission, submitted: { proposedName: input.proposedName, proposedSku: input.proposedSku, proposedGtin: input.proposedGtin, proposedBrand: input.proposedBrand, suggestedCategoryId: input.suggestedCategoryId }, duplicateSuggestionIds: duplicateSuggestions.map(({ id }) => id) } } });
      const candidate = await tx.productCandidate.create({ data: { supplierOrganizationId: context.organizationId, externalItemId: externalItem.id, proposedName: input.proposedName, proposedSku: input.proposedSku, proposedGtin: input.proposedGtin, proposedBrand: input.proposedBrand, suggestedCategoryId: input.suggestedCategoryId } });
      await tx.auditLog.create({ data: { ...context, action: "moderation.product_candidate.submitted", entityType: "ProductCandidate", entityId: candidate.id, after: { proposedName: input.proposedName, duplicateSuggestionIds: duplicateSuggestions.map(({ id }) => id) } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductCandidate", aggregateId: candidate.id, eventType: "ProductCandidateSubmitted", payload: { candidateId: candidate.id, supplierOrganizationId: context.organizationId, proposedName: input.proposedName } } });
      return { candidate, duplicateSuggestions };
    });
  }

  async list(status: "PENDING" | "APPROVED" | "REJECTED" | undefined, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.productCandidate.findMany({
      where: { status, supplierOrganizationId: operator ? undefined : context.organizationId },
      include: { supplier: { include: { organization: true } }, externalItem: true, suggestedCategory: true, approvedProduct: true, approvedVariant: true },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
  }

  private async requireCandidate(candidateId: string, context: SupplierActorContext) {
    const candidate = await this.prisma.productCandidate.findUnique({ where: { id: candidateId }, include: { externalItem: true } });
    if (!candidate) throw new NotFoundException("Product candidate not found");
    if (candidate.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new NotFoundException("Product candidate not found");
    return candidate;
  }

  async approve(candidateId: string, input: ApproveProductCandidateInput, context: SupplierActorContext) {
    const candidate = await this.requireCandidate(candidateId, context);
    if (candidate.status !== "PENDING") throw new ConflictException("Product candidate has already been decided");
    const [industryCount, categoryCount] = await Promise.all([
      this.prisma.industry.count({ where: { id: { in: input.industryIds }, status: "ACTIVE" } }),
      this.prisma.category.count({ where: { id: { in: input.categoryIds }, status: "ACTIVE" } }),
    ]);
    if (industryCount !== new Set(input.industryIds).size || categoryCount !== new Set(input.categoryIds).size) throw new BadRequestException("Every industry and category must exist and be active");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            canonicalName: input.canonicalName,
            slug: input.slug,
            productType: input.productType,
            regulatoryClass: input.regulatoryClass ?? null,
            gtin: candidate.proposedGtin,
            industries: { create: [...new Set(input.industryIds)].map((industryId) => ({ industryId })) },
            categories: { create: [...new Set(input.categoryIds)].map((categoryId) => ({ categoryId })) },
            searchDocument: { create: { searchableText: `${input.canonicalName} ${candidate.proposedSku ?? ""} ${candidate.proposedGtin ?? ""}`.trim(), normalizedText: input.canonicalName.toLocaleLowerCase("ru"), facets: { source: "supplier_candidate" } } },
          },
        });
        const variant = await tx.productVariant.create({ data: { productId: product.id, sku: candidate.proposedSku, gtin: candidate.proposedGtin, saleUnitId: input.saleUnitId ?? null, packageQuantity: input.packageQuantity } });
        const offer = await tx.supplierOffer.create({ data: { supplierOrganizationId: candidate.supplierOrganizationId, productVariantId: variant.id, saleUnitId: input.saleUnitId ?? null, sourceId: candidate.externalItem.sourceId, supplierSku: candidate.proposedSku, sourceType: "MANUAL", status: "DRAFT" } });
        const decided = await tx.productCandidate.update({ where: { id: candidateId }, data: { status: "APPROVED", approvedProductId: product.id, approvedVariantId: variant.id, decidedById: context.actorId, decidedAt: new Date() } });
        await tx.supplierExternalItem.update({ where: { id: candidate.externalItemId }, data: { matchedVariantId: variant.id } });
        await tx.supplierItemMatchCandidate.create({ data: { externalItemId: candidate.externalItemId, productVariantId: variant.id, score: 1, reasons: ["approved_product_candidate"], status: "CONFIRMED" } });
        if (candidate.externalItem.importRowId) await tx.importRow.update({ where: { id: candidate.externalItem.importRowId }, data: { status: "MATCHED" } });
        await tx.auditLog.create({ data: { ...context, action: "moderation.product_candidate.approved", entityType: "ProductCandidate", entityId: candidateId, before: candidate, after: { candidate: decided, product, variant, offer } } });
        await tx.outboxEvent.create({ data: { aggregateType: "ProductCandidate", aggregateId: candidateId, eventType: "ProductCandidateApproved", payload: { candidateId, supplierOrganizationId: candidate.supplierOrganizationId, productId: product.id, variantId: variant.id, offerId: offer.id } } });
        return { candidate: decided, product, variant, offer };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Product slug, GTIN, SKU, or classification conflicts with existing catalog data");
      throw error;
    }
  }

  async reject(candidateId: string, input: RejectProductCandidateInput, context: SupplierActorContext) {
    const candidate = await this.requireCandidate(candidateId, context);
    if (candidate.status !== "PENDING") throw new ConflictException("Product candidate has already been decided");
    return this.prisma.$transaction(async (tx) => {
      const rejected = await tx.productCandidate.update({ where: { id: candidateId }, data: { status: "REJECTED", rejectionReason: input.reason, decidedById: context.actorId, decidedAt: new Date() } });
      await tx.auditLog.create({ data: { ...context, action: "moderation.product_candidate.rejected", entityType: "ProductCandidate", entityId: candidateId, before: candidate, after: rejected } });
      await tx.outboxEvent.create({ data: { aggregateType: "ProductCandidate", aggregateId: candidateId, eventType: "ProductCandidateRejected", payload: { candidateId, supplierOrganizationId: candidate.supplierOrganizationId, reason: input.reason } } });
      return rejected;
    });
  }
}
