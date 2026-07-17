import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { ComplianceEvaluationInput, CreateComplianceRuleInput, CreateOrganizationCredentialInput, ReviewComplianceCheckInput, ReviewOrganizationCredentialInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { FileUploadPolicyService } from "../../platform/security/file-upload-policy.service";
import { evaluateCompliance, type ComplianceRuleInput } from "./compliance-evaluator";

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService, private readonly uploads: FileUploadPolicyService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertOrganizationAccess(organizationId: string, context: SupplierActorContext) {
    if (organizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Organization data belongs to another organization");
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new NotFoundException("Organization not found");
  }

  async credentials(organizationId: string, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    return this.prisma.organizationCredential.findMany({ where: { organizationId }, orderBy: [{ status: "asc" }, { validTo: "asc" }, { createdAt: "desc" }] });
  }

  async createCredential(organizationId: string, input: CreateOrganizationCredentialInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(organizationId, context);
    let storageKey: string | null = null;
    let checksumSha256: string | null = null;
    if (input.contentBase64 && input.fileName) {
      const body = this.uploads.decodeBase64(input.contentBase64, 10_000_000);
      const asset = await this.uploads.quarantine({ organizationId, actorId: context.actorId, purpose: "compliance-credential", fileName: input.fileName, body, allowedKinds: ["PDF", "PNG", "JPEG"], maxBytes: 10_000_000 });
      checksumSha256 = asset.checksumSha256;
      storageKey = asset.storageKey;
    }
    return this.prisma.$transaction(async (tx) => {
      const credential = await tx.organizationCredential.upsert({
        where: { organizationId_type_number: { organizationId, type: input.type, number: input.number } },
        update: { issuer: input.issuer, validFrom: input.validFrom ? new Date(input.validFrom) : null, validTo: input.validTo ? new Date(input.validTo) : null, status: "PENDING", storageKey, checksumSha256, verifiedAt: null, verifiedById: null, rejectionReason: null, metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue },
        create: { organizationId, type: input.type, number: input.number, issuer: input.issuer, validFrom: input.validFrom ? new Date(input.validFrom) : null, validTo: input.validTo ? new Date(input.validTo) : null, storageKey, checksumSha256, metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({ data: { ...context, action: "compliance.credential.submitted", entityType: "OrganizationCredential", entityId: credential.id, after: { organizationId, type: credential.type, number: credential.number, validTo: credential.validTo, checksumSha256 } } });
      await tx.outboxEvent.create({ data: { aggregateType: "OrganizationCredential", aggregateId: credential.id, eventType: "OrganizationCredentialSubmitted", payload: { credentialId: credential.id, organizationId, type: credential.type } } });
      return credential;
    });
  }

  async reviewCredential(credentialId: string, input: ReviewOrganizationCredentialInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only compliance operators can review credentials");
    const credential = await this.prisma.organizationCredential.findUnique({ where: { id: credentialId } });
    if (!credential) throw new NotFoundException("Organization credential not found");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organizationCredential.update({ where: { id: credentialId }, data: { status: input.status, verifiedById: context.actorId, verifiedAt: new Date(), rejectionReason: input.status === "VERIFIED" ? null : input.reason } });
      await tx.auditLog.create({ data: { ...context, action: "compliance.credential.reviewed", entityType: "OrganizationCredential", entityId: credential.id, before: { status: credential.status }, after: { status: updated.status, reason: input.reason } } });
      await tx.outboxEvent.create({ data: { aggregateType: "OrganizationCredential", aggregateId: credential.id, eventType: "OrganizationCredentialReviewed", payload: { credentialId: credential.id, organizationId: credential.organizationId, type: credential.type, status: updated.status } } });
      return updated;
    });
  }

  async rules() {
    return this.prisma.complianceRule.findMany({ include: { category: true, supersedes: true }, orderBy: [{ code: "asc" }, { version: "desc" }] });
  }

  async createRule(input: CreateComplianceRuleInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only compliance operators can create rules");
    if (input.categoryId && !(await this.prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) throw new BadRequestException("Compliance category does not exist");
    const created = await this.prisma.$transaction(async (tx) => {
      if (input.status === "ACTIVE") {
        await tx.complianceRule.updateMany({ where: { code: input.code, status: "ACTIVE" }, data: { status: "RETIRED", effectiveTo: new Date() } });
        if (input.supersedesRuleId) await tx.complianceRule.updateMany({ where: { id: input.supersedesRuleId, status: "ACTIVE" }, data: { status: "RETIRED", effectiveTo: new Date() } });
      }
      const rule = await tx.complianceRule.create({ data: {
        ...input,
        conditions: input.conditions as Prisma.InputJsonValue,
        requiredCredentialTypes: input.requiredCredentialTypes,
        effectiveFrom: new Date(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      } });
      await tx.auditLog.create({ data: { ...context, action: "compliance.rule.created", entityType: "ComplianceRule", entityId: rule.id, after: { code: rule.code, version: rule.version, riskLevel: rule.riskLevel, decision: rule.decision, status: rule.status, effectiveFrom: rule.effectiveFrom } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ComplianceRule", aggregateId: rule.id, eventType: "ComplianceRuleChanged", payload: { ruleId: rule.id, code: rule.code, version: rule.version, status: rule.status } } });
      return rule;
    });
    const recheck = input.status === "ACTIVE" ? await this.recheckRule(created.id, context) : { checked: 0, blocked: 0, reviewRequired: 0 };
    return { rule: created, recheck };
  }

  async activateRule(ruleId: string, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only compliance operators can activate rules");
    const current = await this.prisma.complianceRule.findUnique({ where: { id: ruleId } });
    if (!current) throw new NotFoundException("Compliance rule not found");
    if (current.status !== "DRAFT") throw new ConflictException("Only a draft compliance rule can be activated");
    const activated = await this.prisma.$transaction(async (tx) => {
      await tx.complianceRule.updateMany({ where: { code: current.code, status: "ACTIVE" }, data: { status: "RETIRED", effectiveTo: new Date() } });
      const rule = await tx.complianceRule.update({ where: { id: ruleId }, data: { status: "ACTIVE", effectiveFrom: current.effectiveFrom > new Date() ? current.effectiveFrom : new Date() } });
      await tx.auditLog.create({ data: { ...context, action: "compliance.rule.activated", entityType: "ComplianceRule", entityId: rule.id, before: { status: current.status }, after: { status: rule.status } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ComplianceRule", aggregateId: rule.id, eventType: "ComplianceRuleChanged", payload: { ruleId: rule.id, code: rule.code, version: rule.version, status: rule.status } } });
      return rule;
    });
    return { rule: activated, recheck: await this.recheckRule(ruleId, context) };
  }

  async checks(context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.complianceCheck.findMany({
      where: operator ? {} : { OR: [{ sellerOrganizationId: context.organizationId }, { buyerOrganizationId: context.organizationId }] },
      include: { matchedRule: true, seller: true, buyer: true, offer: { include: { productVariant: { include: { product: true } } } }, warehouse: true, inventoryLot: true },
      orderBy: { evaluatedAt: "desc" },
      take: 200,
    });
  }

  async evaluate(input: ComplianceEvaluationInput, context: SupplierActorContext) {
    if (input.sellerOrganizationId !== context.organizationId && input.buyerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Compliance check belongs to another organization");
    return this.evaluateInternal(input, context);
  }

  async assertOfferAllowed(buyerOrganizationId: string, offerId: string, warehouseId: string, inventoryLotId: string | null, context: SupplierActorContext) {
    const offer = await this.prisma.supplierOffer.findUnique({ where: { id: offerId }, select: { supplierOrganizationId: true } });
    if (!offer) throw new NotFoundException("Supplier offer not found");
    const check = await this.evaluateInternal({ sellerOrganizationId: offer.supplierOrganizationId, buyerOrganizationId, offerId, warehouseId, inventoryLotId }, context);
    if (check.status === "BLOCKED") throw new ForbiddenException("Compliance rules prohibit this offer");
    if (check.status === "REVIEW_REQUIRED") throw new ConflictException("Offer requires compliance review before checkout");
    return check;
  }

  private async evaluateInternal(input: ComplianceEvaluationInput, context: SupplierActorContext) {
    const at = input.at ? new Date(input.at) : new Date();
    const seller = await this.prisma.organization.findUnique({ where: { id: input.sellerOrganizationId }, include: { capabilities: true, supplierProfile: true, credentials: true } });
    if (!seller) throw new NotFoundException("Seller organization not found");
    const buyer = input.buyerOrganizationId ? await this.prisma.organization.findUnique({ where: { id: input.buyerOrganizationId }, include: { capabilities: true } }) : null;
    if (input.buyerOrganizationId && !buyer) throw new NotFoundException("Buyer organization not found");
    const offer = input.offerId ? await this.prisma.supplierOffer.findUnique({ where: { id: input.offerId }, include: { publication: true, productVariant: { include: { product: { include: { categories: true, industries: { include: { industry: true } } } } } } } }) : null;
    if (input.offerId && (!offer || offer.supplierOrganizationId !== seller.id)) throw new BadRequestException("Offer does not belong to the seller");
    const warehouse = input.warehouseId ? await this.prisma.warehouse.findUnique({ where: { id: input.warehouseId } }) : null;
    if (input.warehouseId && (!warehouse || warehouse.supplierOrganizationId !== seller.id)) throw new BadRequestException("Warehouse does not belong to the seller");
    const lot = input.inventoryLotId ? await this.prisma.inventoryLot.findUnique({ where: { id: input.inventoryLotId } }) : null;
    if (input.inventoryLotId && (!lot || lot.supplierOrganizationId !== seller.id || (warehouse && lot.warehouseId !== warehouse.id))) throw new BadRequestException("Inventory lot does not belong to the seller warehouse");
    if (input.supplierOrderId) {
      const order = await this.prisma.supplierOrder.findUnique({ where: { id: input.supplierOrderId } });
      if (!order || order.supplierOrganizationId !== seller.id || (buyer && order.buyerOrganizationId !== buyer.id)) throw new BadRequestException("Supplier order does not match compliance parties");
    }
    const categoryIds = new Set(offer?.productVariant.product.categories.map(({ categoryId }) => categoryId) ?? []);
    const industryCodes = new Set(offer?.productVariant.product.industries.map(({ industry }) => industry.code) ?? []);
    const activeRules = await this.prisma.complianceRule.findMany({ where: { status: "ACTIVE", effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] }, orderBy: [{ priority: "asc" }, { version: "desc" }] });
    const rules = activeRules.filter((rule) => (!rule.categoryId || categoryIds.has(rule.categoryId)) && (!rule.industryCode || industryCodes.has(rule.industryCode)) && (!rule.productType || rule.productType === offer?.productVariant.product.productType) && (!rule.regulatoryClass || rule.regulatoryClass === offer?.productVariant.product.regulatoryClass)).map((rule): ComplianceRuleInput => ({
      id: rule.id,
      code: rule.code,
      version: rule.version,
      riskLevel: rule.riskLevel,
      decision: rule.decision,
      priority: rule.priority,
      conditions: rule.conditions as Record<string, unknown>,
      requiredCredentialTypes: Array.isArray(rule.requiredCredentialTypes) ? rule.requiredCredentialTypes.filter((value): value is string => typeof value === "string") : [],
      disclosureText: rule.disclosureText,
    }));
    const verifiedCredentialTypes = seller.credentials.filter((credential) => credential.status === "VERIFIED" && (!credential.validFrom || credential.validFrom <= at) && (!credential.validTo || credential.validTo >= at)).map(({ type }) => type);
    const regulatoryDetails = seller.supplierProfile?.regulatoryDetails && typeof seller.supplierProfile.regulatoryDetails === "object" && !Array.isArray(seller.supplierProfile.regulatoryDetails) ? seller.supplierProfile.regulatoryDetails as Record<string, unknown> : {};
    const result = evaluateCompliance(rules, {
      at,
      sellerCapabilities: seller.capabilities.map(({ capability }) => capability),
      buyerCapabilities: buyer?.capabilities.map(({ capability }) => capability) ?? [],
      verifiedCredentialTypes,
      warehouseCityId: warehouse?.cityId,
      offerSourceType: offer?.sourceType,
      officialDistributor: regulatoryDetails.officialDistributor === true,
      lot: lot ? { status: lot.status, expirationDate: lot.expirationDate, registrationCertificate: lot.registrationCertificate, serialNumber: lot.serialNumber, originSource: lot.originSource } : null,
    });
    const strongest = result.matchedRules.reduce<ComplianceRuleInput | null>((selected, rule) => !selected || this.decisionWeight(rule.decision) > this.decisionWeight(selected.decision) || (rule.decision === selected.decision && rule.priority < selected.priority) ? rule : selected, null);
    const snapshot = { sellerOrganizationId: seller.id, buyerOrganizationId: buyer?.id ?? null, offerId: offer?.id ?? null, warehouseId: warehouse?.id ?? null, inventoryLotId: lot?.id ?? null, supplierOrderId: input.supplierOrderId ?? null, productId: offer?.productVariant.product.id ?? null, productType: offer?.productVariant.product.productType ?? null, regulatoryClass: offer?.productVariant.product.regulatoryClass ?? null, categoryIds: [...categoryIds], industryCodes: [...industryCodes], verifiedCredentialTypes, at: at.toISOString() };
    const check = await this.prisma.$transaction(async (tx) => {
      const created = await tx.complianceCheck.create({ data: {
        sellerOrganizationId: seller.id,
        buyerOrganizationId: buyer?.id,
        offerId: offer?.id,
        warehouseId: warehouse?.id,
        inventoryLotId: lot?.id,
        supplierOrderId: input.supplierOrderId,
        matchedRuleId: strongest?.id,
        status: result.status,
        decision: result.decision,
        riskLevel: result.riskLevel,
        evaluatedAt: at,
        validUntil: new Date(at.getTime() + 24 * 60 * 60 * 1_000),
        inputSnapshot: snapshot,
        ruleSnapshot: result.matchedRules.map(({ id, code, version, riskLevel, decision, priority }) => ({ id, code, version, riskLevel, decision, priority })),
        reasons: result.reasons,
        missingCredentials: result.missingCredentials,
      } });
      if (offer?.publication && result.status === "BLOCKED") await tx.offerPublication.update({ where: { offerId: offer.id }, data: { status: "BLOCKED", marketplaceVisible: false, blockedReason: result.reasons.join("; ") } });
      if (offer?.publication && result.status === "REVIEW_REQUIRED" && offer.publication.status !== "BLOCKED") await tx.offerPublication.update({ where: { offerId: offer.id }, data: { status: "UNDER_REVIEW", marketplaceVisible: false, blockedReason: result.reasons.join("; ") } });
      await tx.auditLog.create({ data: { ...context, action: "compliance.evaluated", entityType: "ComplianceCheck", entityId: created.id, after: { ...snapshot, status: created.status, decision: created.decision, riskLevel: created.riskLevel, reasons: result.reasons } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ComplianceCheck", aggregateId: created.id, eventType: result.status === "BLOCKED" ? "ComplianceBlocked" : result.status === "REVIEW_REQUIRED" ? "ComplianceReviewRequired" : "CompliancePassed", payload: { complianceCheckId: created.id, sellerOrganizationId: seller.id, buyerOrganizationId: buyer?.id ?? null, offerId: offer?.id ?? null, status: result.status, riskLevel: result.riskLevel, reasons: result.reasons } } });
      return created;
    });
    return check;
  }

  async reviewCheck(checkId: string, input: ReviewComplianceCheckInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only compliance operators can review checks");
    const check = await this.prisma.complianceCheck.findUnique({ where: { id: checkId }, include: { offer: { include: { publication: true } } } });
    if (!check) throw new NotFoundException("Compliance check not found");
    if (check.status !== "REVIEW_REQUIRED") throw new ConflictException("Only checks awaiting review can be decided manually");
    const status = input.decision === "BLOCKED" ? "BLOCKED" : "PASSED";
    return this.prisma.$transaction(async (tx) => {
      const reviewed = await tx.complianceCheck.update({ where: { id: check.id }, data: { decision: input.decision, status, reviewedById: context.actorId, reviewedAt: new Date(), reviewComment: input.comment } });
      if (check.offer?.publication) await tx.offerPublication.update({ where: { offerId: check.offer.id }, data: status === "BLOCKED" ? { status: "BLOCKED", marketplaceVisible: false, blockedReason: input.comment } : { status: "PUBLISHED", marketplaceVisible: true, blockedReason: null, publishedAt: check.offer.publication.publishedAt ?? new Date() } });
      await tx.auditLog.create({ data: { ...context, action: "compliance.reviewed", entityType: "ComplianceCheck", entityId: check.id, before: { status: check.status, decision: check.decision }, after: { status: reviewed.status, decision: reviewed.decision, comment: input.comment } } });
      await tx.outboxEvent.create({ data: { aggregateType: "ComplianceCheck", aggregateId: check.id, eventType: status === "BLOCKED" ? "ComplianceBlocked" : "CompliancePassed", payload: { complianceCheckId: check.id, sellerOrganizationId: check.sellerOrganizationId, buyerOrganizationId: check.buyerOrganizationId, offerId: check.offerId, status, manuallyReviewed: true } } });
      return reviewed;
    });
  }

  async recheckRule(ruleId: string, context: SupplierActorContext) {
    const rule = await this.prisma.complianceRule.findUnique({ where: { id: ruleId } });
    if (!rule) throw new NotFoundException("Compliance rule not found");
    const offers = await this.prisma.supplierOffer.findMany({
      where: {
        ...(rule.productType || rule.regulatoryClass || rule.categoryId ? { productVariant: { product: { ...(rule.productType ? { productType: rule.productType } : {}), ...(rule.regulatoryClass ? { regulatoryClass: rule.regulatoryClass } : {}), ...(rule.categoryId ? { categories: { some: { categoryId: rule.categoryId } } } : {}) } } } : {}),
      },
      include: { inventoryBalances: { where: { quantityAvailable: { gt: 0 } }, include: { lots: { where: { status: "ACTIVE" }, orderBy: { expirationDate: { sort: "asc", nulls: "last" } }, take: 1 } }, take: 1 } },
      take: 500,
    });
    let blocked = 0;
    let reviewRequired = 0;
    for (const offer of offers) {
      const balance = offer.inventoryBalances[0];
      const check = await this.evaluateInternal({ sellerOrganizationId: offer.supplierOrganizationId, offerId: offer.id, warehouseId: balance?.warehouseId, inventoryLotId: balance?.lots[0]?.id }, context);
      if (check.status === "BLOCKED") blocked += 1;
      if (check.status === "REVIEW_REQUIRED") reviewRequired += 1;
    }
    return { checked: offers.length, blocked, reviewRequired };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireCredentials() {
    const expired = await this.prisma.organizationCredential.findMany({ where: { status: "VERIFIED", validTo: { lt: new Date() } }, take: 500 });
    for (const credential of expired) await this.prisma.$transaction(async (tx) => {
      const changed = await tx.organizationCredential.updateMany({ where: { id: credential.id, status: "VERIFIED" }, data: { status: "EXPIRED" } });
      if (changed.count === 0) return;
      await tx.auditLog.create({ data: { actorId: null, organizationId: credential.organizationId, action: "compliance.credential.expired", entityType: "OrganizationCredential", entityId: credential.id, before: { status: credential.status }, after: { status: "EXPIRED", validTo: credential.validTo } } });
      await tx.outboxEvent.create({ data: { aggregateType: "OrganizationCredential", aggregateId: credential.id, eventType: "OrganizationCredentialExpired", payload: { credentialId: credential.id, organizationId: credential.organizationId, type: credential.type, validTo: credential.validTo } } });
    });
    return { expired: expired.length };
  }

  private decisionWeight(decision: string) { return ({ ALLOWED: 0, ALLOWED_WITH_DISCLOSURE: 1, MANUAL_REVIEW: 2, BLOCKED: 3 } as Record<string, number>)[decision] ?? 0; }
}
