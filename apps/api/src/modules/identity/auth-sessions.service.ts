import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { SocialExchangeInput } from "@marketplace/schemas";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { environment } from "../../platform/config/environment";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { OidcVerifierService } from "./oidc-verifier.service";
import { OnboardingService } from "../onboarding/onboarding.service";

type RequestMetadata = { ipAddress?: string; userAgent?: string; correlationId?: string };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secureEqual = (left: string, right: string) => {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

@Injectable()
export class AuthSessionsService {
  constructor(private readonly prisma: PrismaService, private readonly oidc: OidcVerifierService, private readonly onboarding: OnboardingService) {}

  private signingKey() {
    const config = environment();
    const key = (config.JWT_PRIVATE_KEY ?? config.JWT_SECRET)?.replaceAll("\\n", "\n");
    if (!key) throw new Error("JWT signing key is not configured");
    return { key, algorithm: config.JWT_PRIVATE_KEY ? "RS256" as const : "HS256" as const };
  }

  private issueAccessToken(userId: string, organizationIds: string[], activeOrganizationId: string | null, authMethods: string[], sessionId: string) {
    const config = environment();
    const signing = this.signingKey();
    return jwt.sign({ organization_ids: organizationIds, organization_id: activeOrganizationId ?? undefined, amr: authMethods }, signing.key, {
      algorithm: signing.algorithm,
      subject: userId,
      issuer: config.JWT_ISSUER ?? "dentmarket-kz",
      audience: config.JWT_AUDIENCE ?? "dentmarket-web",
      expiresIn: config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      jwtid: sessionId,
    });
  }

  private async memberships(userId: string) {
    return this.prisma.organizationMembership.findMany({ where: { userId, status: "ACTIVE", organization: { status: "ACTIVE" } }, select: { organizationId: true, isPrimary: true }, orderBy: { acceptedAt: "asc" } });
  }

  private sessionPayload(session: { id: string; userId: string; organizationIds: string[]; activeOrganizationId: string | null; authMethods: string[]; expiresAt: Date }, refreshToken: string) {
    const config = environment();
    return {
      accessToken: this.issueAccessToken(session.userId, session.organizationIds, session.activeOrganizationId, session.authMethods, session.id),
      accessTokenExpiresIn: config.AUTH_ACCESS_TOKEN_TTL_SECONDS,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
      sessionId: session.id,
      activeOrganizationId: session.activeOrganizationId,
      organizationIds: session.organizationIds,
    };
  }

  private async acceptInvitation(token: string, userId: string, email: string) {
    const invitation = await this.prisma.membershipInvitation.findUnique({ where: { tokenHash: hash(token) }, include: { roles: true } });
    if (!invitation || invitation.email.toLowerCase() !== email || invitation.status !== "PENDING") throw new BadRequestException("Invitation is invalid for this account");
    if (invitation.expiresAt <= new Date()) throw new BadRequestException("Invitation has expired");
    await this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.upsert({
        where: { userId_organizationId: { userId, organizationId: invitation.organizationId } },
        update: { status: "ACTIVE", acceptedAt: new Date(), roles: { createMany: { data: invitation.roles.map(({ roleId }) => ({ roleId })), skipDuplicates: true } } },
        create: { userId, organizationId: invitation.organizationId, status: "ACTIVE", acceptedAt: new Date(), roles: { create: invitation.roles.map(({ roleId }) => ({ roleId })) } },
      });
      await tx.membershipInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: userId, organizationId: invitation.organizationId, action: "membership.social.accepted", entityType: "OrganizationMembership", entityId: membership.id } });
    });
  }

  async exchange(input: SocialExchangeInput, metadata: RequestMetadata) {
    const verified = await this.oidc.verify(input.provider, input.idToken);
    const identity = await this.prisma.externalIdentity.findUnique({ where: { provider_subject: { provider: input.provider, subject: verified.subject } }, include: { user: true } });
    let user = identity?.user;
    if (!user) {
      user = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email: verified.email } });
        const resolved = existing ?? await tx.user.create({ data: { email: verified.email, displayName: verified.displayName, emailVerifiedAt: new Date() } });
        try {
          await tx.externalIdentity.create({ data: { userId: resolved.id, provider: input.provider, subject: verified.subject, email: verified.email, emailVerified: true, profile: verified.profile as Prisma.InputJsonValue, lastLoginAt: new Date() } });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("This social account is already linked");
          throw error;
        }
        await tx.auditLog.create({ data: { actorId: resolved.id, action: existing ? "identity.social.linked" : "identity.social.registered", entityType: "User", entityId: resolved.id, after: { provider: input.provider, email: verified.email } } });
        return resolved;
      });
    } else if (identity?.email.toLowerCase() !== verified.email) {
      throw new UnauthorizedException("Social account email changed; relinking is required");
    }
    if (input.invitationToken) await this.acceptInvitation(input.invitationToken, user.id, verified.email);
    const onboarding = input.registrationToken ? await this.onboarding.claim(input.registrationToken, { id: user.id, email: user.email, displayName: user.displayName }) : null;
    const memberships = await this.memberships(user.id);
    const organizationIds = memberships.map(({ organizationId }) => organizationId);
    const requested = input.organizationId;
    if (requested && !organizationIds.includes(requested)) throw new UnauthorizedException("Requested organization is not available to this account");
    const activeOrganizationId = requested ?? memberships.find(({ isPrimary }) => isPrimary)?.organizationId ?? organizationIds[0] ?? null;
    const refreshToken = randomBytes(48).toString("base64url");
    const config = environment();
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({ data: { userId: user!.id, familyId: randomUUID(), refreshTokenHash: hash(refreshToken), organizationIds, activeOrganizationId, authMethods: [input.provider.toLowerCase()], ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, lastUsedAt: new Date(), expiresAt: new Date(Date.now() + config.AUTH_REFRESH_TOKEN_TTL_DAYS * 86_400_000) } });
      await tx.user.update({ where: { id: user!.id }, data: { lastLoginAt: new Date(), emailVerifiedAt: user!.emailVerifiedAt ?? new Date() } });
      await tx.externalIdentity.update({ where: { provider_subject: { provider: input.provider, subject: verified.subject } }, data: { lastLoginAt: new Date(), profile: verified.profile as Prisma.InputJsonValue } });
      return created;
    });
    return { user: { id: user.id, email: user.email, displayName: user.displayName }, ...(onboarding ? { capability: onboarding.capability, organizationId: onboarding.organizationId, organizationDisplayName: onboarding.organizationDisplayName } : {}), ...this.sessionPayload(session, refreshToken) };
  }

  async rotate(refreshToken: string, metadata: RequestMetadata) {
    const tokenHash = hash(refreshToken);
    const session = await this.prisma.authSession.findFirst({ where: { OR: [{ refreshTokenHash: tokenHash }, { previousTokenHash: tokenHash }] } });
    if (!session) throw new UnauthorizedException("Refresh session is invalid");
    if (session.previousTokenHash && secureEqual(session.previousTokenHash, tokenHash)) {
      await this.prisma.$transaction([this.prisma.authSession.updateMany({ where: { familyId: session.familyId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "refresh_replay" } }), this.prisma.securityEvent.create({ data: { severity: "CRITICAL", type: "auth.refresh_replay", actorId: session.userId, sessionId: session.id, ipAddress: metadata.ipAddress, userAgent: metadata.userAgent, correlationId: metadata.correlationId } })]);
      throw new UnauthorizedException("Refresh token replay detected; session family revoked");
    }
    if (session.status !== "ACTIVE" || session.expiresAt <= new Date()) throw new UnauthorizedException("Refresh session is revoked or expired");
    const memberships = await this.memberships(session.userId);
    const organizationIds = memberships.map(({ organizationId }) => organizationId);
    const activeOrganizationId = session.activeOrganizationId && organizationIds.includes(session.activeOrganizationId) ? session.activeOrganizationId : organizationIds[0] ?? null;
    const next = randomBytes(48).toString("base64url");
    const updated = await this.prisma.authSession.update({ where: { id: session.id }, data: { previousTokenHash: session.refreshTokenHash, refreshTokenHash: hash(next), organizationIds, activeOrganizationId, lastUsedAt: new Date(), ipAddress: metadata.ipAddress, userAgent: metadata.userAgent } });
    return this.sessionPayload(updated, next);
  }

  async list(userId: string) {
    return this.prisma.authSession.findMany({ where: { userId, status: "ACTIVE", expiresAt: { gt: new Date() } }, select: { id: true, activeOrganizationId: true, authMethods: true, ipAddress: true, userAgent: true, lastUsedAt: true, expiresAt: true, createdAt: true }, orderBy: { lastUsedAt: "desc" } });
  }

  async revoke(sessionId: string, userId: string, reason: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId } });
    if (!session) throw new NotFoundException("Session not found");
    return this.prisma.authSession.update({ where: { id: session.id }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: reason } });
  }

  async switchOrganization(sessionId: string, userId: string, organizationId: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, status: "ACTIVE", expiresAt: { gt: new Date() } } });
    if (!session) throw new NotFoundException("Session not found");
    const membership = await this.prisma.organizationMembership.findUnique({ where: { userId_organizationId: { userId, organizationId } } });
    if (membership?.status !== "ACTIVE") throw new UnauthorizedException("Organization membership is not active");
    const updated = await this.prisma.authSession.update({ where: { id: sessionId }, data: { activeOrganizationId: organizationId, lastUsedAt: new Date() } });
    return { activeOrganizationId: organizationId, accessToken: this.issueAccessToken(userId, updated.organizationIds, organizationId, updated.authMethods, updated.id), accessTokenExpiresIn: environment().AUTH_ACCESS_TOKEN_TTL_SECONDS };
  }

  async elevateMfa(sessionId: string, userId: string, organizationId: string) {
    const session = await this.prisma.authSession.findFirst({ where: { id: sessionId, userId, status: "ACTIVE", expiresAt: { gt: new Date() }, organizationIds: { has: organizationId } } });
    if (!session) throw new UnauthorizedException("Authentication session is not available for MFA elevation");
    const authMethods = Array.from(new Set([...session.authMethods, "totp"]));
    const updated = await this.prisma.authSession.update({ where: { id: session.id }, data: { authMethods, activeOrganizationId: organizationId, lastUsedAt: new Date() } });
    return { accessToken: this.issueAccessToken(userId, updated.organizationIds, organizationId, authMethods, updated.id), accessTokenExpiresIn: environment().AUTH_ACCESS_TOKEN_TTL_SECONDS, activeOrganizationId: organizationId, authenticationMethods: authMethods };
  }

  async unlink(userId: string, provider: "GOOGLE" | "APPLE") {
    const identities = await this.prisma.externalIdentity.findMany({ where: { userId } });
    if (identities.length <= 1) throw new ConflictException("The only sign-in method cannot be unlinked");
    const identity = identities.find((item) => item.provider === provider);
    if (!identity) throw new NotFoundException("Social identity not found");
    await this.prisma.$transaction([this.prisma.externalIdentity.delete({ where: { id: identity.id } }), this.prisma.authSession.updateMany({ where: { userId, authMethods: { has: provider.toLowerCase() }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "identity_unlinked" } }), this.prisma.auditLog.create({ data: { actorId: userId, action: "identity.social.unlinked", entityType: "ExternalIdentity", entityId: identity.id, before: { provider } } })]);
    return { unlinked: true, provider };
  }
}
