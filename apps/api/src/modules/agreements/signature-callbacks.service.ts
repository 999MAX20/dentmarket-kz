import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { z } from "zod";
import { signatureGatewayCallbackSchema } from "@marketplace/schemas";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { environment } from "../../platform/config/environment";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { DocumentsService } from "../documents/documents.service";
import { MarketplaceAgreementsService } from "./marketplace-agreements.service";
import { BuyerSupplierAgreementsService } from "../buyer-supplier-agreements/buyer-supplier-agreements.service";

type CallbackInput = z.infer<typeof signatureGatewayCallbackSchema>;

export function verifySignatureCallbackEnvelope(input: { rawBody: Buffer; eventId: string; timestamp: string; signature: string; secret: string; toleranceSeconds: number; now?: number }) {
  if (!/^\d{10,13}$/.test(input.timestamp)) throw new UnauthorizedException("Signature callback timestamp is invalid");
  const milliseconds = input.timestamp.length === 13 ? Number(input.timestamp) : Number(input.timestamp) * 1_000;
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(milliseconds) || Math.abs(now - milliseconds) > input.toleranceSeconds * 1_000) throw new UnauthorizedException("Signature callback timestamp is outside the allowed window");
  if (!/^[A-Za-z0-9_.:-]{8,240}$/.test(input.eventId)) throw new UnauthorizedException("Signature callback event ID is invalid");
  const expected = createHmac("sha256", input.secret).update(`${input.timestamp}.`).update(input.rawBody).digest("hex");
  const provided = input.signature.replace(/^sha256=/i, "").toLowerCase();
  const left = Buffer.from(expected); const right = Buffer.from(provided);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new UnauthorizedException("Signature callback HMAC is invalid");
  return { payloadHash: createHash("sha256").update(input.rawBody).digest("hex"), expiresAt: new Date(now + 24 * 60 * 60_000) };
}

@Injectable()
export class SignatureCallbacksService {
  constructor(private readonly prisma: PrismaService, private readonly documents: DocumentsService, private readonly agreements: MarketplaceAgreementsService, private readonly buyerSupplierAgreements: BuyerSupplierAgreementsService) {}

  private verify(rawBody: Buffer, eventId: string, timestamp: string, signature: string) {
    const config = environment();
    if (!config.SIGNATURE_CALLBACK_SECRET) throw new ServiceUnavailableException("Signature callback secret is not configured");
    return verifySignatureCallbackEnvelope({ rawBody, eventId, timestamp, signature, secret: config.SIGNATURE_CALLBACK_SECRET, toleranceSeconds: config.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS });
  }

  async process(input: CallbackInput, rawBody: Buffer, headers: { eventId: string; timestamp: string; signature: string }) {
    const verified = this.verify(rawBody, headers.eventId, headers.timestamp, headers.signature);
    try {
      await this.prisma.idempotencyRecord.create({ data: { scope: "signature-gateway-callback", key: headers.eventId, requestHash: verified.payloadHash, expiresAt: verified.expiresAt } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        await this.prisma.securityEvent.create({ data: { severity: "HIGH", type: "signature.callback.replay", fingerprint: headers.eventId, metadata: { payloadHash: verified.payloadHash } } });
        throw new ConflictException("Signature callback replay was rejected");
      }
      throw error;
    }
    const signature = await this.prisma.documentSignature.findUnique({ where: { id: input.signatureId }, include: { document: { include: { marketplaceAgreement: true, buyerSupplierAgreement: true } }, signerOrganization: true } });
    if (!signature || signature.method !== "EDS") throw new NotFoundException("EDS signature session not found");
    if (signature.externalSessionId !== input.externalSessionId) throw new UnauthorizedException("Signature callback session does not match");
    if (signature.document.checksumSha256?.toLowerCase() !== input.signedDocumentChecksum.toLowerCase()) throw new UnauthorizedException("Signed document checksum does not match the immutable document");
    if (!signature.signerOrganization || signature.signerOrganization.bin !== input.certificate.subjectBin) throw new UnauthorizedException("EDS certificate BIN does not match the signer organization");
    const now = new Date();
    const certificateValidFrom = new Date(input.certificate.validFrom); const certificateValidTo = new Date(input.certificate.validTo);
    if (certificateValidFrom > now || certificateValidTo <= now) throw new UnauthorizedException("EDS certificate is outside its validity period");
    if (input.status === "SIGNED" && !input.externalSignatureId) throw new UnauthorizedException("External signature ID is required for a signed callback");
    const context = { actorId: signature.signerUserId ?? signature.signerOrganizationId!, organizationId: signature.signerOrganizationId! };
    const result = await this.documents.completeSignature(signature.id, { status: input.status, externalSignatureId: input.externalSignatureId, signatureHash: input.signatureHash, rejectionReason: input.rejectionReason, evidence: { ...input.evidence, gatewayEventId: headers.eventId, certificate: input.certificate, payloadHash: verified.payloadHash } }, context, true);
    if (signature.document.marketplaceAgreement) await this.agreements.reconcile(signature.document.marketplaceAgreement.id);
    if (signature.document.buyerSupplierAgreement) await this.buyerSupplierAgreements.reconcile(signature.document.buyerSupplierAgreement.id);
    await this.prisma.securityEvent.create({ data: { severity: "INFO", type: "signature.callback.verified", actorId: context.actorId, organizationId: context.organizationId, sessionId: signature.id, fingerprint: headers.eventId, metadata: { documentId: signature.documentId, status: input.status, certificateSerial: input.certificate.serialNumber } } });
    return { accepted: true, signature: result.signature, document: result.document };
  }
}
