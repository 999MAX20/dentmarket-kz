import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CompleteDocumentSignatureInput, CreateDocumentTemplateInput, CreateDocumentVersionInput, CreateGeneratedDocumentInput, CreateSignatureSessionInput, DocumentQueryInput, UploadDocumentInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { ObjectStorageService } from "../../platform/storage/object-storage.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";
import { DocumentRendererService } from "./document-renderer.service";
import { SignatureAdapterRegistry } from "./signature-adapter-registry.service";
import { FileUploadPolicyService } from "../../platform/security/file-upload-policy.service";

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly renderer: DocumentRendererService,
    private readonly signatures: SignatureAdapterRegistry,
    private readonly uploads: FileUploadPolicyService,
  ) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  private async assertOrganizationAccess(organizationId: string, context: SupplierActorContext) {
    if (organizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Organization data belongs to another organization");
    if (!(await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } }))) throw new NotFoundException("Organization not found");
  }

  async templates() {
    return this.prisma.documentTemplate.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] });
  }

  async createTemplate(input: CreateDocumentTemplateInput, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator can create document templates");
    return this.prisma.$transaction(async (tx) => {
      const template = await tx.documentTemplate.create({ data: {
        ...input,
        signatureMethods: input.signatureMethods,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue,
      } });
      await tx.auditLog.create({ data: { ...context, action: "document.template.created", entityType: "DocumentTemplate", entityId: template.id, after: { code: template.code, version: template.version, kind: template.kind, format: template.format } } });
      await tx.outboxEvent.create({ data: { aggregateType: "DocumentTemplate", aggregateId: template.id, eventType: "DocumentTemplateCreated", payload: { templateId: template.id, code: template.code, version: template.version } } });
      return template;
    });
  }

  async list(input: DocumentQueryInput, context: SupplierActorContext) {
    if (input.ownerOrganizationId) await this.assertOrganizationAccess(input.ownerOrganizationId, context);
    const operator = await this.isOperator(context.organizationId);
    return this.prisma.document.findMany({
      where: {
        ownerOrganizationId: input.ownerOrganizationId,
        supplierOrderId: input.supplierOrderId,
        checkoutId: input.checkoutId,
        status: input.status,
        kind: input.kind,
        ...(!operator && !input.ownerOrganizationId ? { OR: [
          { ownerOrganizationId: context.organizationId },
          { supplierOrder: { is: { OR: [{ supplierOrganizationId: context.organizationId }, { buyerOrganizationId: context.organizationId }] } } },
        ] } : {}),
      },
      include: { template: true, signatures: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
  }

  async get(documentId: string, context: SupplierActorContext) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId }, include: { template: true, signatures: { orderBy: { createdAt: "asc" } }, supplierOrder: true, shipment: true, previousVersion: true, nextVersions: true } });
    if (!document) throw new NotFoundException("Document not found");
    if (document.ownerOrganizationId !== context.organizationId && document.supplierOrder?.supplierOrganizationId !== context.organizationId && document.supplierOrder?.buyerOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId))) throw new ForbiddenException("Document belongs to another organization");
    return document;
  }

  async generate(input: CreateGeneratedDocumentInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(input.ownerOrganizationId, context);
    const now = new Date();
    const template = await this.prisma.documentTemplate.findFirst({ where: { id: input.templateId, status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] } });
    if (!template) throw new NotFoundException("Active document template not found");
    await this.assertReferences(input.ownerOrganizationId, input.checkoutId, input.supplierOrderId, input.shipmentId);
    const document = await this.prisma.document.create({ data: {
      ownerOrganizationId: input.ownerOrganizationId,
      templateId: template.id,
      checkoutId: input.checkoutId,
      supplierOrderId: input.supplierOrderId,
      shipmentId: input.shipmentId,
      kind: template.kind,
      format: template.format,
      source: "GENERATED",
      status: "GENERATING",
      title: input.title,
      documentNumber: input.documentNumber,
      dataSnapshot: input.data as Prisma.InputJsonValue,
      templateSnapshot: { id: template.id, code: template.code, version: template.version, body: template.templateBody, locale: template.locale, format: template.format },
      requiredSignatureCount: template.requiredSignatureCount,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue,
    } });
    return this.renderAndFinalize(document.id, template.templateBody, input.data, context);
  }

  async upload(input: UploadDocumentInput, context: SupplierActorContext) {
    await this.assertOrganizationAccess(input.ownerOrganizationId, context);
    await this.assertReferences(input.ownerOrganizationId, input.checkoutId, input.supplierOrderId, input.shipmentId);
    const body = this.uploads.decodeBase64(input.contentBase64, 10_000_000);
    const asset = await this.uploads.quarantine({ organizationId: input.ownerOrganizationId, actorId: context.actorId, purpose: "document", fileName: input.fileName, body, allowedKinds: [input.format], maxBytes: 10_000_000 });
    const checksum = asset.checksumSha256;
    const key = asset.storageKey;
    const contentType = asset.detectedMime;
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({ data: {
        ownerOrganizationId: input.ownerOrganizationId,
        checkoutId: input.checkoutId,
        supplierOrderId: input.supplierOrderId,
        shipmentId: input.shipmentId,
        kind: input.kind,
        format: input.format,
        source: "UPLOADED",
        status: input.requiredSignatureCount > 0 ? "AWAITING_SIGNATURE" : "GENERATED",
        title: input.title,
        documentNumber: input.documentNumber,
        storageKey: key,
        fileName: input.fileName,
        contentType,
        byteSize: body.byteLength,
        checksumSha256: checksum,
        requiredSignatureCount: input.requiredSignatureCount,
        immutableAt: new Date(),
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        externalId: input.externalId,
        metadata: input.metadata == null ? Prisma.JsonNull : input.metadata as Prisma.InputJsonValue,
      }, include: { signatures: true } });
      await tx.auditLog.create({ data: { ...context, action: "document.uploaded", entityType: "Document", entityId: document.id, after: { documentNumber: document.documentNumber, version: document.version, kind: document.kind, checksumSha256: checksum } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Document", aggregateId: document.id, eventType: "DocumentUploaded", payload: { documentId: document.id, ownerOrganizationId: document.ownerOrganizationId, kind: document.kind } } });
      await tx.uploadAsset.update({ where: { id: asset.id }, data: { metadata: { documentId: document.id, documentKind: document.kind } } });
      return document;
    });
  }

  async createVersion(documentId: string, input: CreateDocumentVersionInput, context: SupplierActorContext) {
    const current = await this.get(documentId, context);
    if (current.source !== "GENERATED") throw new ConflictException("Only generated documents can be regenerated as a new version");
    const templateId = input.templateId ?? current.templateId;
    if (!templateId) throw new ConflictException("Document template is missing");
    const template = await this.prisma.documentTemplate.findUnique({ where: { id: templateId } });
    if (!template || template.status !== "ACTIVE") throw new NotFoundException("Active document template not found");
    const created = await this.prisma.document.create({ data: {
      ownerOrganizationId: current.ownerOrganizationId,
      templateId: template.id,
      checkoutId: current.checkoutId,
      supplierOrderId: current.supplierOrderId,
      shipmentId: current.shipmentId,
      previousVersionId: current.id,
      kind: template.kind,
      format: template.format,
      source: "GENERATED",
      status: "GENERATING",
      title: current.title,
      documentNumber: current.documentNumber,
      version: current.version + 1,
      dataSnapshot: input.data as Prisma.InputJsonValue,
      templateSnapshot: { id: template.id, code: template.code, version: template.version, body: template.templateBody, locale: template.locale, format: template.format },
      requiredSignatureCount: template.requiredSignatureCount,
      expiresAt: current.expiresAt,
      metadata: { versionReason: input.reason },
    } });
    const updated = await this.renderAndFinalize(created.id, template.templateBody, input.data, context);
    await this.prisma.document.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
    return updated;
  }

  private async renderAndFinalize(documentId: string, templateBody: string, data: Record<string, unknown>, context: SupplierActorContext) {
    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    try {
      const body = await this.renderer.render(document.format, document.title, templateBody, data);
      const checksum = createHash("sha256").update(body).digest("hex");
      const extension = document.format.toLowerCase();
      const key = `documents/${document.ownerOrganizationId}/${new Date().getUTCFullYear()}/${document.id}-v${document.version}.${extension}`;
      const contentType = document.format === "PDF" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      await this.storage.put(key, body, contentType);
      return this.prisma.$transaction(async (tx) => {
        const finalized = await tx.document.update({ where: { id: document.id }, data: {
          status: document.requiredSignatureCount > 0 ? "AWAITING_SIGNATURE" : "GENERATED",
          storageKey: key,
          fileName: `${document.documentNumber}-v${document.version}.${extension}`,
          contentType,
          byteSize: body.byteLength,
          checksumSha256: checksum,
          generatedAt: new Date(),
          immutableAt: new Date(),
          failureReason: null,
        }, include: { template: true, signatures: true } });
        await tx.auditLog.create({ data: { ...context, action: "document.generated", entityType: "Document", entityId: document.id, after: { documentNumber: document.documentNumber, version: document.version, checksumSha256: checksum, byteSize: body.byteLength } } });
        await tx.outboxEvent.create({ data: { aggregateType: "Document", aggregateId: document.id, eventType: "DocumentGenerated", payload: { documentId: document.id, ownerOrganizationId: document.ownerOrganizationId, kind: document.kind, status: finalized.status } } });
        return finalized;
      });
    } catch (error) {
      await this.prisma.document.update({ where: { id: document.id }, data: { status: "FAILED", failureReason: error instanceof Error ? error.message : "Document generation failed" } });
      throw error;
    }
  }

  async createSignatureSession(documentId: string, input: CreateSignatureSessionInput, context: SupplierActorContext) {
    const document = await this.get(documentId, context);
    const operator = await this.isOperator(context.organizationId);
    if (input.signerOrganizationId && input.signerOrganizationId !== context.organizationId && !operator) throw new ForbiddenException("Signer organization must be the active organization");
    if (input.signerUserId && input.signerUserId !== context.actorId && !operator) throw new ForbiddenException("Signer user must be the authenticated user");
    if (!document.checksumSha256 || !document.storageKey) throw new ConflictException("Document content is not ready for signature");
    if (!["GENERATED", "AWAITING_SIGNATURE", "PARTIALLY_SIGNED"].includes(document.status)) throw new ConflictException("Document cannot be signed in its current state");
    const adapter = this.signatures.resolve(input.method);
    const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000);
    const result = await adapter.createSession({ documentId, checksumSha256: document.checksumSha256, method: input.method, signerName: input.signerName, expiresAt });
    const signatureHash = result.status === "SIGNED" ? createHash("sha256").update(`${document.checksumSha256}:${result.externalSessionId}`).digest("hex") : null;
    const signature = await this.prisma.documentSignature.create({ data: {
      documentId,
      signerOrganizationId: input.signerOrganizationId,
      signerUserId: input.signerUserId,
      signerName: input.signerName,
      method: input.method,
      status: result.status,
      externalSessionId: result.externalSessionId,
      signatureHash,
      signedAt: result.status === "SIGNED" ? new Date() : null,
      expiresAt,
      evidence: result.evidence as Prisma.InputJsonValue | undefined,
    } });
    const updatedDocument = result.status === "SIGNED" ? await this.refreshDocumentSignatureStatus(documentId) : await this.prisma.document.update({ where: { id: documentId }, data: { status: "AWAITING_SIGNATURE" } });
    await this.prisma.auditLog.create({ data: { ...context, action: "document.signature_session.created", entityType: "DocumentSignature", entityId: signature.id, after: { documentId, method: input.method, status: signature.status, signerOrganizationId: signature.signerOrganizationId } } });
    return { signature, signingUrl: result.signingUrl, document: updatedDocument };
  }

  async completeSignature(signatureId: string, input: CompleteDocumentSignatureInput, context: SupplierActorContext, trustedExternalCallback = false) {
    const signature = await this.prisma.documentSignature.findUnique({ where: { id: signatureId }, include: { document: { include: { supplierOrder: true } } } });
    if (!signature) throw new NotFoundException("Document signature not found");
    await this.get(signature.documentId, context);
    if (["EDS", "EGOV_QR", "EXTERNAL"].includes(signature.method) && !trustedExternalCallback) throw new ForbiddenException("External signature status is accepted only through a verified gateway callback");
    if (!["PENDING", "SESSION_CREATED"].includes(signature.status)) throw new ConflictException("Signature session is already final");
    if (signature.expiresAt && signature.expiresAt < new Date()) throw new ConflictException("Signature session has expired");
    const updated = await this.prisma.documentSignature.update({ where: { id: signatureId }, data: {
      status: input.status,
      externalSignatureId: input.externalSignatureId,
      signatureHash: input.status === "SIGNED" ? input.signatureHash ?? createHash("sha256").update(`${signature.document.checksumSha256}:${signature.externalSessionId}:${Date.now()}`).digest("hex") : null,
      signedAt: input.status === "SIGNED" ? new Date() : null,
      rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null,
      evidence: input.evidence == null ? Prisma.JsonNull : input.evidence as Prisma.InputJsonValue,
    } });
    const document = input.status === "SIGNED" ? await this.refreshDocumentSignatureStatus(signature.documentId) : await this.prisma.document.update({ where: { id: signature.documentId }, data: { status: input.status === "REJECTED" ? "REJECTED" : "AWAITING_SIGNATURE" } });
    await this.prisma.$transaction([
      this.prisma.auditLog.create({ data: { ...context, action: "document.signature.completed", entityType: "DocumentSignature", entityId: signature.id, before: { status: signature.status }, after: { status: updated.status, documentStatus: document.status } } }),
      this.prisma.outboxEvent.create({ data: { aggregateType: "Document", aggregateId: signature.documentId, eventType: updated.status === "SIGNED" ? "DocumentSigned" : "DocumentSignatureChanged", payload: { documentId: signature.documentId, signatureId: signature.id, signatureStatus: updated.status, documentStatus: document.status, ownerOrganizationId: signature.document.ownerOrganizationId } } }),
    ]);
    return { signature: updated, document };
  }

  private async refreshDocumentSignatureStatus(documentId: string) {
    const document = await this.prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { signatures: true } });
    const signedCount = document.signatures.filter(({ status }) => status === "SIGNED").length;
    const required = Math.max(1, document.requiredSignatureCount);
    return this.prisma.document.update({ where: { id: documentId }, data: { status: signedCount >= required ? "SIGNED" : "PARTIALLY_SIGNED", immutableAt: document.immutableAt ?? new Date() } });
  }

  async archive(documentId: string, context: SupplierActorContext) {
    const document = await this.get(documentId, context);
    if (["GENERATING", "DRAFT"].includes(document.status)) throw new ConflictException("Unfinished document cannot be archived");
    const archived = await this.prisma.document.update({ where: { id: documentId }, data: { status: "ARCHIVED" } });
    await this.prisma.auditLog.create({ data: { ...context, action: "document.archived", entityType: "Document", entityId: document.id, before: { status: document.status }, after: { status: archived.status } } });
    return archived;
  }

  async download(documentId: string, context: SupplierActorContext) {
    const document = await this.get(documentId, context);
    if (!document.storageKey || !document.contentType || !document.fileName) throw new ConflictException("Document file is not ready");
    const signedUrl = await this.storage.signedDownloadUrl(document.storageKey);
    if (signedUrl) return { document, signedUrl, body: null };
    return { document, signedUrl: null, body: await this.storage.get(document.storageKey) };
  }

  capabilities() { return this.signatures.capabilities(); }

  private async assertReferences(ownerOrganizationId: string, checkoutId?: string | null, supplierOrderId?: string | null, shipmentId?: string | null) {
    if (checkoutId && !(await this.prisma.checkout.findUnique({ where: { id: checkoutId }, select: { id: true } }))) throw new BadRequestException("Checkout does not exist");
    if (supplierOrderId) {
      const order = await this.prisma.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { supplierOrganizationId: true, buyerOrganizationId: true, checkoutId: true } });
      if (!order) throw new BadRequestException("Supplier order does not exist");
      if (![order.supplierOrganizationId, order.buyerOrganizationId].includes(ownerOrganizationId)) throw new BadRequestException("Document owner is not a party to the supplier order");
      if (checkoutId && order.checkoutId !== checkoutId) throw new BadRequestException("Supplier order belongs to another checkout");
    }
    if (shipmentId) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, select: { supplierOrderId: true } });
      if (!shipment) throw new BadRequestException("Shipment does not exist");
      if (supplierOrderId && shipment.supplierOrderId !== supplierOrderId) throw new BadRequestException("Shipment belongs to another supplier order");
    }
  }
}
