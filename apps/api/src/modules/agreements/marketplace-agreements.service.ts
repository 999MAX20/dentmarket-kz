import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { DocumentsService } from "../documents/documents.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

const addYear = (value: Date) => { const next = new Date(value); next.setUTCFullYear(next.getUTCFullYear() + 1); return next; };
const liveStatuses = ["DRAFT", "AWAITING_SIGNATURE", "ACTIVE", "NON_RENEWING"] as const;

export function annualRenewalProjection(previousEnd: Date, now: Date) {
  let startsAt = previousEnd;
  let endsAt = addYear(previousEnd);
  let periods = 1;
  while (endsAt <= now && periods < 100) {
    startsAt = endsAt;
    endsAt = addYear(endsAt);
    periods += 1;
  }
  return { startsAt, endsAt, periods };
}

@Injectable()
export class MarketplaceAgreementsService {
  constructor(private readonly prisma: PrismaService, private readonly documents: DocumentsService) {}

  private async isOperator(organizationId: string) { return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } })); }

  private async parties(supplierOrganizationId: string, operatorOrganizationId?: string) {
    const [supplier, operator] = await Promise.all([
      this.prisma.organization.findFirst({ where: { id: supplierOrganizationId, status: "ACTIVE", capabilities: { some: { capability: "SUPPLIER" } } } }),
      operatorOrganizationId ? this.prisma.organization.findFirst({ where: { id: operatorOrganizationId, status: "ACTIVE", capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } } } }) : this.prisma.organization.findFirst({ where: { status: "ACTIVE", capabilities: { some: { capability: "MARKETPLACE_OPERATOR" } } }, orderBy: { createdAt: "asc" } }),
    ]);
    if (!supplier) throw new NotFoundException("Active supplier organization not found");
    if (!operator) throw new NotFoundException("Marketplace operator organization not found");
    return { supplier, operator };
  }

  async initiate(input: { supplierOrganizationId?: string; renewalMode: "AUTO_ANNUAL" | "MANUAL_ANNUAL" }, context: SupplierActorContext) {
    const supplierOrganizationId = input.supplierOrganizationId ?? context.organizationId;
    const operatorContext = await this.isOperator(context.organizationId);
    if (supplierOrganizationId !== context.organizationId && !operatorContext) throw new ForbiddenException("Agreement can only be initiated by its supplier or marketplace operator");
    const { supplier, operator } = await this.parties(supplierOrganizationId, operatorContext ? context.organizationId : undefined);
    await this.processRenewals(supplier.id);
    const existing = await this.prisma.marketplaceAgreement.findFirst({ where: { supplierOrganizationId: supplier.id, operatorOrganizationId: operator.id, status: { in: [...liveStatuses] } }, include: { document: { include: { signatures: true } } } });
    if (existing) throw new ConflictException(existing.status === "ACTIVE" || existing.status === "NON_RENEWING" ? "A valid marketplace agreement already exists; signing is unavailable" : "Marketplace agreement signing is already in progress");
    const now = new Date();
    const template = await this.prisma.documentTemplate.findFirst({ where: { code: "MARKETPLACE_SUPPLIER_AGREEMENT_RU", kind: "MARKETPLACE_SUPPLIER_AGREEMENT", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }, orderBy: { version: "desc" } });
    if (!template) throw new NotFoundException("Active marketplace supplier agreement template not found");
    if (template.requiredSignatureCount !== 2) throw new ConflictException("Marketplace agreement template must require two signatures");
    const agreementNumber = `DMA-${now.getUTCFullYear()}-${supplier.bin}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const document = await this.documents.generate({ ownerOrganizationId: supplier.id, templateId: template.id, title: "Договор с платформой DentMarket KZ", documentNumber: agreementNumber, data: { agreement: { number: agreementNumber, signedAt: "после подписания обеими сторонами", term: "12 месяцев", renewal: input.renewalMode === "AUTO_ANNUAL" ? "автоматическая ежегодная пролонгация" : "ежегодное продление по подтверждению" }, supplier: { legalName: supplier.legalName, displayName: supplier.displayName, bin: supplier.bin }, operator: { legalName: operator.legalName, displayName: operator.displayName, bin: operator.bin } }, expiresAt: addYear(now).toISOString(), metadata: { agreementType: "marketplace_supplier", supplierOrganizationId: supplier.id, operatorOrganizationId: operator.id, renewalMode: input.renewalMode, templateVersion: template.version } }, context);
    try {
      const agreement = await this.prisma.$transaction(async (tx) => {
        const created = await tx.marketplaceAgreement.create({ data: { agreementNumber, supplierOrganizationId: supplier.id, operatorOrganizationId: operator.id, documentId: document.id, templateId: template.id, templateVersion: template.version, status: "AWAITING_SIGNATURE", renewalMode: input.renewalMode, autoRenew: input.renewalMode === "AUTO_ANNUAL", metadata: { initiatedByOrganizationId: context.organizationId } } });
        await tx.auditLog.create({ data: { ...context, organizationId: supplier.id, action: "marketplace_agreement.initiated", entityType: "MarketplaceAgreement", entityId: created.id, after: { agreementNumber, operatorOrganizationId: operator.id, templateVersion: template.version, renewalMode: input.renewalMode } } });
        await tx.outboxEvent.create({ data: { aggregateType: "MarketplaceAgreement", aggregateId: created.id, eventType: "MarketplaceAgreementInitiated", payload: { agreementId: created.id, supplierOrganizationId: supplier.id, operatorOrganizationId: operator.id, documentId: document.id } } });
        return created;
      });
      return this.presentation(agreement.id, context);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await this.prisma.document.update({ where: { id: document.id }, data: { status: "ARCHIVED" } });
        throw new ConflictException("Marketplace agreement already exists or signing is in progress");
      }
      throw error;
    }
  }

  private async requireParty(agreementId: string, context: SupplierActorContext) {
    const agreement = await this.prisma.marketplaceAgreement.findUnique({ where: { id: agreementId }, include: { document: { include: { signatures: { orderBy: { createdAt: "asc" } } } } } });
    if (!agreement) throw new NotFoundException("Marketplace agreement not found");
    if (![agreement.supplierOrganizationId, agreement.operatorOrganizationId].includes(context.organizationId) && !(await this.isOperator(context.organizationId))) throw new NotFoundException("Marketplace agreement not found");
    return agreement;
  }

  async sign(agreementId: string, input: { signerName: string; expiresInMinutes: number }, context: SupplierActorContext) {
    const agreement = await this.requireParty(agreementId, context);
    if (agreement.status === "ACTIVE" || agreement.status === "NON_RENEWING") throw new ConflictException("Agreement is already valid; signing window is unavailable");
    if (agreement.status !== "AWAITING_SIGNATURE") throw new ConflictException("Agreement cannot be signed in its current state");
    if (![agreement.supplierOrganizationId, agreement.operatorOrganizationId].includes(context.organizationId)) throw new ForbiddenException("Only an agreement party can sign it");
    const now = new Date();
    const stale = agreement.document.signatures.filter(({ signerOrganizationId, method, status, expiresAt }) => signerOrganizationId === context.organizationId && method === "EDS" && ["PENDING", "SESSION_CREATED"].includes(status) && Boolean(expiresAt && expiresAt <= now));
    if (stale.length) await this.prisma.documentSignature.updateMany({ where: { id: { in: stale.map(({ id }) => id) } }, data: { status: "EXPIRED", rejectionReason: "Signing session expired before completion" } });
    const existing = agreement.document.signatures.find(({ signerOrganizationId, method, status, expiresAt }) => signerOrganizationId === context.organizationId && method === "EDS" && ["PENDING", "SESSION_CREATED", "SIGNED"].includes(status) && (status === "SIGNED" || !expiresAt || expiresAt > now));
    if (existing) return { agreement: await this.presentation(agreement.id, context), signature: existing, signingUnavailableReason: existing.status === "SIGNED" ? "party_already_signed" : "signature_session_exists" };
    const result = await this.documents.createSignatureSession(agreement.documentId, { method: "EDS", signerOrganizationId: context.organizationId, signerUserId: context.actorId, signerName: input.signerName, expiresInMinutes: input.expiresInMinutes }, context);
    await this.reconcile(agreement.id);
    return { agreement: await this.presentation(agreement.id, context), signature: result.signature, signingUrl: result.signingUrl };
  }

  async reconcile(agreementId: string) {
    const agreement = await this.prisma.marketplaceAgreement.findUnique({ where: { id: agreementId }, include: { document: { include: { signatures: true } } } });
    if (!agreement || agreement.status !== "AWAITING_SIGNATURE") return agreement;
    const signedParties = new Set(agreement.document.signatures.filter(({ method, status, signerOrganizationId }) => method === "EDS" && status === "SIGNED" && signerOrganizationId).map(({ signerOrganizationId }) => signerOrganizationId!));
    if (!signedParties.has(agreement.supplierOrganizationId) || !signedParties.has(agreement.operatorOrganizationId) || agreement.document.status !== "SIGNED") return agreement;
    const signedAt = agreement.document.signatures.reduce((latest, signature) => signature.signedAt && signature.signedAt > latest ? signature.signedAt : latest, new Date(0));
    const startsAt = signedAt.getTime() ? signedAt : new Date();
    const endsAt = addYear(startsAt);
    const activated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.marketplaceAgreement.updateMany({ where: { id: agreement.id, status: "AWAITING_SIGNATURE" }, data: { status: "ACTIVE", startsAt, endsAt, activatedAt: new Date(), activatedBySystem: true } });
      if (!changed.count) return tx.marketplaceAgreement.findUniqueOrThrow({ where: { id: agreement.id } });
      await tx.document.update({ where: { id: agreement.documentId }, data: { expiresAt: endsAt } });
      await tx.auditLog.create({ data: { organizationId: agreement.supplierOrganizationId, action: "marketplace_agreement.activated", entityType: "MarketplaceAgreement", entityId: agreement.id, after: { startsAt, endsAt, signedParties: [...signedParties] } } });
      await tx.outboxEvent.create({ data: { aggregateType: "MarketplaceAgreement", aggregateId: agreement.id, eventType: "MarketplaceAgreementActivated", payload: { agreementId: agreement.id, supplierOrganizationId: agreement.supplierOrganizationId, startsAt, endsAt } } });
      return tx.marketplaceAgreement.findUniqueOrThrow({ where: { id: agreement.id } });
    });
    return activated;
  }

  async presentation(agreementId: string, context: SupplierActorContext) {
    await this.reconcile(agreementId);
    const agreement = await this.requireParty(agreementId, context);
    const active = ["ACTIVE", "NON_RENEWING"].includes(agreement.status) && Boolean(agreement.startsAt && agreement.endsAt && agreement.startsAt <= new Date() && agreement.endsAt > new Date());
    const signedOrganizations = new Set(agreement.document.signatures.filter(({ method, status }) => method === "EDS" && status === "SIGNED").map(({ signerOrganizationId }) => signerOrganizationId));
    const party = context.organizationId === agreement.supplierOrganizationId ? "SUPPLIER" : context.organizationId === agreement.operatorOrganizationId || await this.isOperator(context.organizationId) ? "OPERATOR" : null;
    const alreadySigned = signedOrganizations.has(context.organizationId);
    return { ...agreement, active, signing: { available: agreement.status === "AWAITING_SIGNATURE" && Boolean(party) && !alreadySigned, party, alreadySigned, supplierSigned: signedOrganizations.has(agreement.supplierOrganizationId), operatorSigned: signedOrganizations.has(agreement.operatorOrganizationId), reason: active ? "active_agreement_exists" : alreadySigned ? "awaiting_counterparty" : agreement.status === "AWAITING_SIGNATURE" ? null : "agreement_not_signable" } };
  }

  async current(context: SupplierActorContext) {
    await this.processRenewals(context.organizationId);
    const operator = await this.isOperator(context.organizationId);
    const agreement = await this.prisma.marketplaceAgreement.findFirst({ where: operator ? { operatorOrganizationId: context.organizationId, status: { in: [...liveStatuses] } } : { supplierOrganizationId: context.organizationId, status: { in: [...liveStatuses] } }, orderBy: { createdAt: "desc" } });
    if (agreement) {
      const presented = await this.presentation(agreement.id, context);
      return { signingRequired: agreement.status === "DRAFT" || agreement.status === "AWAITING_SIGNATURE", signingAvailable: presented.signing.available, agreement: presented };
    }
    const previous = await this.prisma.marketplaceAgreement.findFirst({ where: operator ? { operatorOrganizationId: context.organizationId } : { supplierOrganizationId: context.organizationId }, orderBy: { createdAt: "desc" }, include: { document: true } });
    return { signingRequired: !operator, signingAvailable: !operator, agreement: null, previousAgreement: previous };
  }

  async currentForSupplier(supplierOrganizationId: string, context: SupplierActorContext) {
    if (supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new NotFoundException("Supplier agreement not found");
    await this.processRenewals(supplierOrganizationId);
    const agreement = await this.prisma.marketplaceAgreement.findFirst({ where: { supplierOrganizationId, status: { in: [...liveStatuses] } }, orderBy: { createdAt: "desc" } });
    if (agreement) {
      const presented = await this.presentation(agreement.id, context);
      return { signingRequired: agreement.status === "DRAFT" || agreement.status === "AWAITING_SIGNATURE", signingAvailable: presented.signing.available, agreement: presented };
    }
    const previous = await this.prisma.marketplaceAgreement.findFirst({ where: { supplierOrganizationId }, orderBy: { createdAt: "desc" }, include: { document: true } });
    return { signingRequired: true, signingAvailable: true, agreement: null, previousAgreement: previous };
  }

  async pendingForOperator(context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Marketplace operator access is required");
    const agreements = await this.prisma.marketplaceAgreement.findMany({
      where: { operatorOrganizationId: context.organizationId, status: "AWAITING_SIGNATURE" },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return Promise.all(agreements.map(({ id }) => this.presentation(id, context)));
  }

  async assertActive(supplierOrganizationId: string) {
    await this.processRenewals(supplierOrganizationId);
    const now = new Date();
    const agreement = await this.prisma.marketplaceAgreement.findFirst({ where: { supplierOrganizationId, status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: now }, endsAt: { gt: now } }, orderBy: { endsAt: "desc" } });
    if (!agreement) throw new ForbiddenException("An active EDS-signed marketplace supplier agreement is required for commercial operations");
    return agreement;
  }

  async activeSupplierIds() {
    await this.processRenewals();
    const now = new Date();
    const agreements = await this.prisma.marketplaceAgreement.findMany({ where: { status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: now }, endsAt: { gt: now } }, select: { supplierOrganizationId: true } });
    return [...new Set(agreements.map(({ supplierOrganizationId }) => supplierOrganizationId))];
  }

  async requestNonRenewal(agreementId: string, reason: string, context: SupplierActorContext) {
    const agreement = await this.requireParty(agreementId, context);
    if (agreement.status !== "ACTIVE") throw new ConflictException("Only an active agreement can be marked non-renewing");
    const updated = await this.prisma.marketplaceAgreement.update({ where: { id: agreementId }, data: { status: "NON_RENEWING", autoRenew: false, nonRenewalRequestedAt: new Date(), nonRenewalRequestedById: context.actorId, metadata: { ...(agreement.metadata as object ?? {}), nonRenewalReason: reason } } });
    await this.prisma.auditLog.create({ data: { ...context, organizationId: agreement.supplierOrganizationId, action: "marketplace_agreement.non_renewal_requested", entityType: "MarketplaceAgreement", entityId: agreementId, after: { reason, effectiveAt: agreement.endsAt } } });
    return updated;
  }

  async terminate(agreementId: string, reason: string, context: SupplierActorContext) {
    const agreement = await this.requireParty(agreementId, context);
    if (!["ACTIVE", "NON_RENEWING", "AWAITING_SIGNATURE"].includes(agreement.status)) throw new ConflictException("Agreement is already final");
    const updated = await this.prisma.$transaction(async (tx) => {
      const value = await tx.marketplaceAgreement.update({ where: { id: agreementId }, data: { status: "TERMINATED", autoRenew: false, terminatedAt: new Date(), terminatedById: context.actorId, terminationReason: reason } });
      await tx.document.update({ where: { id: agreement.documentId }, data: { status: agreement.document.status === "SIGNED" ? "ARCHIVED" : "REJECTED" } });
      await tx.auditLog.create({ data: { ...context, organizationId: agreement.supplierOrganizationId, action: "marketplace_agreement.terminated", entityType: "MarketplaceAgreement", entityId: agreementId, before: { status: agreement.status, endsAt: agreement.endsAt }, after: { reason, terminatedAt: value.terminatedAt } } });
      await tx.outboxEvent.create({ data: { aggregateType: "MarketplaceAgreement", aggregateId: agreementId, eventType: "MarketplaceAgreementTerminated", payload: { agreementId, supplierOrganizationId: agreement.supplierOrganizationId, reason } } });
      return value;
    });
    return updated;
  }

  @Cron("0 15 2 * * *")
  async processRenewals(supplierOrganizationId?: string) {
    const now = new Date();
    const due = await this.prisma.marketplaceAgreement.findMany({ where: { supplierOrganizationId, status: { in: ["ACTIVE", "NON_RENEWING"] }, endsAt: { lte: now } }, orderBy: { endsAt: "asc" }, take: 500 });
    for (const agreement of due) {
      const latestTemplate = await this.prisma.documentTemplate.findFirst({ where: { code: "MARKETPLACE_SUPPLIER_AGREEMENT_RU", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }, orderBy: { version: "desc" } });
      const canRenew = agreement.status === "ACTIVE" && agreement.autoRenew && agreement.renewalMode === "AUTO_ANNUAL" && latestTemplate?.version === agreement.templateVersion;
      if (canRenew && agreement.endsAt) {
        const renewal = annualRenewalProjection(agreement.endsAt, now);
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.marketplaceAgreement.updateMany({ where: { id: agreement.id, status: "ACTIVE", endsAt: agreement.endsAt }, data: { startsAt: renewal.startsAt, endsAt: renewal.endsAt, renewalCount: { increment: renewal.periods }, lastRenewedAt: now } });
          if (changed.count) {
            await tx.document.update({ where: { id: agreement.documentId }, data: { expiresAt: renewal.endsAt } });
            await tx.auditLog.create({ data: { organizationId: agreement.supplierOrganizationId, action: "marketplace_agreement.renewed", entityType: "MarketplaceAgreement", entityId: agreement.id, before: { endsAt: agreement.endsAt, renewalCount: agreement.renewalCount }, after: { startsAt: renewal.startsAt, endsAt: renewal.endsAt, renewedPeriods: renewal.periods, renewalCount: agreement.renewalCount + renewal.periods } } });
            await tx.outboxEvent.create({ data: { aggregateType: "MarketplaceAgreement", aggregateId: agreement.id, eventType: "MarketplaceAgreementRenewed", payload: { agreementId: agreement.id, supplierOrganizationId: agreement.supplierOrganizationId, endsAt: renewal.endsAt, renewedPeriods: renewal.periods } } });
          }
        });
      } else {
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.marketplaceAgreement.updateMany({ where: { id: agreement.id, status: agreement.status, endsAt: agreement.endsAt }, data: { status: latestTemplate && latestTemplate.version !== agreement.templateVersion ? "SUPERSEDED" : "EXPIRED", autoRenew: false } });
          if (changed.count) {
            await tx.document.update({ where: { id: agreement.documentId }, data: { status: "EXPIRED" } });
            await tx.auditLog.create({ data: { organizationId: agreement.supplierOrganizationId, action: "marketplace_agreement.expired", entityType: "MarketplaceAgreement", entityId: agreement.id, before: { status: agreement.status, endsAt: agreement.endsAt }, after: { templateChanged: latestTemplate?.version !== agreement.templateVersion, signingRequired: true } } });
          }
        });
      }
    }
    return { processed: due.length };
  }
}
