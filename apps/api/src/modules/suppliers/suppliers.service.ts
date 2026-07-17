import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSupplierDataSourceInput, CreateSupplierProfileInput, CreateWarehouseInput } from "@marketplace/schemas";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SupplierAccessService, type SupplierActorContext } from "./supplier-access.service";
import { IntegrationCryptoService } from "../integrations/integration-crypto.service";

const SENSITIVE_CONFIGURATION_KEY = /(^|_|-)(token|secret|password|passwd|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|authorization|credential)(_|-|$)/i;

function protectConfiguration(value: unknown): { publicValue: unknown; sensitiveValue: Record<string, unknown> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { publicValue: value, sensitiveValue: {} };
  const publicValue: Record<string, unknown> = {};
  const sensitiveValue: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value && typeof value === "object" && !Array.isArray(value) ? value : {})) {
    if (SENSITIVE_CONFIGURATION_KEY.test(key)) sensitiveValue[key] = item;
    else if (item && typeof item === "object" && !Array.isArray(item)) {
      const nested = protectConfiguration(item);
      publicValue[key] = nested.publicValue;
      if (Object.keys(nested.sensitiveValue).length > 0) sensitiveValue[key] = nested.sensitiveValue;
    } else publicValue[key] = item;
  }
  return { publicValue, sensitiveValue };
}

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService, private readonly access: SupplierAccessService, private readonly crypto: IntegrationCryptoService) {}

  async list(context: SupplierActorContext) {
    const isOperator = await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId: context.organizationId, capability: "MARKETPLACE_OPERATOR" } } });
    return this.prisma.supplierProfile.findMany({
      where: isOperator ? undefined : { organizationId: context.organizationId },
      include: { organization: { include: { capabilities: true } }, warehouses: true, dataSources: { select: { id: true, supplierOrganizationId: true, name: true, type: true, configuration: true, status: true, createdAt: true, updatedAt: true } }, _count: { select: { offers: true, importBatches: true } } },
      orderBy: { organization: { displayName: "asc" } },
    });
  }

  async createProfile(supplierOrganizationId: string, input: CreateSupplierProfileInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const organization = await this.prisma.organization.findUnique({ where: { id: supplierOrganizationId }, include: { capabilities: true } });
    if (!organization) throw new NotFoundException("Organization not found");
    if (!organization.capabilities.some(({ capability }) => capability === "SUPPLIER")) throw new BadRequestException("Organization must have SUPPLIER capability");
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.supplierProfile.upsert({
        where: { organizationId: supplierOrganizationId },
        update: { regulatoryDetails: input.regulatoryDetails ? input.regulatoryDetails as Prisma.InputJsonValue : undefined, status: "ACTIVE" },
        create: { organizationId: supplierOrganizationId, regulatoryDetails: input.regulatoryDetails ? input.regulatoryDetails as Prisma.InputJsonValue : undefined },
        include: { organization: true },
      });
      await tx.auditLog.create({ data: { ...context, action: "supplier.profile.upserted", entityType: "SupplierProfile", entityId: supplierOrganizationId, after: profile } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierProfile", aggregateId: supplierOrganizationId, eventType: "SupplierProfileUpserted", payload: { supplierOrganizationId } } });
      return profile;
    });
  }

  async warehouses(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    return this.prisma.warehouse.findMany({ where: { supplierOrganizationId }, include: { city: true }, orderBy: { name: "asc" } });
  }

  async createWarehouse(supplierOrganizationId: string, input: CreateWarehouseInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await tx.warehouse.create({ data: { supplierOrganizationId, code: input.code, name: input.name, cityId: input.cityId ?? null, addressLine: input.addressLine ?? null, timezone: input.timezone } });
      await tx.auditLog.create({ data: { ...context, action: "supplier.warehouse.created", entityType: "Warehouse", entityId: warehouse.id, after: warehouse } });
      await tx.outboxEvent.create({ data: { aggregateType: "Warehouse", aggregateId: warehouse.id, eventType: "WarehouseCreated", payload: { supplierOrganizationId, warehouseId: warehouse.id } } });
      return warehouse;
    });
  }

  async dataSources(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    return this.prisma.supplierDataSource.findMany({ where: { supplierOrganizationId }, select: { id: true, supplierOrganizationId: true, name: true, type: true, configuration: true, status: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" } });
  }

  async createDataSource(supplierOrganizationId: string, input: CreateSupplierDataSourceInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    return this.prisma.$transaction(async (tx) => {
      const protectedConfiguration = protectConfiguration(input.configuration);
      const source = await tx.supplierDataSource.create({ data: { supplierOrganizationId, name: input.name, type: input.type, configuration: Object.keys((protectedConfiguration.publicValue as Record<string, unknown>) ?? {}).length > 0 ? protectedConfiguration.publicValue as Prisma.InputJsonValue : undefined, encryptedConfiguration: Object.keys(protectedConfiguration.sensitiveValue).length > 0 ? this.crypto.encryptJson(protectedConfiguration.sensitiveValue) : undefined } });
      const { encryptedConfiguration: _encryptedConfiguration, ...safeSource } = source;
      await tx.auditLog.create({ data: { ...context, action: "supplier.data_source.created", entityType: "SupplierDataSource", entityId: source.id, after: safeSource } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierDataSource", aggregateId: source.id, eventType: "SupplierDataSourceCreated", payload: { supplierOrganizationId, sourceId: source.id } } });
      return safeSource;
    });
  }
}
