import { Injectable, NotFoundException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma, type IntegrationDataBinding, type IntegrationReconciliationKind, type IntegrationReconciliationStatus, type IntegrationSyncJob } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { normalizeCatalogText } from "../imports/matching";
import { DataFreshnessService } from "../inventory/data-freshness.service";
import { IntegrationAdapterRegistry } from "./adapters/adapter-registry.service";
import { asRecord, type ExternalInventoryItem, type ExternalPriceItem, type IntegrationAdapter, type IntegrationAdapterContext, PermanentIntegrationError } from "./adapters/integration-adapter";
import { IntegrationJobsService } from "./integration-jobs.service";
import { MarketplaceAgreementsService } from "../agreements/marketplace-agreements.service";

@Injectable()
export class IntegrationExecutionService {
  constructor(private readonly prisma: PrismaService, private readonly registry: IntegrationAdapterRegistry, private readonly jobs: IntegrationJobsService, private readonly freshness: DataFreshnessService, private readonly agreements: MarketplaceAgreementsService) {}

  async execute(job: IntegrationSyncJob) {
    const connection = await this.prisma.integrationConnection.findUnique({ where: { id: job.connectionId } });
    if (!connection) throw new NotFoundException("Integration connection not found");
    const { adapter, context } = this.registry.resolve(connection);
    const payload = asRecord(job.payload);
    const cursor = asRecord(job.cursor);

    switch (job.type) {
      case "TEST_CONNECTION": {
        const result = await adapter.testConnection(context);
        await this.prisma.integrationConnection.update({ where: { id: connection.id }, data: { externalAccountId: result.externalId, capabilities: result.data as Prisma.InputJsonValue } });
        return result.data;
      }
      case "DISCOVER": {
        const result = await adapter.discover(context);
        return result.data;
      }
      case "FULL_SYNC":
      case "INCREMENTAL_SYNC":
        return this.enqueueCompositeSync(job);
      case "CATALOG_SYNC":
        return this.pullCatalog(job, connection.sourceId, connection.supplierOrganizationId, context, adapter, cursor);
      case "PRICE_SYNC":
        return this.pullPrices(job, connection.sourceId, connection.supplierOrganizationId, context, adapter, cursor);
      case "INVENTORY_SYNC":
        return this.pullInventory(job, connection.sourceId, connection.supplierOrganizationId, context, adapter, cursor);
      case "ORDER_EXPORT": {
        const supplierOrderId = typeof payload.supplierOrderId === "string" ? payload.supplierOrderId : undefined;
        if (supplierOrderId) {
          const order = await this.prisma.supplierOrder.findUnique({ where: { id: supplierOrderId }, select: { supplierOrganizationId: true } });
          if (!order) throw new NotFoundException("Supplier order not found for export");
          await this.agreements.assertActive(order.supplierOrganizationId);
        }
        const orderPayload = await this.orderPayload(payload);
        const result = await adapter.exportOrder(context, orderPayload);
        return { externalOrderId: result.externalId, ...result.data };
      }
      case "RESERVATION_CREATE":
        return this.createReservation(payload, context, adapter);
      case "RESERVATION_RELEASE":
        return this.releaseReservation(payload, context, adapter);
      case "WEBHOOK_PROCESS":
        return this.processWebhook(connection.id, payload);
      case "RECONCILIATION":
        return this.reconciliationSummary(connection.id);
      default:
        throw new PermanentIntegrationError(`Unsupported integration job type: ${job.type}`);
    }
  }

  private async enqueueCompositeSync(job: IntegrationSyncJob) {
    const jobs = await Promise.all((["CATALOG_SYNC", "PRICE_SYNC", "INVENTORY_SYNC"] as const).map((type) => this.jobs.enqueue(job.connectionId, {
      type,
      idempotencyKey: `${job.type.toLowerCase()}:${job.id}:${type.toLowerCase()}`,
      payload: { parentJobId: job.id },
      maxAttempts: job.maxAttempts,
    }, job.trigger === "WEBHOOK" ? "WEBHOOK" : "RETRY")));
    return { queued: jobs.map(({ id, type, status }) => ({ id, type, status })) };
  }

  private async pullCatalog(job: IntegrationSyncJob, sourceId: string, supplierOrganizationId: string, context: IntegrationAdapterContext, adapter: IntegrationAdapter, cursor: Record<string, unknown>) {
    const page = await adapter.pullCatalog(context, cursor);
    await this.prisma.$transaction(async (tx) => {
      for (const item of page.items) {
        await tx.supplierExternalItem.upsert({
          where: { sourceId_externalId: { sourceId, externalId: item.externalId } },
          update: { supplierSku: item.supplierSku, name: item.name, normalizedName: normalizeCatalogText(item.name), brandText: item.brand, manufacturerText: item.manufacturer, gtin: item.gtin, unitText: item.unit, rawData: item.raw as Prisma.InputJsonValue },
          create: { supplierOrganizationId, sourceId, externalId: item.externalId, supplierSku: item.supplierSku, name: item.name, normalizedName: normalizeCatalogText(item.name), brandText: item.brand, manufacturerText: item.manufacturer, gtin: item.gtin, unitText: item.unit, rawData: item.raw as Prisma.InputJsonValue },
        });
      }
      await tx.supplierDataSource.update({ where: { id: sourceId }, data: { status: "ACTIVE" } });
    });
    await this.enqueueContinuation(job, page.nextCursor);
    return { imported: page.items.length, nextCursor: page.nextCursor ?? null };
  }

  private async enqueueContinuation(job: IntegrationSyncJob, nextCursor?: Record<string, unknown>) {
    if (!nextCursor) return;
    const fingerprint = createHash("sha256").update(JSON.stringify(nextCursor)).digest("hex").slice(0, 20);
    const idempotencyKey = `continuation:${job.id}:${fingerprint}`;
    await this.jobs.enqueue(job.connectionId, { type: job.type, idempotencyKey, payload: { previousJobId: job.id }, maxAttempts: job.maxAttempts }, "RETRY");
    await this.prisma.integrationSyncJob.updateMany({ where: { connectionId: job.connectionId, idempotencyKey }, data: { cursor: nextCursor as Prisma.InputJsonValue } });
  }

  private async pullPrices(job: IntegrationSyncJob, sourceId: string, supplierOrganizationId: string, context: IntegrationAdapterContext, adapter: IntegrationAdapter, cursor: Record<string, unknown>) {
    const bindings = await this.prisma.integrationDataBinding.findMany({
      where: { connectionId: job.connectionId, dataType: "PRICE", status: "ACTIVE" },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (bindings.length === 0) return { skipped: true, reason: "No active PRICE binding" };
    const page = await adapter.pullPrices(context, cursor);
    const productIds = new Set<string>();
    const result = { received: page.items.length, updated: 0, unchanged: 0, protected: 0, unmatched: 0, skipped: 0 };

    for (const item of page.items) {
      const target = await this.resolveExternalTarget(job.connectionId, sourceId, supplierOrganizationId, item.externalId);
      const externalRef = this.priceExternalRef(item);
      if (!target?.variantId || !target.offer) {
        result.unmatched += 1;
        await this.reconcile(job.connectionId, "PRICE", "MISSING_INTERNAL", externalRef, target?.variantId ? "SupplierOffer" : "ProductVariant", target?.variantId ?? undefined, { externalId: item.externalId, priceTypeId: item.priceTypeId ?? null }, { valueMinor: item.valueMinor, currency: item.currency });
        continue;
      }
      const binding = bindings.find((candidate) => (!candidate.offerId || candidate.offerId === target.offer?.id) && this.acceptsPriceType(candidate, item));
      if (!binding) {
        result.skipped += 1;
        continue;
      }
      const configuration = asRecord(binding.configuration);
      const active = await this.prisma.offerPrice.findFirst({ where: { offerId: target.offer.id, status: "ACTIVE" }, orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }] });
      const syncOverride = await this.freshness.resolveSyncOverride("PRICE", target.offer.id);
      if (syncOverride.protected) {
        result.protected += 1;
        await this.reconcile(job.connectionId, "PRICE", "MISMATCH", externalRef, "SupplierOffer", target.offer.id, { valueMinor: item.valueMinor, currency: item.currency, source: "API" }, { protectedOverrideId: syncOverride.override?.id, mode: syncOverride.override?.mode });
        continue;
      }
      if (active?.source === "MANUAL" && !syncOverride.override && configuration.allowOverwriteManual !== true) {
        result.protected += 1;
        await this.reconcile(job.connectionId, "PRICE", "MISMATCH", externalRef, "SupplierOffer", target.offer.id, { valueMinor: item.valueMinor, currency: item.currency, source: "API" }, { valueMinor: Number(active.amountMinor), currency: active.currency, source: active.source, protectedManualOverride: true });
        continue;
      }
      if (active && Number(active.amountMinor) === item.valueMinor && active.currency === item.currency) {
        result.unchanged += 1;
        await this.resolveOpenReconciliation(job.connectionId, "PRICE", externalRef);
        continue;
      }

      const now = new Date();
      const freshnessPolicy = await this.freshness.resolvePolicy(supplierOrganizationId, "API", "PRICE");
      const freshnessExpiresAt = new Date(now.getTime() + freshnessPolicy.staleAfterMinutes * 60_000);
      const includesVat = configuration.includesVat !== false;
      const vatRate = typeof configuration.vatRate === "number" ? configuration.vatRate : null;
      await this.prisma.$transaction(async (tx) => {
        await tx.offerPrice.updateMany({ where: { offerId: target.offer!.id, status: "ACTIVE" }, data: { status: "INACTIVE", validTo: now } });
        await tx.offerPrice.create({ data: { offerId: target.offer!.id, amountMinor: new Prisma.Decimal(item.valueMinor), currency: item.currency, includesVat, vatRate, source: "API", validFrom: now, lastConfirmedAt: now, freshnessExpiresAt } });
        await tx.offerPriceHistory.create({ data: { offerId: target.offer!.id, amountMinor: new Prisma.Decimal(item.valueMinor), currency: item.currency, includesVat, vatRate, source: "API", reason: `Integration ${job.connectionId}` } });
        await tx.supplierOffer.update({ where: { id: target.offer!.id }, data: { sourceId, sourceType: "API", externalId: item.externalId, status: "ACTIVE", version: { increment: 1 } } });
        await tx.outboxEvent.create({ data: { aggregateType: "SupplierOffer", aggregateId: target.offer!.id, eventType: "OfferPriceChanged", payload: { supplierOrganizationId, offerId: target.offer!.id, amountMinor: item.valueMinor, currency: item.currency, source: "API", connectionId: job.connectionId } } });
      });
      productIds.add(target.offer.productVariant.productId);
      result.updated += 1;
      await this.resolveOpenReconciliation(job.connectionId, "PRICE", externalRef);
    }

    await Promise.all([...productIds].map((productId) => this.refreshSearchPrice(productId)));
    await this.enqueueContinuation(job, page.nextCursor);
    return { ...result, nextCursor: page.nextCursor ?? null };
  }

  private async pullInventory(job: IntegrationSyncJob, sourceId: string, supplierOrganizationId: string, context: IntegrationAdapterContext, adapter: IntegrationAdapter, cursor: Record<string, unknown>) {
    const [bindings, warehouses] = await Promise.all([
      this.prisma.integrationDataBinding.findMany({ where: { connectionId: job.connectionId, dataType: "INVENTORY", status: "ACTIVE" }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
      this.prisma.warehouse.findMany({ where: { supplierOrganizationId, status: "ACTIVE" }, select: { id: true } }),
    ]);
    if (bindings.length === 0) return { skipped: true, reason: "No active INVENTORY binding" };
    const page = await adapter.pullInventory(context, cursor);
    const result = { received: page.items.length, updated: 0, protected: 0, conflicted: 0, unmatched: 0, skipped: 0 };

    for (const item of page.items) {
      const externalRef = this.inventoryExternalRef(item);
      const target = await this.resolveExternalTarget(job.connectionId, sourceId, supplierOrganizationId, item.externalId);
      if (!target?.variantId) {
        result.unmatched += 1;
        await this.reconcile(job.connectionId, "INVENTORY", "MISSING_INTERNAL", externalRef, "ProductVariant", undefined, { externalId: item.externalId }, { stock: item.stock, reserved: item.reserved, available: item.available, externalWarehouseId: item.externalWarehouseId ?? null });
        continue;
      }
      const warehouseMapping = item.externalWarehouseId
        ? await this.prisma.integrationMapping.findUnique({ where: { connectionId_entityType_externalId: { connectionId: job.connectionId, entityType: "WAREHOUSE", externalId: item.externalWarehouseId } } })
        : null;
      const mappedWarehouseId = warehouseMapping?.status === "ACTIVE" ? warehouseMapping.internalId : null;
      const binding = this.inventoryBinding(bindings, item, target.offer?.id, mappedWarehouseId);
      if (!binding) {
        result.skipped += 1;
        continue;
      }
      const warehouseId = mappedWarehouseId ?? binding.warehouseId ?? (warehouses.length === 1 ? warehouses[0]?.id : undefined);
      const warehouseExists = warehouseId ? warehouses.some(({ id }) => id === warehouseId) : false;
      if (!warehouseId || !warehouseExists) {
        result.unmatched += 1;
        await this.reconcile(job.connectionId, "INVENTORY", "MISSING_INTERNAL", externalRef, "Warehouse", warehouseId ?? undefined, { externalWarehouseId: item.externalWarehouseId ?? null }, { mappingRequired: true, availableWarehouses: warehouses.length });
        continue;
      }
      if (item.stock < 0 || item.reserved < 0 || !Number.isFinite(item.available)) {
        result.conflicted += 1;
        await this.reconcile(job.connectionId, "INVENTORY", "MISMATCH", externalRef, "InventoryBalance", undefined, { nonNegativeStockAndReserve: true }, { stock: item.stock, reserved: item.reserved, available: item.available });
        continue;
      }
      const configuration = asRecord(binding.configuration);
      const existing = await this.prisma.inventoryBalance.findUnique({ where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId, warehouseId, productVariantId: target.variantId } } });
      const syncOverride = existing ? await this.freshness.resolveSyncOverride("INVENTORY", existing.id) : { protected: false, override: null };
      if (syncOverride.protected) {
        result.protected += 1;
        await this.reconcile(job.connectionId, "INVENTORY", "MISMATCH", externalRef, "InventoryBalance", existing?.id, { stock: item.stock, available: Math.max(0, item.available), source: "API" }, { protectedOverrideId: syncOverride.override?.id, mode: syncOverride.override?.mode });
        continue;
      }
      if (existing?.source === "MANUAL" && !syncOverride.override && configuration.allowOverwriteManual !== true) {
        result.protected += 1;
        await this.reconcile(job.connectionId, "INVENTORY", "MISMATCH", externalRef, "InventoryBalance", existing.id, { stock: item.stock, available: Math.max(0, item.available), source: "API" }, { quantityOnHand: Number(existing.quantityOnHand), quantityAvailable: Number(existing.quantityAvailable), source: existing.source, protectedManualOverride: true });
        continue;
      }
      const localReserved = existing ? Number(existing.quantityReserved) : 0;
      const safetyStock = existing ? Number(existing.safetyStock) : Number(configuration.safetyStock ?? 0);
      if (!Number.isFinite(safetyStock) || safetyStock < 0 || item.stock < localReserved + safetyStock) {
        result.conflicted += 1;
        await this.reconcile(job.connectionId, "INVENTORY", "MISMATCH", externalRef, "InventoryBalance", existing?.id, { minimumOnHand: localReserved + Math.max(0, safetyStock), localReserved, safetyStock }, { externalStock: item.stock, externalReserved: item.reserved, externalAvailable: item.available });
        continue;
      }
      const lotTotals = existing ? await this.prisma.inventoryLot.aggregate({
        where: { inventoryBalanceId: existing.id, status: { notIn: ["DEPLETED", "EXPIRED", "RECALLED"] } },
        _sum: { quantityOnHand: true },
      }) : null;
      const trackedLotOnHand = Number(lotTotals?._sum.quantityOnHand ?? 0);
      if (trackedLotOnHand > item.stock) {
        result.conflicted += 1;
        await this.reconcile(job.connectionId, "INVENTORY", "MISMATCH", externalRef, "InventoryBalance", existing?.id, { minimumOnHandForTrackedLots: trackedLotOnHand }, { externalStock: item.stock, externalReserved: item.reserved, externalAvailable: item.available });
        continue;
      }
      const quantityAvailable = Math.max(0, Math.min(item.available, item.stock - localReserved - safetyStock));
      const now = new Date();
      const freshnessPolicy = await this.freshness.resolvePolicy(supplierOrganizationId, "API", "INVENTORY");
      const freshnessExpiresAt = new Date(now.getTime() + freshnessPolicy.staleAfterMinutes * 60_000);
      const balance = await this.prisma.$transaction(async (tx) => {
        const changed = await tx.inventoryBalance.upsert({
          where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId, warehouseId, productVariantId: target.variantId! } },
          update: { offerId: target.offer?.id ?? null, quantityOnHand: item.stock, quantityAvailable, availabilityStatus: this.availability(quantityAvailable), freshnessStatus: "FRESH", freshnessExpiresAt, source: "API", externalUpdatedAt: now, lastSuccessfulSyncAt: now, version: { increment: 1 } },
          create: { supplierOrganizationId, warehouseId, productVariantId: target.variantId!, offerId: target.offer?.id ?? null, quantityOnHand: item.stock, quantityReserved: 0, safetyStock, quantityAvailable, availabilityStatus: this.availability(quantityAvailable), freshnessStatus: "FRESH", freshnessExpiresAt, source: "API", externalUpdatedAt: now, lastSuccessfulSyncAt: now },
        });
        await tx.outboxEvent.create({ data: { aggregateType: "InventoryBalance", aggregateId: changed.id, eventType: "InventoryBalanceChanged", payload: { supplierOrganizationId, balanceId: changed.id, quantityAvailable, source: "API", connectionId: job.connectionId } } });
        return changed;
      });
      result.updated += 1;
      await this.resolveOpenReconciliation(job.connectionId, "INVENTORY", externalRef, balance.id);
    }

    await this.enqueueContinuation(job, page.nextCursor);
    return { ...result, nextCursor: page.nextCursor ?? null };
  }

  private async resolveExternalTarget(connectionId: string, sourceId: string, supplierOrganizationId: string, externalId: string) {
    const [externalItem, mapping] = await Promise.all([
      this.prisma.supplierExternalItem.findUnique({ where: { sourceId_externalId: { sourceId, externalId } } }),
      this.prisma.integrationMapping.findUnique({ where: { connectionId_entityType_externalId: { connectionId, entityType: "VARIANT", externalId } } }),
    ]);
    const variantId = externalItem?.matchedVariantId ?? (mapping?.status === "ACTIVE" ? mapping.internalId : null);
    if (!variantId) return { externalItem, variantId: null, offer: null };
    const sourceOffer = await this.prisma.supplierOffer.findFirst({
      where: { supplierOrganizationId, productVariantId: variantId, sourceId },
      include: { productVariant: { select: { productId: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    const offer = sourceOffer ?? await this.prisma.supplierOffer.findFirst({
      where: { supplierOrganizationId, productVariantId: variantId },
      include: { productVariant: { select: { productId: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return { externalItem, variantId, offer };
  }

  private acceptsPriceType(binding: IntegrationDataBinding, item: ExternalPriceItem) {
    const configuration = asRecord(binding.configuration);
    const configured = [configuration.externalPriceTypeId, configuration.priceTypeId]
      .filter((value): value is string => typeof value === "string")
      .concat(Array.isArray(configuration.externalPriceTypeIds) ? configuration.externalPriceTypeIds.filter((value): value is string => typeof value === "string") : []);
    return configured.length === 0 || (typeof item.priceTypeId === "string" && configured.includes(item.priceTypeId));
  }

  private inventoryBinding(bindings: IntegrationDataBinding[], item: ExternalInventoryItem, offerId?: string, mappedWarehouseId?: string | null) {
    return bindings.find((binding) => {
      const configuration = asRecord(binding.configuration);
      const configuredExternalId = typeof configuration.externalWarehouseId === "string" ? configuration.externalWarehouseId : undefined;
      if (configuredExternalId && configuredExternalId !== item.externalWarehouseId) return false;
      if (binding.offerId && binding.offerId !== offerId) return false;
      if (binding.warehouseId && mappedWarehouseId && binding.warehouseId !== mappedWarehouseId) return false;
      if (binding.warehouseId && !mappedWarehouseId && item.externalWarehouseId && !configuredExternalId) return false;
      return true;
    });
  }

  private async refreshSearchPrice(productId: string) {
    const aggregate = await this.prisma.offerPrice.aggregate({
      where: { status: "ACTIVE", offer: { productVariant: { productId } } },
      _min: { amountMinor: true },
      _max: { amountMinor: true },
    });
    await this.prisma.productSearchDocument.updateMany({
      where: { productId },
      data: {
        minPrice: aggregate._min.amountMinor ? aggregate._min.amountMinor.div(100) : null,
        maxPrice: aggregate._max.amountMinor ? aggregate._max.amountMinor.div(100) : null,
        projectionVersion: { increment: 1 },
      },
    });
  }

  private priceExternalRef(item: ExternalPriceItem) {
    return `${item.externalId}:${item.priceTypeId ?? "default"}`;
  }

  private inventoryExternalRef(item: ExternalInventoryItem) {
    return `${item.externalId}:${item.externalWarehouseId ?? "default"}`;
  }

  private availability(quantity: number) {
    if (quantity <= 0) return "OUT_OF_STOCK" as const;
    if (quantity <= 5) return "LOW_STOCK" as const;
    return "IN_STOCK" as const;
  }

  private json(value: Record<string, unknown>) {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async reconcile(connectionId: string, kind: IntegrationReconciliationKind, status: IntegrationReconciliationStatus, externalRef: string, internalType: string, internalId: string | undefined, expected: Record<string, unknown>, actual: Record<string, unknown>) {
    const existing = await this.prisma.integrationReconciliationEntry.findFirst({ where: { connectionId, kind, status, externalRef, internalType, internalId: internalId ?? null }, orderBy: { detectedAt: "desc" } });
    const data = { expected: this.json(expected), actual: this.json(actual), detectedAt: new Date(), resolvedAt: null, resolution: null, resolvedById: null };
    if (existing) return this.prisma.integrationReconciliationEntry.update({ where: { id: existing.id }, data });
    return this.prisma.integrationReconciliationEntry.create({ data: { connectionId, kind, status, externalRef, internalType, internalId, ...data } });
  }

  private async resolveOpenReconciliation(connectionId: string, kind: IntegrationReconciliationKind, externalRef: string, internalId?: string) {
    await this.prisma.integrationReconciliationEntry.updateMany({
      where: { connectionId, kind, externalRef, status: { in: ["MISMATCH", "MISSING_EXTERNAL", "MISSING_INTERNAL"] } },
      data: { status: "RESOLVED", internalId, resolvedAt: new Date(), resolution: "Resolved by successful synchronization" },
    });
  }

  private async reconciliationSummary(connectionId: string) {
    const entries = await this.prisma.integrationReconciliationEntry.findMany({
      where: { connectionId, status: { not: "RESOLVED" } },
      select: { kind: true, status: true },
    });
    const byKindAndStatus = entries.reduce<Record<string, number>>((summary, entry) => {
      const key = `${entry.kind}:${entry.status}`;
      summary[key] = (summary[key] ?? 0) + 1;
      return summary;
    }, {});
    return { open: entries.length, byKindAndStatus };
  }

  private async orderPayload(payload: Record<string, unknown>) {
    const supplierOrderId = typeof payload.supplierOrderId === "string" ? payload.supplierOrderId : undefined;
    if (!supplierOrderId) return payload;
    const order = await this.prisma.supplierOrder.findUnique({
      where: { id: supplierOrderId },
      include: { buyer: true, supplier: true, items: { include: { offer: true, productVariant: { include: { product: true } }, reservation: true } } },
    });
    if (!order) throw new NotFoundException("Supplier order not found for export");
    return {
      ...payload,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        buyer: { id: order.buyer.id, bin: order.buyer.bin, name: order.buyer.displayName },
        supplier: { id: order.supplier.id, bin: order.supplier.bin, name: order.supplier.displayName },
        currency: order.currency,
        subtotalAmountMinor: order.subtotalAmountMinor.toString(),
        items: order.items.map((item) => ({ id: item.id, offerId: item.offerId, externalOfferId: item.offer.externalId, sku: item.offer.supplierSku, name: item.productVariant.product.canonicalName, quantity: item.acceptedQuantity.toString(), unitPriceMinor: item.unitPriceMinor.toString(), totalPriceMinor: item.totalPriceMinor.toString(), reservationId: item.reservation?.id })),
      },
    };
  }

  private async createReservation(payload: Record<string, unknown>, context: IntegrationAdapterContext, adapter: IntegrationAdapter) {
    const recordId = typeof payload.externalReservationRecordId === "string" ? payload.externalReservationRecordId : undefined;
    const result = await adapter.createReservation(context, payload);
    if (recordId) await this.prisma.externalReservation.update({ where: { id: recordId }, data: { status: "ACTIVE", externalReservationId: result.externalId, responsePayload: result.data as Prisma.InputJsonValue, lastAttemptAt: new Date(), lastError: null } });
    return { externalReservationId: result.externalId, ...result.data };
  }

  private async releaseReservation(payload: Record<string, unknown>, context: IntegrationAdapterContext, adapter: IntegrationAdapter) {
    const recordId = typeof payload.externalReservationRecordId === "string" ? payload.externalReservationRecordId : undefined;
    const result = await adapter.releaseReservation(context, payload);
    if (recordId) await this.prisma.externalReservation.update({ where: { id: recordId }, data: { status: "RELEASED", responsePayload: result.data as Prisma.InputJsonValue, lastAttemptAt: new Date(), lastError: null } });
    return result.data;
  }

  private async processWebhook(connectionId: string, payload: Record<string, unknown>) {
    const eventId = typeof payload.webhookEventId === "string" ? payload.webhookEventId : undefined;
    if (!eventId) throw new PermanentIntegrationError("Webhook job does not reference an inbox event");
    const event = await this.prisma.integrationWebhookEvent.findFirst({ where: { id: eventId, connectionId } });
    if (!event) throw new NotFoundException("Integration webhook event not found");
    if (event.status === "PROCESSED") return { duplicate: true, eventId };
    await this.prisma.integrationWebhookEvent.update({ where: { id: eventId }, data: { status: "PROCESSING", attempt: { increment: 1 } } });
    await this.jobs.enqueue(connectionId, { type: "INCREMENTAL_SYNC", idempotencyKey: `webhook-sync:${event.id}`, payload: { webhookEventId: event.id, eventType: event.eventType }, maxAttempts: 5 }, "WEBHOOK");
    await this.prisma.integrationWebhookEvent.update({ where: { id: eventId }, data: { status: "PROCESSED", processedAt: new Date(), lastError: null } });
    return { eventId, eventType: event.eventType, incrementalSyncQueued: true };
  }
}
