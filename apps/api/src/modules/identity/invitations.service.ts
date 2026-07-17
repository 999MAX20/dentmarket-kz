import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { AcceptInvitationInput, CreateInvitationInput } from "@marketplace/schemas";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../platform/prisma/prisma.service";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

@Injectable()
export class InvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, input: CreateInvitationInput) {
    const organization = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!organization) throw new NotFoundException("Organization not found");

    if (input.roleIds.length > 0) {
      const validRoles = await this.prisma.role.count({
        where: { id: { in: input.roleIds }, OR: [{ organizationId }, { organizationId: null }] },
      });
      if (validRoles !== input.roleIds.length) throw new BadRequestException("One or more roles are not available to this organization");
    }

    const token = randomBytes(32).toString("base64url");
    const invitation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.membershipInvitation.create({
        data: {
          organizationId,
          email: input.email,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000),
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
        },
        include: { roles: true },
      });
      await tx.auditLog.create({
        data: { organizationId, action: "membership.invited", entityType: "MembershipInvitation", entityId: created.id, after: { email: created.email, roleIds: input.roleIds } },
      });
      await tx.outboxEvent.create({
        data: { aggregateType: "MembershipInvitation", aggregateId: created.id, eventType: "MembershipInvited", payload: { invitationId: created.id, organizationId } },
      });
      return created;
    });

    return { invitationId: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt, token };
  }

  async accept(input: AcceptInvitationInput) {
    const tokenHash = hashToken(input.token);
    const invitation = await this.prisma.membershipInvitation.findUnique({
      where: { tokenHash },
      include: { roles: true },
    });
    if (!invitation) throw new NotFoundException("Invitation not found");
    if (invitation.status !== "PENDING") throw new BadRequestException("Invitation is no longer active");
    if (invitation.expiresAt <= new Date()) {
      await this.prisma.membershipInvitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
      throw new BadRequestException("Invitation has expired");
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: invitation.email },
        update: { displayName: input.displayName },
        create: { email: invitation.email, displayName: input.displayName },
      });
      const membership = await tx.organizationMembership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: invitation.organizationId } },
        update: {
          status: "ACTIVE",
          acceptedAt: new Date(),
          roles: { createMany: { data: invitation.roles.map(({ roleId }) => ({ roleId })), skipDuplicates: true } },
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          status: "ACTIVE",
          acceptedAt: new Date(),
          roles: { create: invitation.roles.map(({ roleId }) => ({ roleId })) },
        },
        include: { roles: true },
      });
      await tx.membershipInvitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
      await tx.auditLog.create({
        data: { actorId: user.id, organizationId: invitation.organizationId, action: "membership.accepted", entityType: "OrganizationMembership", entityId: membership.id, after: { userId: user.id } },
      });
      await tx.outboxEvent.create({
        data: { aggregateType: "OrganizationMembership", aggregateId: membership.id, eventType: "MembershipAccepted", payload: { membershipId: membership.id, userId: user.id } },
      });
      return { user, membership };
    });
  }
}
