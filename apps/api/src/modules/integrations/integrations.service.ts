import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateIntegrationBindingInput, CreateIntegrationConnectionInput, ReconciliationQueryInput, ResolveReconciliationInput, UpdateIntegrationConnectionInput, UpsertIntegrationMappingInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SupplierAccessService, type SupplierActorContext } from "../suppliers/supplier-access.service";
import { IntegrationCryptoService } from "./integration-crypto.service";

const connectionSelect = Prisma.validator<Prisma.IntegrationConnectionSelect>()({
  id: true,
  supplierOrganizationId: true,
  sourceId: true,
  provider: true,
  mode: true,
  status: true,
  displayName: true,
  credentialKeyVersion: true,
  configuration: true,
  capabilities: true,
  externalAccountId: true,
  webhookEndpointId: true,
  lastHeartbeatAt: true,
  lastSuccessAt: true,
  lastErrorAt: true,
  lastError: true,
  consecutiveFailures: true,
  nextSyncAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  bindings: { orderBy: [{ dataType: "asc" }, { priority: "asc" }] },
  mappings: { orderBy: [{ entityType: "asc" }, { externalId: "asc" }], take: 500 },
  agent: { select: { id: true, agentId: true, status: true, version: true, minimumSupportedVersion: true, capabilities: true, lastHeartbeatAt: true, lastIpAddress: true, lastError: true, createdAt: true, updatedAt: true } },
  _count: { select: { jobs: true, webhookEvents: true, reconciliationEntries: true, externalReservations: true } },
});

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SupplierAccessService,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  async list(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    return this.prisma.integrationConnection.findMany({ where: { supplierOrganizationId }, select: connectionSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  }

  async onboardingReadiness(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const [profile, sources, connections, offerCount, publishReadyCount, orderCount, agreement] = await Promise.all([
      this.prisma.supplierProfile.findUnique({ where: { organizationId: supplierOrganizationId } }),
      this.prisma.supplierDataSource.findMany({ where: { supplierOrganizationId }, orderBy: { createdAt: "desc" } }),
      this.prisma.integrationConnection.findMany({ where: { supplierOrganizationId }, include: { mappings: true, jobs: { orderBy: { createdAt: "desc" }, take: 100 }, reconciliationEntries: { where: { status: { notIn: ["MATCHED", "RESOLVED"] } } }, agent: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.supplierOffer.count({ where: { supplierOrganizationId } }),
      this.prisma.supplierOffer.count({ where: { supplierOrganizationId, status: "ACTIVE", prices: { some: { status: "ACTIVE" } }, inventoryBalances: { some: { quantityAvailable: { gt: 0 }, freshnessStatus: "FRESH" } } } }),
      this.prisma.supplierOrder.count({ where: { supplierOrganizationId } }),
      this.prisma.marketplaceAgreement.findFirst({ where: { supplierOrganizationId, status: { in: ["ACTIVE", "NON_RENEWING"] }, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } } }),
    ]);
    const source = sources[0] ?? null;
    const connection = connections[0] ?? null;
    const simpleChannel = source && ["MANUAL", "CSV", "EXCEL"].includes(source.type);
    const successfulJobs = connection?.jobs.filter((job) => job.status === "SUCCEEDED") ?? [];
    const diagnosticsComplete = Boolean(simpleChannel || connection?.status === "ACTIVE" || successfulJobs.some((job) => job.type === "TEST_CONNECTION"));
    const mappingsComplete = Boolean(simpleChannel || (connection && connection.mappings.length > 0));
    const testDataComplete = Boolean(simpleChannel ? offerCount > 0 : successfulJobs.some((job) => ["FULL_SYNC", "CATALOG_SYNC", "INCREMENTAL_SYNC"].includes(job.type)));
    const qualityComplete = Boolean(testDataComplete && (!connection || connection.reconciliationEntries.length === 0));
    const controlOrderComplete = orderCount > 0 || successfulJobs.some((job) => ["ORDER_EXPORT", "RESERVATION_CREATE", "RESERVATION_RELEASE"].includes(job.type));
    const goLiveComplete = Boolean(agreement && publishReadyCount > 0 && diagnosticsComplete);
    const steps = [
      { id: "authority", label: "Организация и полномочия", complete: Boolean(profile), evidence: profile ? "Профиль активен" : "Нужно активировать профиль" },
      { id: "source", label: "Выбор источника", complete: Boolean(source), evidence: source ? `${source.type}: ${source.name}` : "Выберите Manual, Excel/CSV, МойСклад, 1С или API" },
      { id: "diagnostics", label: "Диагностика возможностей", complete: diagnosticsComplete, evidence: connection?.lastError ?? (diagnosticsComplete ? "Базовая диагностика пройдена" : "Нет успешного TEST_CONNECTION/heartbeat") },
      { id: "mapping", label: "Сопоставления", complete: mappingsComplete, evidence: simpleChannel ? "Для выбранного канала отдельный mapping не обязателен" : `${connection?.mappings.length ?? 0} mappings` },
      { id: "test_data", label: "Тестовые данные", complete: testDataComplete, evidence: testDataComplete ? `${offerCount} offers / успешный sync` : "Нужны 10–50 товаров или первое ручное предложение" },
      { id: "quality", label: "Контроль качества", complete: qualityComplete, evidence: connection ? `${connection.reconciliationEntries.length} открытых расхождений` : (qualityComplete ? "Блокирующих расхождений нет" : "Нет данных для проверки") },
      { id: "publication", label: "Готовность к публикации", complete: publishReadyCount > 0, evidence: `${publishReadyCount} offers с ценой и свежим остатком` },
      { id: "control_order", label: "Контрольный заказ", complete: controlOrderComplete, evidence: controlOrderComplete ? `${orderCount} заказов / операции коннектора` : "Не пройдены reserve → confirm → cancel/release" },
      { id: "go_live", label: "Go-live и SLA", complete: goLiveComplete, evidence: goLiveComplete ? "Договор активен, данные готовы" : "Нужны активный договор, готовый offer и подтверждённый канал" },
    ];
    const completed = steps.filter((step) => step.complete).length;
    return { channel: source?.type ?? null, connection: connection ? { id: connection.id, provider: connection.provider, status: connection.status, agentStatus: connection.agent?.status ?? null, lastSuccessAt: connection.lastSuccessAt } : null, completedSteps: completed, totalSteps: steps.length, progressPercent: Math.round(completed / steps.length * 100), timeTargets: { MANUAL: "30 минут до контрольного заказа", EXCEL: "до 2 часов", CSV: "до 2 часов", API: "до 1 рабочего дня", ERP: "1–3 часа для типовой 1С" }, steps };
  }

  async get(supplierOrganizationId: string, connectionId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, supplierOrganizationId }, select: connectionSelect });
    if (!connection) throw new NotFoundException("Integration connection not found");
    return connection;
  }

  async create(supplierOrganizationId: string, input: CreateIntegrationConnectionInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    const enrollmentToken = input.provider === "ONE_C" ? this.crypto.token() : undefined;
    const agentId = input.provider === "ONE_C" ? `agent_${this.crypto.token(18)}` : undefined;
    const webhookEndpointId = input.enableWebhook ? `wh_${this.crypto.token(24)}` : undefined;
    const webhookSigningSecret = input.enableWebhook ? this.crypto.token() : undefined;
    const encryptedCredentials = input.credentials && Object.keys(input.credentials).length > 0 ? this.crypto.encrypt(input.credentials) : undefined;

    const created = await this.prisma.$transaction(async (tx) => {
      const source = await tx.supplierDataSource.create({
        data: {
          supplierOrganizationId,
          name: input.displayName,
          type: input.provider === "ONE_C" ? "ERP" : "API",
          configuration: { provider: input.provider, managedByIntegration: true },
        },
      });
      const connection = await tx.integrationConnection.create({
        data: {
          supplierOrganizationId,
          sourceId: source.id,
          provider: input.provider,
          mode: input.mode,
          displayName: input.displayName,
          encryptedCredentials,
          configuration: input.configuration == null ? undefined : input.configuration as Prisma.InputJsonValue,
          webhookEndpointId,
          encryptedWebhookSecret: webhookSigningSecret ? this.crypto.encrypt({ secret: webhookSigningSecret }) : undefined,
        },
      });
      if (agentId && enrollmentToken) {
        await tx.connectorAgent.create({
          data: {
            connectionId: connection.id,
            agentId,
            enrollmentTokenHash: this.crypto.hashToken(enrollmentToken),
            enrollmentExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
            minimumSupportedVersion: "0.1.0",
          },
        });
      } else {
        await tx.integrationSyncJob.create({
          data: { connectionId: connection.id, type: "TEST_CONNECTION", trigger: "MANUAL", idempotencyKey: `initial-test:${connection.id}` },
        });
      }
      await tx.auditLog.create({
        data: {
          ...context,
          action: "integration.connection.created",
          entityType: "IntegrationConnection",
          entityId: connection.id,
          after: { provider: connection.provider, mode: connection.mode, displayName: connection.displayName, sourceId: source.id, webhookEnabled: Boolean(webhookEndpointId) },
        },
      });
      return connection;
    });

    return {
      connection: await this.get(supplierOrganizationId, created.id, context),
      enrollment: agentId && enrollmentToken ? { agentId, enrollmentToken, expiresAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString() } : undefined,
      webhook: webhookEndpointId ? { endpointPath: `/api/integrations/webhooks/${webhookEndpointId}`, signingSecret: webhookSigningSecret } : undefined,
    };
  }

  async update(supplierOrganizationId: string, connectionId: string, input: UpdateIntegrationConnectionInput, context: SupplierActorContext) {
    await this.requireConnection(supplierOrganizationId, connectionId, context);
    const encryptedCredentials = input.credentials ? this.crypto.encrypt(input.credentials) : undefined;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.integrationConnection.updateMany({
        where: { id: connectionId, supplierOrganizationId, version: input.version },
        data: {
          displayName: input.displayName,
          status: input.status,
          encryptedCredentials: input.status === "REVOKED" ? null : encryptedCredentials,
          configuration: input.configuration === null ? Prisma.DbNull : input.configuration == null ? undefined : input.configuration as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) throw new ConflictException("Integration connection changed concurrently");
      if (input.status === "REVOKED") {
        await tx.connectorAgent.updateMany({ where: { connectionId }, data: { status: "REVOKED", accessTokenHash: null, enrollmentTokenHash: null, enrollmentExpiresAt: null } });
        await tx.integrationSyncJob.updateMany({ where: { connectionId, status: { in: ["PENDING", "FAILED"] } }, data: { status: "CANCELLED", completedAt: new Date() } });
      }
      const connection = await tx.integrationConnection.findUniqueOrThrow({ where: { id: connectionId } });
      await tx.auditLog.create({ data: { ...context, action: "integration.connection.updated", entityType: "IntegrationConnection", entityId: connectionId, after: { displayName: connection.displayName, status: connection.status, version: connection.version, credentialsRotated: Boolean(input.credentials) } } });
      return connection;
    });
    return this.get(supplierOrganizationId, updated.id, context);
  }

  async createBinding(supplierOrganizationId: string, connectionId: string, input: CreateIntegrationBindingInput, context: SupplierActorContext) {
    await this.requireConnection(supplierOrganizationId, connectionId, context);
    if (input.warehouseId) {
      const warehouse = await this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, supplierOrganizationId } });
      if (!warehouse) throw new NotFoundException("Supplier warehouse not found");
    }
    if (input.offerId) {
      const offer = await this.prisma.supplierOffer.findFirst({ where: { id: input.offerId, supplierOrganizationId } });
      if (!offer) throw new NotFoundException("Supplier offer not found");
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const binding = await tx.integrationDataBinding.create({ data: { connectionId, dataType: input.dataType, warehouseId: input.warehouseId, offerId: input.offerId, priority: input.priority, configuration: input.configuration == null ? undefined : input.configuration as Prisma.InputJsonValue } });
        await tx.auditLog.create({ data: { ...context, action: "integration.binding.created", entityType: "IntegrationDataBinding", entityId: binding.id, after: binding } });
        return binding;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("An integration binding already exists for this scope");
      throw error;
    }
  }

  async deleteBinding(supplierOrganizationId: string, connectionId: string, bindingId: string, context: SupplierActorContext) {
    await this.requireConnection(supplierOrganizationId, connectionId, context);
    const binding = await this.prisma.integrationDataBinding.findFirst({ where: { id: bindingId, connectionId } });
    if (!binding) throw new NotFoundException("Integration binding not found");
    await this.prisma.$transaction([
      this.prisma.integrationDataBinding.delete({ where: { id: bindingId } }),
      this.prisma.auditLog.create({ data: { ...context, action: "integration.binding.deleted", entityType: "IntegrationDataBinding", entityId: bindingId, before: binding } }),
    ]);
    return { deleted: true };
  }

  async upsertMapping(supplierOrganizationId: string, connectionId: string, input: UpsertIntegrationMappingInput, context: SupplierActorContext) {
    await this.requireConnection(supplierOrganizationId, connectionId, context);
    if (input.internalId) await this.validateMappingTarget(supplierOrganizationId, input.entityType, input.internalId);
    const before = await this.prisma.integrationMapping.findUnique({ where: { connectionId_entityType_externalId: { connectionId, entityType: input.entityType, externalId: input.externalId } } });
    return this.prisma.$transaction(async (tx) => {
      const mapping = await tx.integrationMapping.upsert({
        where: { connectionId_entityType_externalId: { connectionId, entityType: input.entityType, externalId: input.externalId } },
        update: { internalId: input.internalId ?? null, mappingData: input.mappingData == null ? undefined : input.mappingData as Prisma.InputJsonValue, status: input.status, lastSeenAt: new Date() },
        create: { connectionId, entityType: input.entityType, externalId: input.externalId, internalId: input.internalId, mappingData: input.mappingData == null ? undefined : input.mappingData as Prisma.InputJsonValue, status: input.status, lastSeenAt: new Date() },
      });
      await tx.auditLog.create({ data: { ...context, action: before ? "integration.mapping.updated" : "integration.mapping.created", entityType: "IntegrationMapping", entityId: mapping.id, before: before ?? Prisma.JsonNull, after: mapping } });
      return mapping;
    });
  }

  async deleteMapping(supplierOrganizationId: string, connectionId: string, mappingId: string, context: SupplierActorContext) {
    await this.requireConnection(supplierOrganizationId, connectionId, context);
    const mapping = await this.prisma.integrationMapping.findFirst({ where: { id: mappingId, connectionId } });
    if (!mapping) throw new NotFoundException("Integration mapping not found");
    await this.prisma.$transaction([
      this.prisma.integrationMapping.delete({ where: { id: mappingId } }),
      this.prisma.auditLog.create({ data: { ...context, action: "integration.mapping.deleted", entityType: "IntegrationMapping", entityId: mappingId, before: mapping } }),
    ]);
    return { deleted: true };
  }

  private async validateMappingTarget(supplierOrganizationId: string, entityType: UpsertIntegrationMappingInput["entityType"], internalId: string) {
    const found = entityType === "WAREHOUSE"
      ? await this.prisma.warehouse.findFirst({ where: { id: internalId, supplierOrganizationId }, select: { id: true } })
      : entityType === "VARIANT"
        ? await this.prisma.productVariant.findUnique({ where: { id: internalId }, select: { id: true } })
        : entityType === "PRODUCT"
          ? await this.prisma.product.findUnique({ where: { id: internalId }, select: { id: true } })
          : entityType === "COUNTERPARTY"
            ? await this.prisma.organization.findUnique({ where: { id: internalId }, select: { id: true } })
            : { id: internalId };
    if (!found) throw new NotFoundException(`Internal target for ${entityType} mapping not found`);
  }

  async rotateAgentEnrollment(supplierOrganizationId: string, connectionId: string, context: SupplierActorContext) {
    const connection = await this.requireConnection(supplierOrganizationId, connectionId, context);
    if (connection.provider !== "ONE_C") throw new ConflictException("Enrollment is only available for 1C connector agents");
    const token = this.crypto.token();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
    const agent = await this.prisma.connectorAgent.update({ where: { connectionId }, data: { status: "PENDING", enrollmentTokenHash: this.crypto.hashToken(token), enrollmentExpiresAt: expiresAt, accessTokenHash: null } });
    await this.prisma.auditLog.create({ data: { ...context, action: "integration.agent.enrollment_rotated", entityType: "ConnectorAgent", entityId: agent.id, after: { agentId: agent.agentId, expiresAt } } });
    return { agentId: agent.agentId, enrollmentToken: token, expiresAt };
  }

  async reconciliation(supplierOrganizationId: string, connectionId: string, query: ReconciliationQueryInput, context: SupplierActorContext) {
    await this.requireConnection(supplierOrganizationId, connectionId, context);
    return this.prisma.integrationReconciliationEntry.findMany({ where: { connectionId, status: query.status, kind: query.kind }, orderBy: [{ detectedAt: "desc" }, { id: "desc" }], take: query.limit });
  }

  async resolveReconciliation(supplierOrganizationId: string, connectionId: string, entryId: string, input: ResolveReconciliationInput, context: SupplierActorContext) {
    await this.requireConnection(supplierOrganizationId, connectionId, context);
    const entry = await this.prisma.integrationReconciliationEntry.findFirst({ where: { id: entryId, connectionId } });
    if (!entry) throw new NotFoundException("Reconciliation entry not found");
    return this.prisma.$transaction(async (tx) => {
      const resolved = await tx.integrationReconciliationEntry.update({ where: { id: entryId }, data: { status: "RESOLVED", resolution: input.resolution, resolvedAt: new Date(), resolvedById: context.actorId } });
      await tx.auditLog.create({ data: { ...context, action: "integration.reconciliation.resolved", entityType: "IntegrationReconciliationEntry", entityId: entryId, before: entry, after: resolved } });
      return resolved;
    });
  }

  async requireConnection(supplierOrganizationId: string, connectionId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const connection = await this.prisma.integrationConnection.findFirst({ where: { id: connectionId, supplierOrganizationId } });
    if (!connection) throw new NotFoundException("Integration connection not found");
    return connection;
  }
}
