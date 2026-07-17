import { BadRequestException, Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common";
import { supplierColumnMappingSchema, type ConfirmSupplierItemMatchInput, type CreateImportBatchInput, type SupplierColumnMappingInput } from "@marketplace/schemas";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../platform/prisma/prisma.service";
import { SupplierAccessService, type SupplierActorContext } from "../suppliers/supplier-access.service";
import { ImportFileParser } from "./import-file.parser";
import { normalizeCatalogText, rankVariants } from "./matching";
import { BackgroundQueueService } from "../../platform/jobs/background-queue.service";
import { FileUploadPolicyService } from "../../platform/security/file-upload-policy.service";

type RawRow = Record<string, unknown>;

function value(row: RawRow, column?: string) {
  return column ? String(row[column] ?? "").trim() : "";
}

function normalizeRow(row: RawRow, mapping: SupplierColumnMappingInput) {
  return {
    externalId: value(row, mapping.externalId),
    name: value(row, mapping.name),
    supplierSku: value(row, mapping.supplierSku) || null,
    gtin: value(row, mapping.gtin) || null,
    brand: value(row, mapping.brand) || null,
    manufacturer: value(row, mapping.manufacturer) || null,
    unit: value(row, mapping.unit) || null,
    priceMinor: value(row, mapping.priceMinor) || null,
    currency: value(row, mapping.currency).toUpperCase() || null,
    quantityOnHand: value(row, mapping.quantityOnHand) || null,
    lotNumber: value(row, mapping.lotNumber) || null,
    expirationDate: value(row, mapping.expirationDate) || null,
  };
}

function mappingKey(row: ReturnType<typeof normalizeRow>) {
  if (row.supplierSku) return `SKU:${normalizeCatalogText(row.supplierSku)}`;
  if (row.gtin) return `GTIN:${normalizeCatalogText(row.gtin)}`;
  return `NAME:${normalizeCatalogText(row.name)}`;
}

function lineComplianceStatus(row: ReturnType<typeof normalizeRow>, regulated = false) {
  const reasons: string[] = [];
  if (row.currency && row.currency !== "KZT") reasons.push("UNSUPPORTED_CURRENCY");
  if (row.expirationDate && !Number.isNaN(Date.parse(row.expirationDate)) && new Date(row.expirationDate) <= new Date()) reasons.push("EXPIRED_LOT");
  if (!row.priceMinor || !row.currency) reasons.push("PRICE_OR_CURRENCY_REQUIRED");
  if (regulated && !row.lotNumber) reasons.push("LOT_REQUIRED");
  if (reasons.includes("EXPIRED_LOT")) return { status: "EXPIRED", reasons };
  if (reasons.includes("UNSUPPORTED_CURRENCY")) return { status: "BLOCKED", reasons };
  if (reasons.length > 0) return { status: regulated ? "DOCUMENT_REQUIRED" : "REVIEW_REQUIRED", reasons };
  return { status: "READY", reasons: [] };
}

@Injectable()
export class ImportsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService, private readonly access: SupplierAccessService, private readonly fileParser: ImportFileParser, private readonly backgroundQueue: BackgroundQueueService, private readonly uploads: FileUploadPolicyService) {}

  onModuleInit() {
    this.backgroundQueue.register("imports.process", async (payload) => this.processBatch(
      String(payload.supplierOrganizationId ?? ""),
      String(payload.batchId ?? ""),
      { actorId: String(payload.actorId ?? ""), organizationId: String(payload.organizationId ?? "") },
    ));
  }

  async batches(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    return this.prisma.importBatch.findMany({ where: { supplierOrganizationId }, include: { source: true, _count: { select: { rows: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
  }

  async batch(supplierOrganizationId: string, batchId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, supplierOrganizationId }, include: { source: true, rows: { orderBy: { rowNumber: "asc" }, take: 200 } } });
    if (!batch) throw new NotFoundException("Import batch not found");
    return batch;
  }

  async createBatch(supplierOrganizationId: string, input: CreateImportBatchInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    await this.access.requireProfile(supplierOrganizationId);
    const source = await this.prisma.supplierDataSource.findFirst({ where: { id: input.sourceId, supplierOrganizationId } });
    if (!source) throw new NotFoundException("Supplier data source not found");
    let uploadAssetId: string | null = null;
    if (input.contentBase64) {
      const body = this.uploads.decodeBase64(input.contentBase64, 20_000_000);
      const allowedKind = input.fileType === "EXCEL" ? "XLSX" : input.fileType === "PDF" ? "PDF" : "CSV";
      const asset = await this.uploads.quarantine({ organizationId: supplierOrganizationId, actorId: context.actorId, purpose: "supplier-import", fileName: input.fileName, body, allowedKinds: [allowedKind], maxBytes: 20_000_000 });
      uploadAssetId = asset.id;
    }
    const parsedFile = await this.fileParser.parseWithDiagnostics(input);
    const rows = parsedFile.rows;
    if (rows.length === 0 && input.fileType !== "PDF") throw new BadRequestException("Import does not contain data rows");
    const checksum = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          supplierOrganizationId,
          sourceId: input.sourceId,
          fileName: input.fileName,
          fileType: input.fileType,
          checksum,
          status: parsedFile.requiresReview ? "REVIEW_REQUIRED" : "MAPPED",
          columnMapping: input.columnMapping as Prisma.InputJsonValue,
          extractionMetadata: parsedFile.metadata as Prisma.InputJsonValue,
          totalRows: rows.length,
          rows: { create: rows.map((rawData, index) => ({ rowNumber: index + 2, rawData: rawData as Prisma.InputJsonValue })) },
        },
        include: { _count: { select: { rows: true } } },
      });
      if (uploadAssetId) await tx.uploadAsset.update({ where: { id: uploadAssetId }, data: { metadata: { importBatchId: batch.id, sourceId: batch.sourceId } } });
      await tx.auditLog.create({ data: { ...context, action: "import.batch.created", entityType: "ImportBatch", entityId: batch.id, after: batch } });
      await tx.outboxEvent.create({ data: { aggregateType: "ImportBatch", aggregateId: batch.id, eventType: "ImportBatchCreated", payload: { supplierOrganizationId, batchId: batch.id, totalRows: rows.length } } });
      return batch;
    }, { maxWait: 15_000, timeout: 60_000 });
  }

  async enqueueBatch(supplierOrganizationId: string, batchId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, supplierOrganizationId }, select: { id: true } });
    if (!batch) throw new NotFoundException("Import batch not found");
    const queued = await this.backgroundQueue.enqueue("imports.process", { supplierOrganizationId, batchId, actorId: context.actorId, organizationId: context.organizationId }, { jobId: `import-${batchId}` });
    return queued ? { queued: true, batchId } : { queued: false, batchId, result: await this.processBatch(supplierOrganizationId, batchId, context) };
  }

  async processBatch(supplierOrganizationId: string, batchId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const batch = await this.prisma.importBatch.findFirst({ where: { id: batchId, supplierOrganizationId }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
    if (!batch) throw new NotFoundException("Import batch not found");
    if (batch.status === "REVIEW_REQUIRED") throw new BadRequestException("Import requires OCR or manual mapping before processing");
    const mappingResult = supplierColumnMappingSchema.safeParse(batch.columnMapping);
    if (!mappingResult.success) throw new BadRequestException("Import batch column mapping is invalid");
    const variants = await this.prisma.productVariant.findMany({ include: { product: { include: { brand: true, manufacturer: true } } } });
    const defaultWarehouse = await this.prisma.warehouse.findFirst({ where: { supplierOrganizationId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
    const memories = await this.prisma.supplierMappingMemory.findMany({ where: { supplierOrganizationId, status: "ACTIVE" }, orderBy: { version: "desc" } });
    const memoryByKey = new Map<string, typeof memories[number]>();
    for (const memory of memories) if (!memoryByKey.has(memory.externalKey)) memoryByKey.set(memory.externalKey, memory);
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    await this.prisma.importBatch.update({ where: { id: batch.id }, data: { status: "PROCESSING", startedAt: new Date(), completedAt: null } });
    let processedRows = 0;
    let errorRows = 0;
    let cursor = 0;
    const processRow = async (row: (typeof batch.rows)[number]) => {
        const normalized = normalizeRow(row.rawData as RawRow, mappingResult.data);
        if (!normalized.externalId || !normalized.name) {
          errorRows += 1;
          await this.prisma.importRow.update({ where: { id: row.id }, data: { status: "REJECTED", errorCode: "REQUIRED_VALUE_MISSING", errorMessage: "External ID and name are required", normalizedData: normalized as Prisma.InputJsonValue } });
          return;
        }
        try {
          await this.prisma.$transaction(async (tx) => {
            const item = await tx.supplierExternalItem.upsert({
              where: { sourceId_externalId: { sourceId: batch.sourceId, externalId: normalized.externalId } },
              update: { importRowId: row.id, supplierSku: normalized.supplierSku, name: normalized.name, normalizedName: normalizeCatalogText(normalized.name), brandText: normalized.brand, manufacturerText: normalized.manufacturer, gtin: normalized.gtin, unitText: normalized.unit, rawData: row.rawData as Prisma.InputJsonValue },
              create: { supplierOrganizationId, sourceId: batch.sourceId, importRowId: row.id, externalId: normalized.externalId, supplierSku: normalized.supplierSku, name: normalized.name, normalizedName: normalizeCatalogText(normalized.name), brandText: normalized.brand, manufacturerText: normalized.manufacturer, gtin: normalized.gtin, unitText: normalized.unit, rawData: row.rawData as Prisma.InputJsonValue },
            });
            const memory = memoryByKey.get(mappingKey(normalized));
            const rememberedVariant = memory ? variantById.get(memory.productVariantId) : undefined;
            const candidates = rememberedVariant && memory ? [{ variant: rememberedVariant, score: Number(memory.confidence), reasons: ["mapping_memory", ...(Array.isArray(memory.reasons) ? memory.reasons.map(String) : [])] }] : rankVariants(item, variants);
            await tx.supplierItemMatchCandidate.deleteMany({ where: { externalItemId: item.id, status: "PROPOSED" } });
            const best = candidates[0];
            const lineCompliance = lineComplianceStatus(normalized, Boolean(best?.variant.product.regulatoryClass));
            await tx.supplierExternalItem.update({ where: { id: item.id }, data: { complianceStatus: lineCompliance.status, complianceReasons: lineCompliance.reasons } });
            const exactMatch = Boolean(best && (best.reasons.includes("exact_gtin") || (best.reasons.includes("exact_name") && best.score >= 0.85) || (best.reasons.includes("exact_sku") && best.score >= 0.8)));
            if (exactMatch && best) {
              await tx.supplierItemMatchCandidate.updateMany({ where: { externalItemId: item.id, status: "CONFIRMED" }, data: { status: "REJECTED" } });
              await tx.supplierItemMatchCandidate.upsert({
                where: { externalItemId_productVariantId: { externalItemId: item.id, productVariantId: best.variant.id } },
                update: { score: best.score, reasons: best.reasons, status: "CONFIRMED" },
                create: { externalItemId: item.id, productVariantId: best.variant.id, score: best.score, reasons: best.reasons, status: "CONFIRMED" },
              });
              await tx.supplierExternalItem.update({ where: { id: item.id }, data: { matchedVariantId: best.variant.id } });
              const key = mappingKey(normalized);
              const currentMemory = await tx.supplierMappingMemory.findFirst({ where: { supplierOrganizationId, externalKey: key, status: "ACTIVE" }, orderBy: { version: "desc" } });
              if (!currentMemory || currentMemory.productVariantId !== best.variant.id) {
                if (currentMemory) await tx.supplierMappingMemory.update({ where: { id: currentMemory.id }, data: { status: "REVOKED" } });
                await tx.supplierMappingMemory.create({ data: { supplierOrganizationId, sourceId: batch.sourceId, externalKey: key, externalId: normalized.externalId, supplierSku: normalized.supplierSku, productVariantId: best.variant.id, version: (currentMemory?.version ?? 0) + 1, confidence: best.score, reasons: best.reasons } });
              }
              const existingOffer = await tx.supplierOffer.findFirst({ where: { supplierOrganizationId, productVariantId: best.variant.id, saleUnitId: best.variant.saleUnitId ?? null } });
              const offer = existingOffer ?? await tx.supplierOffer.create({ data: {
                supplierOrganizationId,
                productVariantId: best.variant.id,
                saleUnitId: best.variant.saleUnitId,
                sourceId: batch.sourceId,
                supplierSku: normalized.supplierSku,
                baseUnitsPerSaleUnit: 1,
                minimumOrderQuantity: 1,
                orderIncrement: 1,
                confirmationMode: "MANUAL",
                sourceType: "IMPORT",
                externalId: normalized.externalId,
                status: "DRAFT",
                publication: { create: {} },
              } });
              if (existingOffer) await tx.supplierOffer.update({ where: { id: existingOffer.id }, data: { sourceId: batch.sourceId, supplierSku: normalized.supplierSku, externalId: normalized.externalId, status: existingOffer.status === "BLOCKED" ? "BLOCKED" : "DRAFT", version: { increment: 1 } } });
              const amountMinor = Number(normalized.priceMinor);
              if (Number.isFinite(amountMinor) && amountMinor >= 0 && /^[A-Z]{3}$/.test(normalized.currency ?? "")) {
                await tx.offerPrice.updateMany({ where: { offerId: offer.id, status: "ACTIVE" }, data: { status: "INACTIVE", validTo: new Date() } });
                await tx.offerPrice.create({ data: { offerId: offer.id, amountMinor: Math.trunc(amountMinor), currency: normalized.currency!, includesVat: true, source: "IMPORT", freshnessExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
                await tx.offerPriceHistory.create({ data: { offerId: offer.id, amountMinor: Math.trunc(amountMinor), currency: normalized.currency!, includesVat: true, source: "IMPORT", reason: "Auto-created from exact supplier import match" } });
              }
              const quantity = Number(normalized.quantityOnHand);
              if (defaultWarehouse && Number.isFinite(quantity) && quantity >= 0) {
                await tx.inventoryBalance.upsert({ where: { supplierOrganizationId_warehouseId_productVariantId: { supplierOrganizationId, warehouseId: defaultWarehouse.id, productVariantId: best.variant.id } }, update: { offerId: offer.id, quantityOnHand: quantity, quantityReserved: 0, safetyStock: 0, quantityAvailable: quantity, availabilityStatus: quantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK", freshnessStatus: "FRESH", source: "IMPORT", externalUpdatedAt: new Date(), lastSuccessfulSyncAt: new Date(), freshnessExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), version: { increment: 1 } }, create: { supplierOrganizationId, warehouseId: defaultWarehouse.id, productVariantId: best.variant.id, offerId: offer.id, quantityOnHand: quantity, quantityReserved: 0, safetyStock: 0, quantityAvailable: quantity, availabilityStatus: quantity > 0 ? "IN_STOCK" : "OUT_OF_STOCK", freshnessStatus: "FRESH", source: "IMPORT", externalUpdatedAt: new Date(), lastSuccessfulSyncAt: new Date(), freshnessExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
              }
              await tx.importRow.update({ where: { id: row.id }, data: { status: "MATCHED", normalizedData: normalized as Prisma.InputJsonValue, errorCode: null, errorMessage: null } });
            } else if (candidates.length > 0) {
              await tx.supplierItemMatchCandidate.createMany({ data: candidates.map(({ variant, score, reasons }) => ({ externalItemId: item.id, productVariantId: variant.id, score, reasons })) });
              await tx.importRow.update({ where: { id: row.id }, data: { status: "MATCH_PENDING", normalizedData: normalized as Prisma.InputJsonValue, errorCode: null, errorMessage: null } });
            } else {
              await tx.productCandidate.upsert({
                where: { externalItemId: item.id },
                update: { proposedName: item.name, proposedSku: item.supplierSku, proposedGtin: item.gtin, proposedBrand: item.brandText },
                create: { supplierOrganizationId, externalItemId: item.id, proposedName: item.name, proposedSku: item.supplierSku, proposedGtin: item.gtin, proposedBrand: item.brandText },
              });
              await tx.importRow.update({ where: { id: row.id }, data: { status: "MATCH_PENDING", normalizedData: normalized as Prisma.InputJsonValue, errorCode: null, errorMessage: null } });
            }
          }, { maxWait: 15_000, timeout: 45_000 });
          processedRows += 1;
        } catch (error) {
          errorRows += 1;
          const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown row processing error";
          await this.prisma.importRow.update({ where: { id: row.id }, data: { status: "REJECTED", errorCode: "PROCESSING_ERROR", errorMessage: message, normalizedData: normalized as Prisma.InputJsonValue } });
        }
    };
    const workers = Array.from({ length: Math.min(8, batch.rows.length) }, async () => {
      while (cursor < batch.rows.length) {
        const row = batch.rows[cursor++];
        if (row) await processRow(row);
      }
    });
    await Promise.all(workers);
    return this.prisma.$transaction(async (tx) => {
      const completed = await tx.importBatch.update({
        where: { id: batch.id },
        data: { status: errorRows > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED", processedRows, errorRows, completedAt: new Date() },
      });
      await tx.auditLog.create({ data: { ...context, action: "import.batch.processed", entityType: "ImportBatch", entityId: batch.id, after: completed } });
      await tx.outboxEvent.create({ data: { aggregateType: "ImportBatch", aggregateId: batch.id, eventType: "ImportBatchProcessed", payload: { supplierOrganizationId, batchId: batch.id, processedRows, errorRows } } });
      return completed;
    }, { maxWait: 15_000, timeout: 45_000 });
  }

  async externalItems(supplierOrganizationId: string, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    return this.prisma.supplierExternalItem.findMany({
      where: { supplierOrganizationId },
      include: { importRow: true, productCandidate: true, matchedVariant: { include: { product: true } }, matchCandidates: { include: { productVariant: { include: { product: { include: { brand: true, manufacturer: true } } } } }, orderBy: { score: "desc" } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async confirmMatch(supplierOrganizationId: string, externalItemId: string, input: ConfirmSupplierItemMatchInput, context: SupplierActorContext) {
    await this.access.assertCanManage(supplierOrganizationId, context);
    const [item, variant] = await Promise.all([
      this.prisma.supplierExternalItem.findFirst({ where: { id: externalItemId, supplierOrganizationId } }),
      this.prisma.productVariant.findUnique({ where: { id: input.productVariantId } }),
    ]);
    if (!item) throw new NotFoundException("Supplier external item not found");
    if (!variant) throw new NotFoundException("Product variant not found");
    return this.prisma.$transaction(async (tx) => {
      await tx.supplierItemMatchCandidate.updateMany({ where: { externalItemId }, data: { status: "REJECTED" } });
      await tx.supplierItemMatchCandidate.upsert({
        where: { externalItemId_productVariantId: { externalItemId, productVariantId: input.productVariantId } },
        update: { status: "CONFIRMED" },
        create: { externalItemId, productVariantId: input.productVariantId, score: 1, reasons: ["manual_confirmation"], status: "CONFIRMED" },
      });
      const matched = await tx.supplierExternalItem.update({ where: { id: externalItemId }, data: { matchedVariantId: input.productVariantId } });
      const key = item.supplierSku ? `SKU:${normalizeCatalogText(item.supplierSku)}` : item.gtin ? `GTIN:${normalizeCatalogText(item.gtin)}` : `NAME:${item.normalizedName}`;
      const currentMemory = await tx.supplierMappingMemory.findFirst({ where: { supplierOrganizationId, externalKey: key, status: "ACTIVE" }, orderBy: { version: "desc" } });
      if (!currentMemory || currentMemory.productVariantId !== input.productVariantId) {
        if (currentMemory) await tx.supplierMappingMemory.update({ where: { id: currentMemory.id }, data: { status: "REVOKED" } });
        await tx.supplierMappingMemory.create({ data: { supplierOrganizationId, externalKey: key, externalId: item.externalId, supplierSku: item.supplierSku, productVariantId: input.productVariantId, version: (currentMemory?.version ?? 0) + 1, confidence: 1, reasons: ["manual_confirmation"], createdById: context.actorId } });
      }
      await tx.productCandidate.updateMany({ where: { externalItemId, status: "PENDING" }, data: { status: "REJECTED", rejectionReason: "Matched to an existing product variant", decidedById: context.actorId, decidedAt: new Date() } });
      if (item.importRowId) await tx.importRow.update({ where: { id: item.importRowId }, data: { status: "MATCHED" } });
      await tx.auditLog.create({ data: { ...context, action: "matching.item.confirmed", entityType: "SupplierExternalItem", entityId: externalItemId, before: item, after: matched } });
      await tx.outboxEvent.create({ data: { aggregateType: "SupplierExternalItem", aggregateId: externalItemId, eventType: "SupplierItemMatched", payload: { supplierOrganizationId, externalItemId, productVariantId: input.productVariantId } } });
      return matched;
    });
  }
}
