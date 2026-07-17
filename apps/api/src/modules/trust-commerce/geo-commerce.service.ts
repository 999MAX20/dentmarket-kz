import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import type { SupplierActorContext } from "../suppliers/supplier-access.service";

type GeoUpdate = { latitude: number; longitude: number; district?: string | null; evidence?: Record<string, unknown> | null; version: number };
type GeoVerification = { status: "VERIFIED" | "REJECTED"; method: string; evidence?: Record<string, unknown> | null; reason: string; version: number };

@Injectable()
export class GeoCommerceService {
  constructor(private readonly prisma: PrismaService) {}

  private async isOperator(organizationId: string) {
    return Boolean(await this.prisma.organizationCapability.findUnique({ where: { organizationId_capability: { organizationId, capability: "MARKETPLACE_OPERATOR" } } }));
  }

  async organizationAddresses(context: SupplierActorContext) {
    return this.prisma.address.findMany({ where: { organizationId: context.organizationId }, include: { city: { include: { region: true } }, country: true }, orderBy: { line1: "asc" } });
  }

  async updateAddress(addressId: string, input: GeoUpdate, context: SupplierActorContext) {
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address || (address.organizationId !== context.organizationId && !(await this.isOperator(context.organizationId)))) throw new NotFoundException("Organization address not found");
    const changed = await this.prisma.address.updateMany({ where: { id: addressId, version: input.version }, data: { latitude: input.latitude, longitude: input.longitude, district: input.district, geoEvidence: input.evidence == null ? Prisma.JsonNull : input.evidence as Prisma.InputJsonValue, geoStatus: "PENDING", geoMethod: null, geoVerifiedAt: null, geoVerifiedById: null, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Address changed; reload before updating coordinates");
    const updated = await this.prisma.address.findUniqueOrThrow({ where: { id: addressId } });
    await this.prisma.auditLog.create({ data: { ...context, action: "geo.address.updated", entityType: "Address", entityId: addressId, before: { geoStatus: address.geoStatus, version: address.version }, after: { geoStatus: updated.geoStatus, version: updated.version, district: updated.district } } });
    return updated;
  }

  async verifyAddress(addressId: string, input: GeoVerification, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator may verify a location");
    const address = await this.prisma.address.findUnique({ where: { id: addressId } });
    if (!address) throw new NotFoundException("Organization address not found");
    if (input.status === "VERIFIED" && (address.latitude == null || address.longitude == null)) throw new ConflictException("Coordinates are required before location verification");
    const changed = await this.prisma.address.updateMany({ where: { id: addressId, version: input.version }, data: { geoStatus: input.status, geoMethod: input.method, geoEvidence: input.evidence == null ? address.geoEvidence ?? Prisma.JsonNull : input.evidence as Prisma.InputJsonValue, geoVerifiedAt: input.status === "VERIFIED" ? new Date() : null, geoVerifiedById: context.actorId, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Address changed; reload before verification");
    const updated = await this.prisma.address.findUniqueOrThrow({ where: { id: addressId } });
    await this.prisma.auditLog.create({ data: { ...context, action: "geo.address.verified", entityType: "Address", entityId: addressId, before: { status: address.geoStatus }, after: { status: updated.geoStatus, method: input.method, reason: input.reason } } });
    return updated;
  }

  async updateWarehouse(warehouseId: string, input: Omit<GeoUpdate, "district">, context: SupplierActorContext) {
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse || (warehouse.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId)))) throw new NotFoundException("Warehouse not found");
    const changed = await this.prisma.warehouse.updateMany({ where: { id: warehouseId, version: input.version }, data: { latitude: input.latitude, longitude: input.longitude, geoEvidence: input.evidence == null ? Prisma.JsonNull : input.evidence as Prisma.InputJsonValue, geoStatus: "PENDING", geoMethod: null, geoVerifiedAt: null, geoVerifiedById: null, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Warehouse changed; reload before updating coordinates");
    const updated = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    await this.prisma.auditLog.create({ data: { ...context, action: "geo.warehouse.updated", entityType: "Warehouse", entityId: warehouseId, before: { geoStatus: warehouse.geoStatus, version: warehouse.version }, after: { geoStatus: updated.geoStatus, version: updated.version } } });
    return updated;
  }

  async verifyWarehouse(warehouseId: string, input: GeoVerification, context: SupplierActorContext) {
    if (!(await this.isOperator(context.organizationId))) throw new ForbiddenException("Only the marketplace operator may verify a location");
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    if (input.status === "VERIFIED" && (warehouse.latitude == null || warehouse.longitude == null)) throw new ConflictException("Coordinates are required before location verification");
    const changed = await this.prisma.warehouse.updateMany({ where: { id: warehouseId, version: input.version }, data: { geoStatus: input.status, geoMethod: input.method, geoEvidence: input.evidence == null ? warehouse.geoEvidence ?? Prisma.JsonNull : input.evidence as Prisma.InputJsonValue, geoVerifiedAt: input.status === "VERIFIED" ? new Date() : null, geoVerifiedById: context.actorId, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Warehouse changed; reload before verification");
    const updated = await this.prisma.warehouse.findUniqueOrThrow({ where: { id: warehouseId } });
    await this.prisma.auditLog.create({ data: { ...context, action: "geo.warehouse.verified", entityType: "Warehouse", entityId: warehouseId, before: { status: warehouse.geoStatus }, after: { status: updated.geoStatus, method: input.method, reason: input.reason } } });
    return updated;
  }

  async updateZone(zoneId: string, input: { zoneType: "CITY_LIST" | "REGION_LIST" | "RADIUS" | "HYBRID"; centerLatitude?: number | null; centerLongitude?: number | null; radiusKm?: number | null; regionCodes: string[]; excludedCityIds: string[]; version: number }, context: SupplierActorContext) {
    const zone = await this.prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    if (!zone || (zone.supplierOrganizationId !== context.organizationId && !(await this.isOperator(context.organizationId)))) throw new NotFoundException("Delivery zone not found");
    const changed = await this.prisma.deliveryZone.updateMany({ where: { id: zoneId, version: input.version }, data: { zoneType: input.zoneType, centerLatitude: input.centerLatitude, centerLongitude: input.centerLongitude, radiusKm: input.radiusKm, regionCodes: input.regionCodes, excludedCityIds: input.excludedCityIds, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ConflictException("Delivery zone changed; reload before updating");
    const updated = await this.prisma.deliveryZone.findUniqueOrThrow({ where: { id: zoneId } });
    await this.prisma.auditLog.create({ data: { ...context, action: "geo.delivery_zone.updated", entityType: "DeliveryZone", entityId: zoneId, before: { zoneType: zone.zoneType, version: zone.version }, after: { zoneType: updated.zoneType, radiusKm: updated.radiusKm?.toString() ?? null, regionCodes: updated.regionCodes, excludedCityIds: updated.excludedCityIds, version: updated.version } } });
    return updated;
  }
}
