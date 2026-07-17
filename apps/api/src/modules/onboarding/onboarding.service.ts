import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateRegistrationIntentInput } from "@marketplace/schemas";
import { Prisma, type OrganizationCapabilityType } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../../platform/prisma/prisma.service";

const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");

const ownerPermissions: Record<"BUYER" | "SUPPLIER", string[]> = {
  BUYER: [
    "organization.view", "organization.members.manage", "organization.roles.manage",
    "catalog.product.view", "order.create", "order.approve", "document.view", "document.sign",
    "notification.view", "support.ticket.create", "support.ticket.view", "budget.view", "budget.manage",
    "billing.view", "ai.use", "trust.incident.view", "trust.incident.appeal", "trust.comment.view",
    "trust.comment.manage", "trust.review.view", "trust.review.create", "trust.rating.view", "geo.view",
    "geo.manage", "recommendation.use",
  ],
  SUPPLIER: [
    "organization.view", "organization.members.manage", "organization.roles.manage", "supplier.profile.manage",
    "supplier.warehouse.manage", "catalog.product.view", "catalog.product.create", "catalog.offer.edit",
    "catalog.offer.publish", "pricing.manage", "matching.manage", "inventory.view", "inventory.adjust", "inventory.freshness.manage", "order.confirm",
    "document.view", "document.manage", "document.sign", "compliance.view", "compliance.credential.manage",
    "import.manage", "integration.view", "integration.manage", "integration.reconcile", "delivery.view", "delivery.manage", "shipment.manage",
    "payment.view", "payment.merchant.manage",
    "promotion.view", "promotion.manage", "support.ticket.create", "support.ticket.view", "billing.view", "ai.use",
    "trust.incident.view", "trust.incident.appeal", "trust.comment.view", "trust.comment.manage",
    "trust.review.view", "trust.review.respond", "trust.rating.view", "trust.rating.appeal", "geo.view", "geo.manage",
  ],
};

type VerifiedRegistrationUser = { id: string; email: string; displayName: string };

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async createIntent(input: CreateRegistrationIntentInput) {
    const now = new Date();
    const replay = await this.prisma.registrationIntent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (replay) {
      if (replay.email !== input.email || replay.bin !== input.bin || replay.capability !== input.capability) throw new ConflictException("Idempotency key already belongs to another registration.");
      if (replay.status !== "PENDING" || replay.expiresAt <= now) return { registration: this.presentation(replay), registrationToken: null, replayed: true };
      const registrationToken = randomBytes(48).toString("base64url");
      const rotated = await this.prisma.registrationIntent.update({ where: { id: replay.id }, data: { tokenHash: hashToken(registrationToken), expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) } });
      return { registration: this.presentation(rotated), registrationToken, replayed: true };
    }
    const existingOrganization = await this.prisma.organization.findUnique({ where: { bin: input.bin } });
    if (existingOrganization) throw new ConflictException("Организация с этим БИН уже зарегистрирована. Войдите или запросите приглашение у владельца.");
    const active = await this.prisma.registrationIntent.findFirst({ where: { OR: [{ email: input.email }, { bin: input.bin }], status: "PENDING", expiresAt: { gt: now } } });
    if (active) throw new ConflictException("Заявка для этого email или БИН уже ожидает завершения входа.");
    const registrationToken = randomBytes(48).toString("base64url");
    try {
      const registration = await this.prisma.registrationIntent.create({ data: {
        email: input.email,
        ownerDisplayName: input.ownerDisplayName,
        legalName: input.legalName,
        organizationDisplayName: input.organizationDisplayName,
        bin: input.bin,
        capability: input.capability,
        tokenHash: hashToken(registrationToken),
        idempotencyKey: input.idempotencyKey,
        consentVersion: input.consentVersion,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        marketingConsent: input.marketingConsent,
        source: input.source,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      } });
      return { registration: this.presentation(registration), registrationToken, replayed: false };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Регистрация уже была создана.");
      throw error;
    }
  }

  async claim(registrationToken: string, user: VerifiedRegistrationUser) {
    const registration = await this.prisma.registrationIntent.findUnique({ where: { tokenHash: hashToken(registrationToken) } });
    if (!registration) throw new NotFoundException("Заявка на регистрацию не найдена.");
    if (registration.status === "CLAIMED") {
      if (registration.claimedByUserId !== user.id) throw new ConflictException("Заявка уже завершена другим аккаунтом.");
      return { registration: this.presentation(registration), actorId: user.id, displayName: user.displayName, organizationDisplayName: registration.organizationDisplayName, organizationId: registration.organizationId!, capability: registration.capability };
    }
    if (registration.status !== "PENDING") throw new ConflictException("Заявка больше не активна.");
    if (registration.expiresAt <= new Date()) {
      await this.prisma.registrationIntent.update({ where: { id: registration.id }, data: { status: "EXPIRED" } });
      throw new BadRequestException("Срок заявки истёк. Заполните форму ещё раз.");
    }
    if (registration.email !== user.email.toLowerCase()) throw new BadRequestException("Войдите с email, указанным в заявке.");
    const permissionCodes = ownerPermissions[registration.capability as "BUYER" | "SUPPLIER"];
    const permissionCount = await this.prisma.permission.count({ where: { code: { in: permissionCodes } } });
    if (permissionCount !== permissionCodes.length) throw new ConflictException("Каталог прав платформы не готов к onboarding.");
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.registrationIntent.updateMany({ where: { id: registration.id, status: "PENDING", organizationId: null }, data: { status: "CLAIMED", claimedAt: now, claimedByUserId: user.id } });
      if (!claimed.count) throw new ConflictException("Заявка уже обрабатывается.");
      const organization = await tx.organization.create({ data: {
        legalName: registration.legalName,
        displayName: registration.organizationDisplayName,
        bin: registration.bin,
        capabilities: { create: { capability: registration.capability as OrganizationCapabilityType } },
      } });
      if (registration.capability === "SUPPLIER") await tx.supplierProfile.create({ data: { organizationId: organization.id, regulatoryDetails: { onboarding: "documents_required" } } });
      const role = await tx.role.create({ data: {
        organizationId: organization.id,
        code: registration.capability === "SUPPLIER" ? "supplier_owner" : "buyer_owner",
        name: "Владелец организации",
        isSystem: true,
        permissions: { create: permissionCodes.map((code) => ({ permission: { connect: { code } } })) },
      } });
      const membership = await tx.organizationMembership.create({ data: {
        userId: user.id,
        organizationId: organization.id,
        status: "ACTIVE",
        acceptedAt: now,
        isPrimary: true,
        title: "Владелец",
        roles: { create: { roleId: role.id } },
      } });
      await tx.registrationIntent.update({ where: { id: registration.id }, data: { organizationId: organization.id } });
      const pilot = await tx.billingPlan.findUnique({ where: { code: "pilot" } });
      if (pilot) await tx.organizationSubscription.create({ data: { organizationId: organization.id, planId: pilot.id, status: "TRIAL", trialEndsAt: new Date(now.getTime() + pilot.trialDays * 86_400_000), currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + Math.max(1, pilot.trialDays) * 86_400_000), metadata: { source: "self_registration", billingEnforced: false } } });
      await tx.auditLog.create({ data: { actorId: user.id, organizationId: organization.id, action: "onboarding.registration.completed", entityType: "OrganizationMembership", entityId: membership.id, after: { registrationId: registration.id, capability: registration.capability, consentVersion: registration.consentVersion } } });
      await tx.outboxEvent.create({ data: { aggregateType: "Organization", aggregateId: organization.id, eventType: "OrganizationSelfRegistered", payload: { organizationId: organization.id, ownerUserId: user.id, capability: registration.capability } } });
      return { registration: { ...this.presentation(registration), status: "CLAIMED", organizationId: organization.id }, actorId: user.id, displayName: user.displayName, organizationDisplayName: organization.displayName, organizationId: organization.id, capability: registration.capability };
    }, { maxWait: 15_000, timeout: 45_000 });
  }

  async completeDevelopment(registrationToken: string) {
    const registration = await this.prisma.registrationIntent.findUnique({ where: { tokenHash: hashToken(registrationToken) } });
    if (!registration) throw new NotFoundException("Заявка на регистрацию не найдена.");
    const user = await this.prisma.user.upsert({ where: { email: registration.email }, update: { displayName: registration.ownerDisplayName, emailVerifiedAt: new Date() }, create: { email: registration.email, displayName: registration.ownerDisplayName, emailVerifiedAt: new Date() } });
    return this.claim(registrationToken, user);
  }

  async supplierProgress(actorId: string, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({ where: { userId_organizationId: { userId: actorId, organizationId } } });
    if (membership?.status !== "ACTIVE") throw new NotFoundException("Supplier onboarding was not found");
    const organization = await this.prisma.organization.findFirst({ where: { id: organizationId, status: "ACTIVE", capabilities: { some: { capability: "SUPPLIER" } } }, select: { id: true, legalName: true, displayName: true, bin: true } });
    if (!organization) throw new NotFoundException("Supplier onboarding was not found");
    const [profile, credentials, warehouses, sources, offers, agreement] = await Promise.all([
      this.prisma.supplierProfile.findUnique({ where: { organizationId } }),
      this.prisma.organizationCredential.count({ where: { organizationId, status: "VERIFIED" } }),
      this.prisma.warehouse.count({ where: { supplierOrganizationId: organizationId, status: "ACTIVE" } }),
      this.prisma.supplierDataSource.count({ where: { supplierOrganizationId: organizationId, status: "ACTIVE" } }),
      this.prisma.supplierOffer.count({ where: { supplierOrganizationId: organizationId } }),
      this.prisma.marketplaceAgreement.findFirst({ where: { supplierOrganizationId: organizationId, status: { in: ["AWAITING_SIGNATURE", "ACTIVE", "NON_RENEWING"] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, endsAt: true } }),
    ]);
    const profileComplete = Boolean(profile && profile.regulatoryDetails && Object.keys(profile.regulatoryDetails as object).some((key) => key !== "onboarding"));
    const steps = [
      { id: "organization", label: "Организация и БИН", complete: true, action: "Проверить реквизиты" },
      { id: "profile", label: "Профиль поставщика", complete: profileComplete, action: "Заполнить профиль" },
      { id: "credentials", label: "Разрешительные документы", complete: credentials > 0, action: "Загрузить документы" },
      { id: "warehouse", label: "Склад и география", complete: warehouses > 0, action: "Добавить склад" },
      { id: "source", label: "Источник данных", complete: sources > 0, action: "Выбрать 1С, МойСклад, Excel или ручной ввод" },
      { id: "catalog", label: "Первое предложение", complete: offers > 0, action: "Добавить ассортимент" },
      { id: "agreement", label: "Договор с двумя ЭЦП", complete: agreement?.status === "ACTIVE" || agreement?.status === "NON_RENEWING", action: agreement?.status === "AWAITING_SIGNATURE" ? "Завершить подписание" : "Оформить договор" },
    ];
    const completed = steps.filter(({ complete }) => complete).length;
    return { organization, status: completed === steps.length ? "READY" : agreement?.status === "AWAITING_SIGNATURE" ? "AGREEMENT_PENDING" : "IN_PROGRESS", completedSteps: completed, totalSteps: steps.length, progressPercent: Math.round(completed / steps.length * 100), nextStep: steps.find(({ complete }) => !complete) ?? null, steps, agreement };
  }

  private presentation(registration: { id: string; email: string; capability: OrganizationCapabilityType; status: string; expiresAt: Date; organizationId: string | null; createdAt: Date }) {
    return { id: registration.id, email: registration.email, capability: registration.capability, status: registration.status, expiresAt: registration.expiresAt, organizationId: registration.organizationId, createdAt: registration.createdAt };
  }
}
