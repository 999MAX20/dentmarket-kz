import { ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { MfaCodeInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SecurityCryptoService } from "../../platform/security/security-crypto.service";
import { generateRecoveryCodes, generateTotpSecret, verifyTotp } from "../../platform/security/totp";

type ActorContext = { actorId: string; organizationId: string };

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: SecurityCryptoService) {}

  async status(context: ActorContext) {
    await this.requireUser(context.actorId);
    const factor = await this.prisma.userMfaFactor.findUnique({ where: { userId: context.actorId } });
    return { enabled: factor?.status === "ACTIVE", status: factor?.status ?? "NOT_ENROLLED", verifiedAt: factor?.verifiedAt ?? null, lastUsedAt: factor?.lastUsedAt ?? null, recoveryCodesRemaining: factor?.recoveryCodeHashes.length ?? 0, lockedUntil: factor?.lockedUntil ?? null };
  }

  async enroll(context: ActorContext) {
    const user = await this.requireUser(context.actorId);
    const current = await this.prisma.userMfaFactor.findUnique({ where: { userId: user.id } });
    if (current?.status === "ACTIVE") throw new ConflictException("Active MFA must be disabled before re-enrollment");
    const secret = generateTotpSecret();
    const recoveryCodes = generateRecoveryCodes();
    const encryptedSecret = this.crypto.encrypt(secret);
    const recoveryCodeHashes = recoveryCodes.map((code) => this.recoveryHash(user.id, code));
    const factor = await this.prisma.userMfaFactor.upsert({ where: { userId: user.id }, update: { status: "PENDING", encryptedSecret, recoveryCodeHashes, verifiedAt: null, lastUsedAt: null, failedAttempts: 0, lockedUntil: null }, create: { userId: user.id, encryptedSecret, recoveryCodeHashes } });
    await this.audit(context, "identity.mfa.enrollment.started", factor.id, { status: factor.status });
    const issuer = encodeURIComponent(process.env.MFA_ISSUER ?? "DentMarket KZ");
    const label = encodeURIComponent(`${process.env.MFA_ISSUER ?? "DentMarket KZ"}:${user.email}`);
    return { factorId: factor.id, secret, recoveryCodes, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` };
  }

  async verifyEnrollment(input: MfaCodeInput, context: ActorContext) {
    const factor = await this.requireFactor(context.actorId, "PENDING");
    if (!verifyTotp(this.crypto.decrypt(factor.encryptedSecret), input.code)) throw new UnauthorizedException("Invalid TOTP code");
    const updated = await this.prisma.userMfaFactor.update({ where: { id: factor.id }, data: { status: "ACTIVE", verifiedAt: new Date(), lastUsedAt: new Date(), failedAttempts: 0, lockedUntil: null } });
    await this.audit(context, "identity.mfa.enabled", factor.id, { status: updated.status });
    return { enabled: true, verifiedAt: updated.verifiedAt, recoveryCodesRemaining: updated.recoveryCodeHashes.length };
  }

  async challenge(input: MfaCodeInput, context: ActorContext) {
    const factor = await this.requireFactor(context.actorId, "ACTIVE");
    if (factor.lockedUntil && factor.lockedUntil > new Date()) throw new HttpException("MFA factor is temporarily locked", HttpStatus.TOO_MANY_REQUESTS);
    const normalized = input.code.toUpperCase();
    const recoveryHash = this.recoveryHash(context.actorId, normalized);
    const recoveryIndex = factor.recoveryCodeHashes.indexOf(recoveryHash);
    const totpValid = recoveryIndex < 0 && verifyTotp(this.crypto.decrypt(factor.encryptedSecret), normalized);
    if (!totpValid && recoveryIndex < 0) {
      const nextFailures = factor.failedAttempts + 1;
      await this.prisma.userMfaFactor.update({ where: { id: factor.id }, data: { failedAttempts: nextFailures, lockedUntil: nextFailures >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
      throw new UnauthorizedException("Invalid MFA code");
    }
    const hashes = recoveryIndex >= 0 ? factor.recoveryCodeHashes.filter((_, index) => index !== recoveryIndex) : factor.recoveryCodeHashes;
    await this.prisma.userMfaFactor.update({ where: { id: factor.id }, data: { recoveryCodeHashes: hashes, failedAttempts: 0, lockedUntil: null, lastUsedAt: new Date() } });
    await this.audit(context, "identity.mfa.challenge.succeeded", factor.id, { method: recoveryIndex >= 0 ? "RECOVERY_CODE" : "TOTP" });
    return { verified: true, method: recoveryIndex >= 0 ? "RECOVERY_CODE" : "TOTP", challengeId: randomUUID(), recoveryCodesRemaining: hashes.length };
  }

  async disable(input: MfaCodeInput, context: ActorContext) {
    await this.challenge(input, context);
    const factor = await this.prisma.userMfaFactor.update({ where: { userId: context.actorId }, data: { status: "REVOKED", recoveryCodeHashes: [], lockedUntil: null } });
    await this.audit(context, "identity.mfa.disabled", factor.id, { status: factor.status });
    return { enabled: false };
  }

  private async requireUser(userId: string) {
    if (!userId) throw new UnauthorizedException("Missing actor identity");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "ACTIVE") throw new UnauthorizedException("Active user not found");
    return user;
  }

  private async requireFactor(userId: string, status: "PENDING" | "ACTIVE") {
    await this.requireUser(userId);
    const factor = await this.prisma.userMfaFactor.findUnique({ where: { userId } });
    if (!factor || factor.status !== status) throw new NotFoundException(`${status === "ACTIVE" ? "Active" : "Pending"} MFA factor not found`);
    return factor;
  }

  private recoveryHash(userId: string, code: string) { return createHash("sha256").update(`${userId}:${code.toUpperCase()}`).digest("hex"); }

  private audit(context: ActorContext, action: string, entityId: string, after: Record<string, unknown>) {
    return this.prisma.auditLog.create({ data: { ...context, action, entityType: "UserMfaFactor", entityId, after: after as Prisma.InputJsonValue } });
  }
}
