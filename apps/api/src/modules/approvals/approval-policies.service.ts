import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateApprovalPolicyInput, EvaluateApprovalInput, UpdateApprovalPolicyInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { evaluateApprovalPolicies } from "./approval-policy.evaluator";

type ActorContext = { actorId: string; organizationId: string };

@Injectable()
export class ApprovalPoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  private assertOrganization(organizationId: string, context: ActorContext) {
    if (organizationId !== context.organizationId) throw new ForbiddenException("Active organization does not match route organization");
  }

  private async ensureRoleCodes(organizationId: string, roleCodes: string[]) {
    const uniqueCodes = [...new Set(roleCodes)];
    const count = await this.prisma.role.count({ where: { organizationId, code: { in: uniqueCodes } } });
    if (count !== uniqueCodes.length) throw new BadRequestException("Every approver role code must exist in the organization");
  }

  list(organizationId: string, context: ActorContext) {
    this.assertOrganization(organizationId, context);
    return this.prisma.approvalPolicy.findMany({ where: { organizationId }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  }

  async create(organizationId: string, input: CreateApprovalPolicyInput, context: ActorContext) {
    this.assertOrganization(organizationId, context);
    await this.ensureRoleCodes(organizationId, input.approvalSteps.flatMap((step) => step.approverRoleCodes));
    return this.prisma.$transaction(async (tx) => {
      const policy = await tx.approvalPolicy.create({
        data: {
          organizationId,
          name: input.name,
          priority: input.priority,
          status: input.status,
          conditions: input.conditions as Prisma.InputJsonValue,
          approvalSteps: input.approvalSteps as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({ data: { ...context, action: "approval.policy.created", entityType: "ApprovalPolicy", entityId: policy.id, after: policy } });
      await tx.outboxEvent.create({ data: { aggregateType: "ApprovalPolicy", aggregateId: policy.id, eventType: "ApprovalPolicyCreated", payload: { organizationId, policyId: policy.id } } });
      return policy;
    });
  }

  async update(organizationId: string, policyId: string, input: UpdateApprovalPolicyInput, context: ActorContext) {
    this.assertOrganization(organizationId, context);
    if (input.approvalSteps) await this.ensureRoleCodes(organizationId, input.approvalSteps.flatMap((step) => step.approverRoleCodes));
    const current = await this.prisma.approvalPolicy.findFirst({ where: { id: policyId, organizationId } });
    if (!current) throw new NotFoundException("Approval policy not found");

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.approvalPolicy.updateMany({
        where: { id: policyId, organizationId, version: input.version },
        data: {
          name: input.name,
          priority: input.priority,
          status: input.status,
          conditions: input.conditions as Prisma.InputJsonValue | undefined,
          approvalSteps: input.approvalSteps as Prisma.InputJsonValue | undefined,
          version: { increment: 1 },
        },
      });
      if (result.count === 0) throw new ConflictException("Approval policy changed; reload the latest version");
      const policy = await tx.approvalPolicy.findUniqueOrThrow({ where: { id: policyId } });
      await tx.auditLog.create({ data: { ...context, action: "approval.policy.updated", entityType: "ApprovalPolicy", entityId: policy.id, before: current, after: policy } });
      await tx.outboxEvent.create({ data: { aggregateType: "ApprovalPolicy", aggregateId: policy.id, eventType: "ApprovalPolicyUpdated", payload: { organizationId, policyId: policy.id, version: policy.version } } });
      return policy;
    });
  }

  async evaluate(organizationId: string, request: EvaluateApprovalInput, context: ActorContext) {
    this.assertOrganization(organizationId, context);
    const policies = await this.prisma.approvalPolicy.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: [{ priority: "asc" }, { id: "asc" }],
    });
    return evaluateApprovalPolicies(policies, request);
  }
}
