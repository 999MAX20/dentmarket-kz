import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateRoleInput, UpdateMembershipInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";

@Injectable()
export class RoleManagementService {
  constructor(private readonly prisma: PrismaService) {}

  listRoles(organizationId: string) {
    return this.prisma.role.findMany({
      where: { OR: [{ organizationId }, { organizationId: null }] },
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
  }

  async createRole(organizationId: string, actorId: string, input: CreateRoleInput) {
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: input.permissionCodes } }, select: { id: true, code: true } });
    if (permissions.length !== new Set(input.permissionCodes).size) throw new BadRequestException("One or more permissions do not exist");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { organizationId, code: input.code, name: input.name, permissions: { create: permissions.map(({ id }) => ({ permissionId: id })) } },
          include: { permissions: { include: { permission: true } } },
        });
        await tx.auditLog.create({ data: { actorId, organizationId, action: "access.role.created", entityType: "Role", entityId: role.id, after: { code: role.code, permissionCodes: input.permissionCodes } } });
        await tx.outboxEvent.create({ data: { aggregateType: "Role", aggregateId: role.id, eventType: "RoleCreated", payload: { roleId: role.id, organizationId } } });
        return role;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Role code already exists in this organization");
      throw error;
    }
  }

  listMemberships(organizationId: string) {
    return this.prisma.organizationMembership.findMany({
      where: { organizationId },
      include: { user: true, roles: { include: { role: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateMembership(organizationId: string, membershipId: string, actorId: string, input: UpdateMembershipInput) {
    const current = await this.prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId } });
    if (!current) throw new NotFoundException("Membership not found");
    if (current.userId === actorId && input.status && input.status !== "ACTIVE") throw new BadRequestException("An actor cannot block or revoke their own active membership");
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.update({
        where: { id: membershipId },
        data: { title: input.title, status: input.status, blockedAt: input.status === "BLOCKED" ? new Date() : input.status === "ACTIVE" ? null : undefined },
        include: { user: true, roles: { include: { role: true } } },
      });
      await tx.auditLog.create({ data: { actorId, organizationId, action: "membership.updated", entityType: "OrganizationMembership", entityId: membership.id, before: current, after: membership } });
      await tx.outboxEvent.create({ data: { aggregateType: "OrganizationMembership", aggregateId: membership.id, eventType: "MembershipUpdated", payload: { membershipId: membership.id, status: membership.status } } });
      return membership;
    });
  }

  async assignRole(organizationId: string, membershipId: string, roleId: string, actorId: string) {
    const [membership, role] = await Promise.all([
      this.prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId } }),
      this.prisma.role.findFirst({ where: { id: roleId, OR: [{ organizationId }, { organizationId: null }] } }),
    ]);
    if (!membership) throw new NotFoundException("Membership not found");
    if (!role) throw new NotFoundException("Role not found");
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.membershipRole.upsert({ where: { membershipId_roleId: { membershipId, roleId } }, update: {}, create: { membershipId, roleId } });
      await tx.auditLog.create({ data: { actorId, organizationId, action: "membership.role.assigned", entityType: "OrganizationMembership", entityId: membershipId, after: { roleId } } });
      await tx.outboxEvent.create({ data: { aggregateType: "OrganizationMembership", aggregateId: membershipId, eventType: "MembershipRoleAssigned", payload: { membershipId, roleId } } });
      return assignment;
    });
  }

  async removeRole(organizationId: string, membershipId: string, roleId: string, actorId: string) {
    const assignment = await this.prisma.membershipRole.findUnique({ where: { membershipId_roleId: { membershipId, roleId } }, include: { membership: true } });
    if (!assignment || assignment.membership.organizationId !== organizationId) throw new NotFoundException("Role assignment not found");
    const roleCount = await this.prisma.membershipRole.count({ where: { membershipId } });
    if (assignment.membership.userId === actorId && roleCount === 1) throw new BadRequestException("An actor cannot remove their last role");
    return this.prisma.$transaction(async (tx) => {
      await tx.membershipRole.delete({ where: { membershipId_roleId: { membershipId, roleId } } });
      await tx.auditLog.create({ data: { actorId, organizationId, action: "membership.role.removed", entityType: "OrganizationMembership", entityId: membershipId, before: { roleId } } });
      await tx.outboxEvent.create({ data: { aggregateType: "OrganizationMembership", aggregateId: membershipId, eventType: "MembershipRoleRemoved", payload: { membershipId, roleId } } });
      return { membershipId, roleId, removed: true };
    });
  }
}
