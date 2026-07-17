import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { DocumentsService } from "../documents/documents.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

const addYear = (value: Date) => { const next = new Date(value); next.setUTCFullYear(next.getUTCFullYear() + 1); return next; };
const visibleStatuses = ["DRAFT", "AWAITING_SIGNATURE", "ACTIVE", "NON_RENEWING"] as const;

@Injectable()
export class BuyerSupplierAgreementsService {
  constructor(private readonly prisma: PrismaService, private readonly documents: DocumentsService) {}
  private async isOperator(organizationId: string) { return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } })); }
  private async assertParty(supplierOrganizationId: string, buyerOrganizationId: string, context: SupplierActorContext) {
    const operator = await this.isOperator(context.organizationId);
    if (![supplierOrganizationId, buyerOrganizationId].includes(context.organizationId) && !operator) throw new ForbiddenException("Agreement is not available to this organization");
    const [supplier, buyer] = await Promise.all([
      this.prisma.organization.findFirst({ where: { id: supplierOrganizationId, status: "ACTIVE", capabilities: { some: { capability: "SUPPLIER" } } } }),
      this.prisma.organization.findFirst({ where: { id: buyerOrganizationId, status: "ACTIVE", capabilities: { some: { capability: "BUYER" } } } }),
    ]);
    if (!supplier) throw new NotFoundException("Active supplier organization not found");
    if (!buyer) throw new NotFoundException("Active buyer organization not found");
    return { supplier, buyer, operator };
  }
  private async require(id: string, context: SupplierActorContext) {
    const agreement = await this.prisma.buyerSupplierAgreement.findUnique({ where: { id }, include: { supplier: true, buyer: true, document: { include: { signatures: { orderBy: { createdAt: "asc" } } } } } });
    if (!agreement) throw new NotFoundException("Buyer-supplier agreement not found");
    if (![agreement.supplierOrganizationId, agreement.buyerOrganizationId].includes(context.organizationId) && !(await this.isOperator(context.organizationId))) throw new NotFoundException("Buyer-supplier agreement not found");
    return agreement;
  }
  async current(supplierOrganizationId: string, buyerOrganizationId: string, context: SupplierActorContext) {
    await this.assertParty(supplierOrganizationId, buyerOrganizationId, context);
    await this.processRenewals(supplierOrganizationId, buyerOrganizationId);
    const agreement = await this.prisma.buyerSupplierAgreement.findFirst({ where: { supplierOrganizationId, buyerOrganizationId, status: { in: ["ACTIVE", "NON_RENEWING"] }, endsAt: { gt: new Date() } }, include: { document: { include: { signatures: true } } }, orderBy: { endsAt: "desc" } });
    return agreement ? { agreement, frameworkAgreementAvailable: true, oneTimeDealAvailable: true } : { agreement: null, frameworkAgreementAvailable: false, oneTimeDealAvailable: true };
  }
  async initiate(input: { supplierOrganizationId: string; buyerOrganizationId: string; renewalMode: "AUTO_ANNUAL" | "MANUAL_ANNUAL" }, context: SupplierActorContext) {
    const { supplier, buyer } = await this.assertParty(input.supplierOrganizationId, input.buyerOrganizationId, context);
    await this.processRenewals(supplier.id, buyer.id);
    const existing = await this.prisma.buyerSupplierAgreement.findFirst({ where: { supplierOrganizationId: supplier.id, buyerOrganizationId: buyer.id, status: { in: [...visibleStatuses] } } });
    if (existing) throw new ConflictException(existing.status === "ACTIVE" || existing.status === "NON_RENEWING" ? "Действующий договор уже есть; повторная подпись недоступна" : "Подписание договора уже начато");
    const now = new Date();
    const template = await this.prisma.documentTemplate.findFirst({ where: { code: "FRAMEWORK_SUPPLY_AGREEMENT_RU", kind: "FRAMEWORK_SUPPLY_AGREEMENT", status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }, orderBy: { version: "desc" } });
    if (!template) throw new NotFoundException("Framework supply agreement template is not configured");
    const agreementNumber = `FSA-${now.getUTCFullYear()}-${supplier.bin}-${buyer.bin}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const document = await this.documents.generate({ ownerOrganizationId: supplier.id, templateId: template.id, title: "Рамочный договор поставки DentMarket", documentNumber: agreementNumber, expiresAt: addYear(now).toISOString(), data: { agreement: { number: agreementNumber, term: "12 месяцев", renewal: input.renewalMode === "AUTO_ANNUAL" ? "автоматическая ежегодная пролонгация" : "ежегодное продление по подтверждению" }, supplier: { legalName: supplier.legalName, displayName: supplier.displayName, bin: supplier.bin }, buyer: { legalName: buyer.legalName, displayName: buyer.displayName, bin: buyer.bin } }, metadata: { agreementType: "buyer_supplier_framework", supplierOrganizationId: supplier.id, buyerOrganizationId: buyer.id, renewalMode: input.renewalMode, templateVersion: template.version } }, context);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const agreement = await tx.buyerSupplierAgreement.create({ data: { agreementNumber, supplierOrganizationId: supplier.id, buyerOrganizationId: buyer.id, documentId: document.id, templateVersion: template.version, status: "AWAITING_SIGNATURE", renewalMode: input.renewalMode, autoRenew: input.renewalMode === "AUTO_ANNUAL", metadata: { initiatedByOrganizationId: context.organizationId } } });
        await tx.auditLog.create({ data: { ...context, organizationId: context.organizationId, action: "buyer_supplier_agreement.initiated", entityType: "BuyerSupplierAgreement", entityId: agreement.id, after: { agreementNumber, supplierOrganizationId: supplier.id, buyerOrganizationId: buyer.id, templateVersion: template.version } } });
        await tx.outboxEvent.create({ data: { aggregateType: "BuyerSupplierAgreement", aggregateId: agreement.id, eventType: "BuyerSupplierAgreementInitiated", payload: { agreementId: agreement.id, documentId: document.id, supplierOrganizationId: supplier.id, buyerOrganizationId: buyer.id } } });
        return agreement;
      });
      return this.presentation(created.id, context);
    } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { await this.prisma.document.update({ where: { id: document.id }, data: { status: "ARCHIVED" } }); throw new ConflictException("Agreement already exists or signing is in progress"); } throw error; }
  }
  async sign(id: string, input: { signerName: string; expiresInMinutes: number }, context: SupplierActorContext) {
    const agreement = await this.require(id, context);
    if (["ACTIVE", "NON_RENEWING"].includes(agreement.status)) throw new ConflictException("Действующий договор уже подписан; окно подписи недоступно");
    if (agreement.status !== "AWAITING_SIGNATURE") throw new ConflictException("Agreement cannot be signed in its current state");
    const now = new Date();
    const existing = agreement.document.signatures.find((s) => s.signerOrganizationId === context.organizationId && s.method === "EDS" && ["SIGNED", "PENDING", "SESSION_CREATED"].includes(s.status) && (s.status === "SIGNED" || !s.expiresAt || s.expiresAt > now));
    if (existing) return { agreement: await this.presentation(id, context), signature: existing, signingUnavailableReason: existing.status === "SIGNED" ? "party_already_signed" : "signature_session_exists" };
    const result = await this.documents.createSignatureSession(agreement.documentId, { method: "EDS", signerOrganizationId: context.organizationId, signerUserId: context.actorId, signerName: input.signerName, expiresInMinutes: input.expiresInMinutes }, context);
    await this.reconcile(id);
    return { agreement: await this.presentation(id, context), signature: result.signature, signingUrl: result.signingUrl };
  }
  async reconcile(id: string) {
    const agreement = await this.prisma.buyerSupplierAgreement.findUnique({ where: { id }, include: { document: { include: { signatures: true } } } });
    if (!agreement || agreement.status !== "AWAITING_SIGNATURE") return agreement;
    const signed = new Set(agreement.document.signatures.filter((s) => s.method === "EDS" && s.status === "SIGNED" && s.signerOrganizationId).map((s) => s.signerOrganizationId!));
    if (!signed.has(agreement.supplierOrganizationId) || !signed.has(agreement.buyerOrganizationId) || agreement.document.status !== "SIGNED") return agreement;
    const signedAt = agreement.document.signatures.reduce((latest, s) => s.signedAt && s.signedAt > latest ? s.signedAt : latest, new Date(0));
    const startsAt = signedAt.getTime() ? signedAt : new Date(); const endsAt = addYear(startsAt);
    return this.prisma.$transaction(async (tx) => { await tx.buyerSupplierAgreement.update({ where: { id }, data: { status: "ACTIVE", startsAt, endsAt } }); await tx.document.update({ where: { id: agreement.documentId }, data: { expiresAt: endsAt } }); await tx.auditLog.create({ data: { organizationId: agreement.supplierOrganizationId, action: "buyer_supplier_agreement.activated", entityType: "BuyerSupplierAgreement", entityId: id, after: { startsAt, endsAt, signedParties: [...signed] } } }); return tx.buyerSupplierAgreement.findUniqueOrThrow({ where: { id } }); });
  }
  async requestNonRenewal(id: string, reason: string, context: SupplierActorContext) { const agreement = await this.require(id, context); if (agreement.status !== "ACTIVE") throw new ConflictException("Only an active agreement can be marked non-renewing"); return this.prisma.buyerSupplierAgreement.update({ where: { id }, data: { status: "NON_RENEWING", terminationReason: reason } }); }
  async presentation(id: string, context: SupplierActorContext) { const agreement = await this.require(id, context); await this.reconcile(id); return this.prisma.buyerSupplierAgreement.findUniqueOrThrow({ where: { id }, include: { supplier: true, buyer: true, document: { include: { signatures: true } } } }); }
  async processRenewals(supplierOrganizationId?: string, buyerOrganizationId?: string) { const now = new Date(); const where: Prisma.BuyerSupplierAgreementWhereInput = { status: { in: ["ACTIVE", "NON_RENEWING"] }, endsAt: { lte: now }, ...(supplierOrganizationId ? { supplierOrganizationId } : {}), ...(buyerOrganizationId ? { buyerOrganizationId } : {}) }; const expired = await this.prisma.buyerSupplierAgreement.findMany({ where }); for (const agreement of expired) { if (agreement.status === "ACTIVE" && agreement.autoRenew) await this.prisma.buyerSupplierAgreement.update({ where: { id: agreement.id }, data: { startsAt: agreement.endsAt, endsAt: addYear(agreement.endsAt!), renewalCount: { increment: 1 }, lastRenewedAt: now } }); else await this.prisma.buyerSupplierAgreement.update({ where: { id: agreement.id }, data: { status: "EXPIRED" } }); } }
}
