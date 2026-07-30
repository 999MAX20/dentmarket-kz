import { describe, expect, it } from "vitest";
import { addCartItemSchema, approveProductCandidateSchema, captureMockPaymentSchema, capturePaymentSchema, checkoutCartSchema, compareOffersSchema, confirmSupplierOrderSchema, createApprovalPolicySchema, createComplianceRuleSchema, createContractPriceSchema, createDataOverrideSchema, createDeliveryRuleSchema, createDocumentTemplateSchema, createImportBatchSchema, createIntegrationBindingSchema, createIntegrationConnectionSchema, createInventoryLotSchema, createInventoryReservationSchema, createInvitationSchema, createNotificationSchema, createOfferPriceTierSchema, createOrganizationCredentialSchema, createOrganizationSchema, createPaymentIntentSchema, createProductPackagingSchema, createProductSchema, createRefundSchema, createRoleSchema, createShipmentSchema, enqueueIntegrationJobSchema, evaluateApprovalSchema, ledgerQuerySchema, resolveOfferPriceSchema, searchCatalogSchema, setAttributeValueSchema, setInventoryBalanceSchema, switchOrganizationIndustrySchema, updateProductSchema, upsertCategoryAttributeRuleSchema, upsertIntegrationMappingSchema } from "./index.js";
import { createRegistrationIntentSchema, mfaCodeSchema, socialExchangeSchema, updateConnectorReadinessSchema } from "./index.js";
import { decideProductCorrectionSchema, submitProductCorrectionSchema } from "./index.js";

describe("createOrganizationSchema", () => {
  it("accepts a multi-capability Kazakhstan organization", () => {
    const result = createOrganizationSchema.safeParse({
      legalName: "ТОО Dental Supply Kazakhstan",
      displayName: "Dental Supply",
      bin: "123456789012",
      capabilities: ["SUPPLIER", "IMPORTER", "SERVICE_PROVIDER"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid BIN", () => {
    const result = createOrganizationSchema.safeParse({
      legalName: "ТОО Поставщик",
      displayName: "Поставщик",
      bin: "123",
      capabilities: ["SUPPLIER"],
    });
    expect(result.success).toBe(false);
  });
});

describe("self-registration schemas", () => {
  it("normalizes email and preserves explicit legal consent", () => {
    const result = createRegistrationIntentSchema.parse({
      email: "Owner@Dental.KZ",
      ownerDisplayName: "Айжан Садыкова",
      legalName: "ТОО Dental KZ",
      organizationDisplayName: "Dental KZ",
      bin: "123456789012",
      capability: "SUPPLIER",
      termsAccepted: true,
      privacyAccepted: true,
      idempotencyKey: "registration-2026-001",
    });
    expect(result).toMatchObject({ email: "owner@dental.kz", marketingConsent: false, capability: "SUPPLIER", industryCode: "dentistry-kz" });
  });

  it("rejects missing consent, invalid BIN and short registration handoff tokens", () => {
    expect(createRegistrationIntentSchema.safeParse({ email: "owner@dental.kz", ownerDisplayName: "Owner", legalName: "ТОО Dental", organizationDisplayName: "Dental", bin: "123", capability: "BUYER", termsAccepted: false, privacyAccepted: true, idempotencyKey: "registration-2026-002" }).success).toBe(false);
    expect(socialExchangeSchema.safeParse({ provider: "GOOGLE", idToken: "x".repeat(40), registrationToken: "too-short" }).success).toBe(false);
  });
});

describe("industry scope schemas", () => {
  it("accepts a valid industry switch code", () => {
    expect(switchOrganizationIndustrySchema.parse({ industryCode: "beauty-kz" }).industryCode).toBe("beauty-kz");
  });

  it("rejects unsafe industry codes", () => {
    expect(switchOrganizationIndustrySchema.safeParse({ industryCode: "Beauty KZ" }).success).toBe(false);
  });
});

describe("product correction schemas", () => {
  it("accepts an evidence-backed supplier correction", () => {
    const result = submitProductCorrectionSchema.parse({
      productId: "00000000-0000-4000-8000-000000000010",
      field: "DESCRIPTION",
      proposedValue: "Композитный материал Filtek Z250, оттенок A2.",
      reason: "Описание сверено с официальным каталогом производителя.",
      evidenceUrl: "https://manufacturer.example/catalog/filtek-z250",
    });
    expect(result.field).toBe("DESCRIPTION");
  });

  it("requires a reason and an explicit moderation comment", () => {
    expect(submitProductCorrectionSchema.safeParse({ productId: "00000000-0000-4000-8000-000000000010", field: "DESCRIPTION", proposedValue: "Текст", reason: "коротко" }).success).toBe(false);
    expect(decideProductCorrectionSchema.safeParse({ acceptedValue: "Текст", moderatorComment: "" }).success).toBe(false);
  });
});

describe("iteration 1A schemas", () => {
  it("normalizes invitation email", () => {
    const result = createInvitationSchema.parse({ email: "Operator@Example.KZ", roleIds: [] });
    expect(result.email).toBe("operator@example.kz");
    expect(result.expiresInHours).toBe(72);
  });

  it("requires product classification", () => {
    const result = createProductSchema.safeParse({
      canonicalName: "Перчатки нитриловые",
      slug: "nitrile-gloves",
      productType: "consumable",
      industryIds: [],
      categoryIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty permission roles", () => {
    expect(createRoleSchema.safeParse({ code: "buyer", name: "Закупщик", permissionCodes: [] }).success).toBe(false);
  });

  it("validates attribute ranges", () => {
    const result = setAttributeValueSchema.safeParse({ attributeId: "00000000-0000-4000-8000-000000000010", value: { min: 20, max: 10 } });
    expect(result.success).toBe(false);
  });

  it("defaults category attribute rules safely", () => {
    const result = upsertCategoryAttributeRuleSchema.parse({ attributeId: "00000000-0000-4000-8000-000000000010" });
    expect(result).toMatchObject({ isRequired: false, isVariant: false, sortOrder: 0 });
  });

  it("validates a deterministic approval policy", () => {
    const result = createApprovalPolicySchema.parse({
      name: "Согласование крупных заказов",
      status: "ACTIVE",
      conditions: { amountMinMinor: 1_000_000, currencies: ["KZT"] },
      approvalSteps: [{ sequence: 1, approverRoleCodes: ["finance_manager"] }],
    });
    expect(result).toMatchObject({ priority: 100, approvalSteps: [{ minApprovals: 1 }] });
  });

  it("rejects impossible approval steps", () => {
    const result = createApprovalPolicySchema.safeParse({
      name: "Невалидная политика",
      conditions: {},
      approvalSteps: [{ sequence: 1, approverRoleCodes: ["finance_manager"], minApprovals: 2 }],
    });
    expect(result.success).toBe(false);
  });

  it("requires optimistic-lock version and a product change", () => {
    expect(updateProductSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateProductSchema.safeParse({ version: 1, status: "UNDER_REVIEW" }).success).toBe(true);
  });

  it("normalizes approval evaluation defaults", () => {
    expect(evaluateApprovalSchema.parse({ amountMinor: 500_000, currency: "KZT" })).toMatchObject({ categoryIds: [], urgent: false });
  });

  it("accepts mapped supplier rows while preserving raw values", () => {
    const result = createImportBatchSchema.parse({
      sourceId: "00000000-0000-4000-8000-000000000022",
      fileName: "price.csv",
      fileType: "CSV",
      columnMapping: { externalId: "id", name: "name", priceMinor: "price" },
      rows: [{ id: "row-1", name: "Композит A2", price: 125000 }],
    });
    expect(result.rows?.[0]).toMatchObject({ price: 125000 });
  });

  it("protects inventory invariants", () => {
    expect(setInventoryBalanceSchema.safeParse({ warehouseId: "00000000-0000-4000-8000-000000000021", productVariantId: "00000000-0000-4000-8000-000000000013", quantityOnHand: 5, quantityReserved: 4, safetyStock: 2 }).success).toBe(false);
    expect(createInventoryReservationSchema.safeParse({ quantity: 1, idempotencyKey: "reserve-0001" }).success).toBe(true);
  });

  it("validates lot traceability dates", () => {
    const result = createInventoryLotSchema.safeParse({
      inventoryBalanceId: "00000000-0000-4000-8000-000000000031",
      lotNumber: "LOT-001",
      quantityOnHand: 10,
      manufactureDate: "2027-01-01",
      expirationDate: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("requires full classification when approving a product candidate", () => {
    expect(approveProductCandidateSchema.safeParse({ canonicalName: "Новый материал", slug: "new-material", productType: "material", industryIds: [], categoryIds: [] }).success).toBe(false);
  });

  it("rejects inverted price tiers", () => {
    expect(createOfferPriceTierSchema.safeParse({ minimumQuantity: 10, maximumQuantity: 5, unitPriceMinor: 1000, currency: "KZT" }).success).toBe(false);
  });

  it("defaults contract and resolver inputs", () => {
    const contract = createContractPriceSchema.parse({ buyerOrganizationId: "00000000-0000-4000-8000-000000000001", amountMinor: 1000, currency: "KZT" });
    expect(contract).toMatchObject({ minimumQuantity: 1, priority: 100 });
    expect(resolveOfferPriceSchema.parse({ quantity: 10 })).toMatchObject({ quantity: 10 });
  });

  it("validates cart, checkout and payment idempotency inputs", () => {
    const offerId = "00000000-0000-4000-8000-000000000040";
    expect(addCartItemSchema.parse({ offerId, quantity: 2 })).toMatchObject({ quantity: 2 });
    expect(checkoutCartSchema.safeParse({ idempotencyKey: "short" }).success).toBe(false);
    expect(createPaymentIntentSchema.parse({ idempotencyKey: "payment-0001" })).toMatchObject({ providerCode: "MOCK" });
    expect(captureMockPaymentSchema.safeParse({ idempotencyKey: "capture-0001" }).success).toBe(true);
    expect(capturePaymentSchema.safeParse({ idempotencyKey: "capture-0002", allocationIds: [offerId, offerId] }).success).toBe(true);
    expect(createRefundSchema.safeParse({ amountMinor: 1000, reason: "Частичный возврат", idempotencyKey: "refund-0001" }).success).toBe(true);
    expect(createRefundSchema.safeParse({ amountMinor: 0, reason: "Ошибка", idempotencyKey: "refund-0002" }).success).toBe(false);
  });

  it("allows offer comparison to target one exact product variant", () => {
    const result = compareOffersSchema.parse({
      buyerOrganizationId: "00000000-0000-4000-8000-000000000001",
      productId: "00000000-0000-4000-8000-000000000010",
      variantId: "00000000-0000-4000-8000-000000000011",
      quantity: 1,
    });
    expect(result.variantId).toBe("00000000-0000-4000-8000-000000000011");
  });

  it("rejects duplicate supplier-order decisions", () => {
    const itemId = "00000000-0000-4000-8000-000000000060";
    expect(confirmSupplierOrderSchema.safeParse({ decisions: [{ itemId, acceptedQuantity: 1 }, { itemId, acceptedQuantity: 0 }] }).success).toBe(false);
  });

  it("requires a ledger reference type for a reference id", () => {
    expect(ledgerQuerySchema.safeParse({ referenceId: "payment-1" }).success).toBe(false);
    expect(ledgerQuerySchema.parse({ referenceType: "PaymentIntent", referenceId: "payment-1" })).toMatchObject({ limit: 50 });
  });

  it("enforces provider-specific integration credentials and modes", () => {
    expect(createIntegrationConnectionSchema.safeParse({ provider: "MOYSKLAD", mode: "API", displayName: "Основной склад" }).success).toBe(false);
    expect(createIntegrationConnectionSchema.safeParse({ provider: "MOYSKLAD", mode: "API", displayName: "Основной склад", credentials: { accessToken: "secret-token" } }).success).toBe(true);
    expect(createIntegrationConnectionSchema.safeParse({ provider: "ONE_C", mode: "API", displayName: "1С Бухгалтерия" }).success).toBe(false);
    expect(createIntegrationConnectionSchema.safeParse({ provider: "ONE_C", mode: "AGENT", displayName: "1С Бухгалтерия" }).success).toBe(true);
  });

  it("allows one integration binding scope and durable idempotent jobs", () => {
    const warehouseId = "00000000-0000-4000-8000-000000000021";
    const offerId = "00000000-0000-4000-8000-000000000040";
    expect(createIntegrationBindingSchema.safeParse({ dataType: "INVENTORY", warehouseId, offerId }).success).toBe(false);
    expect(createIntegrationBindingSchema.parse({ dataType: "INVENTORY", warehouseId })).toMatchObject({ priority: 100 });
    expect(enqueueIntegrationJobSchema.parse({ type: "INCREMENTAL_SYNC", idempotencyKey: "sync-2026-001" })).toMatchObject({ maxAttempts: 5 });
  });

  it("requires internal entities for warehouse and variant mappings", () => {
    expect(upsertIntegrationMappingSchema.safeParse({ entityType: "WAREHOUSE", externalId: "store-1" }).success).toBe(false);
    expect(upsertIntegrationMappingSchema.safeParse({ entityType: "WAREHOUSE", externalId: "store-1", internalId: "00000000-0000-4000-8000-000000000021" }).success).toBe(true);
    expect(upsertIntegrationMappingSchema.safeParse({ entityType: "PRICE_TYPE", externalId: "b2b", mappingData: { currency: "KZT" } }).success).toBe(true);
  });

  it("validates delivery pricing and shipment windows", () => {
    expect(createDeliveryRuleSchema.safeParse({ name: "Алматы", method: "SUPPLIER_CITY", priceType: "FIXED", status: "ACTIVE" }).success).toBe(false);
    expect(createDeliveryRuleSchema.safeParse({ name: "Алматы", method: "SUPPLIER_CITY", priceType: "FIXED", fixedAmountMinor: 250000, status: "ACTIVE" }).success).toBe(true);
    expect(createShipmentSchema.safeParse({ warehouseId: "00000000-0000-4000-8000-000000000021", method: "CARRIER", recipientName: "Получатель", deliveryWindowStart: "2026-07-18T12:00:00.000Z", deliveryWindowEnd: "2026-07-18T10:00:00.000Z", items: [{ supplierOrderItemId: "00000000-0000-4000-8000-000000000060", quantity: 1 }] }).success).toBe(false);
  });

  it("validates versioned document templates and credential files", () => {
    expect(createDocumentTemplateSchema.safeParse({ code: "ORDER.SPEC", version: 1, kind: "ORDER_SPECIFICATION", name: "Спецификация", templateBody: "Заказ {{order.number}}", requiredSignatureCount: 2 }).success).toBe(true);
    expect(createDocumentTemplateSchema.safeParse({ code: "bad code", version: 0, kind: "INVOICE", name: "Счёт", templateBody: "" }).success).toBe(false);
    expect(createOrganizationCredentialSchema.safeParse({ type: "MEDICAL_LICENSE", number: "L-1", fileName: "license.pdf" }).success).toBe(false);
  });

  it("requires dated versioned compliance rules", () => {
    expect(createComplianceRuleSchema.safeParse({ code: "MEDICAL.REG", version: 1, name: "Регистрация", riskLevel: "ORANGE", decision: "MANUAL_REVIEW", effectiveFrom: "2026-07-16T00:00:00.000Z", requiredCredentialTypes: ["WHOLESALE_LICENSE"] }).success).toBe(true);
    expect(createComplianceRuleSchema.safeParse({ code: "MEDICAL.REG", version: 1, name: "Регистрация", riskLevel: "RED", decision: "BLOCKED", effectiveFrom: "2027-01-01T00:00:00.000Z", effectiveTo: "2026-01-01T00:00:00.000Z" }).success).toBe(false);
  });

  it("defaults durable notification delivery fields", () => {
    const result = createNotificationSchema.parse({ recipientOrganizationId: "00000000-0000-4000-8000-000000000001", eventType: "ShipmentStatusChanged", subject: "Доставка", body: "Заказ передан курьеру", idempotencyKey: "notification-0001" });
    expect(result).toMatchObject({ channel: "IN_APP", priority: "NORMAL" });
  });

  it("validates packaging coefficients and scoped manual overrides", () => {
    expect(createProductPackagingSchema.safeParse({ unitId: "00000000-0000-4000-8000-000000000001", code: "pack-100", name: "Упаковка 100", level: "SALE", quantityInBaseUnit: 100, netWeightGrams: 600, grossWeightGrams: 550 }).success).toBe(false);
    expect(createDataOverrideSchema.safeParse({ target: "PRICE", offerId: "00000000-0000-4000-8000-000000000150", mode: "UNTIL_DATE", value: { amountMinor: 450000 }, reason: "Акция" }).success).toBe(false);
    expect(createDataOverrideSchema.safeParse({ target: "INVENTORY", inventoryBalanceId: "00000000-0000-4000-8000-000000000152", mode: "UNTIL_NEXT_SYNC", value: { quantityOnHand: 50 }, reason: "Инвентаризация" }).success).toBe(true);
  });

  it("parses marketplace search filters without float money assumptions", () => {
    const result = searchCatalogSchema.parse({ buyerOrganizationId: "00000000-0000-4000-8000-000000000030", q: "перчатки", inStock: "true", maxNormalizedPriceMinor: "6000", unit: "шт", packaging: "100 шт", deliveryMethod: "CARRIER" });
    expect(result).toMatchObject({ inStock: true, maxNormalizedPriceMinor: 6000, unit: "шт", packaging: "100 шт", deliveryMethod: "CARRIER", sort: "RELEVANCE", limit: 24 });
  });

  it("accepts TOTP and formatted recovery codes only", () => {
    expect(mfaCodeSchema.safeParse({ code: "123456" }).success).toBe(true);
    expect(mfaCodeSchema.safeParse({ code: "AB12-CD34-EF56" }).success).toBe(true);
    expect(mfaCodeSchema.safeParse({ code: "12345" }).success).toBe(false);
  });

  it("validates auditable connector readiness updates", () => {
    expect(updateConnectorReadinessSchema.safeParse({}).success).toBe(false);
    expect(updateConnectorReadinessSchema.safeParse({ goLiveStatus: "LIVE_VERIFIED", environment: "REAL", lastVerifiedAt: "2026-07-17T12:00:00.000Z", evidence: ["real tenant order cycle #42"] }).success).toBe(true);
    expect(updateConnectorReadinessSchema.safeParse({ directions: { ORDER: "WRITE", UNKNOWN: "READ" } }).success).toBe(false);
  });
});
