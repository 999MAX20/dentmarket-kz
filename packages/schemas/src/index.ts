import { z } from "zod";

export * from "./commercial.js";
export * from "./trust-commerce.js";

export const organizationCapabilitySchema = z.enum([
  "BUYER",
  "SUPPLIER",
  "IMPORTER",
  "LOGISTICS_PROVIDER",
  "SERVICE_PROVIDER",
  "MARKETPLACE_OPERATOR",
  "PAYMENT_PARTNER",
]);

export const createOrganizationSchema = z.object({
  legalName: z.string().trim().min(2).max(240),
  displayName: z.string().trim().min(2).max(160),
  bin: z.string().regex(/^\d{12}$/, "БИН должен содержать 12 цифр"),
  capabilities: z.array(organizationCapabilitySchema).min(1),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const createInvitationSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  roleIds: z.array(z.uuid()).max(20).default([]),
  expiresInHours: z.number().int().min(1).max(24 * 30).default(72),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(256),
  displayName: z.string().trim().min(2).max(160),
});

export const createCategorySchema = z.object({
  industryId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  code: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  nameRu: z.string().trim().min(2).max(160),
  nameKk: z.string().trim().min(2).max(160),
});

export const createProductSchema = z.object({
  canonicalName: z.string().trim().min(3).max(240),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,159}$/),
  productType: z.string().trim().min(2).max(80),
  brandId: z.uuid().nullable().optional(),
  manufacturerId: z.uuid().nullable().optional(),
  manufacturerSku: z.string().trim().max(120).nullable().optional(),
  gtin: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
  baseUnitId: z.uuid().nullable().optional(),
  industryIds: z.array(z.uuid()).min(1),
  categoryIds: z.array(z.uuid()).min(1),
});

export const createVariantSchema = z.object({
  sku: z.string().trim().max(120).nullable().optional(),
  gtin: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
  saleUnitId: z.uuid().nullable().optional(),
  packageQuantity: z.number().positive().nullable().optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const createRoleSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{2,62}$/),
  name: z.string().trim().min(2).max(120),
  permissionCodes: z.array(z.string().trim().min(3).max(120)).min(1).max(100),
});

export const assignMembershipRoleSchema = z.object({ roleId: z.uuid() });

export const updateMembershipSchema = z.object({
  title: z.string().trim().min(2).max(120).nullable().optional(),
  status: z.enum(["ACTIVE", "BLOCKED", "REVOKED"]).optional(),
});

export const createAttributeDefinitionSchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,62}$/),
  nameRu: z.string().trim().min(2).max(160),
  nameKk: z.string().trim().min(2).max(160),
  valueType: z.enum(["TEXT", "LONG_TEXT", "INTEGER", "DECIMAL", "BOOLEAN", "DATE", "DATETIME", "OPTION", "MULTI_OPTION", "RANGE", "NUMBER_WITH_UNIT"]),
  groupId: z.uuid().nullable().optional(),
  unitId: z.uuid().nullable().optional(),
  isSearchable: z.boolean().default(false),
  isFilterable: z.boolean().default(false),
  validation: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const setAttributeValueSchema = z.object({
  attributeId: z.uuid(),
  value: z.union([
    z.string().max(10_000),
    z.number(),
    z.boolean(),
    z.object({ optionId: z.uuid() }),
    z.object({ optionIds: z.array(z.uuid()).min(1) }),
    z.object({ min: z.number(), max: z.number() }).refine((value) => value.min <= value.max, "Range minimum must not exceed maximum"),
    z.object({ amount: z.number(), unitId: z.uuid() }),
  ]),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type AssignMembershipRoleInput = z.infer<typeof assignMembershipRoleSchema>;
export type UpdateMembershipInput = z.infer<typeof updateMembershipSchema>;
export type CreateAttributeDefinitionInput = z.infer<typeof createAttributeDefinitionSchema>;
export type SetAttributeValueInput = z.infer<typeof setAttributeValueSchema>;

export const upsertCategoryAttributeRuleSchema = z.object({
  attributeId: z.uuid(),
  isRequired: z.boolean().default(false),
  isVariant: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  overrides: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type UpsertCategoryAttributeRuleInput = z.infer<typeof upsertCategoryAttributeRuleSchema>;

export const updateProductSchema = z.object({
  version: z.number().int().min(1),
  canonicalName: z.string().trim().min(3).max(240).optional(),
  productType: z.string().trim().min(2).max(80).optional(),
  regulatoryClass: z.string().trim().min(1).max(80).nullable().optional(),
  status: z.enum(["DRAFT", "UNDER_REVIEW", "ACTIVE", "BLOCKED", "ARCHIVED"]).optional(),
  manufacturerSku: z.string().trim().max(120).nullable().optional(),
  gtin: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
}).refine(
  ({ version: _version, ...changes }) => Object.values(changes).some((value) => value !== undefined),
  "At least one product field must be changed",
);

export const approvalConditionsSchema = z.object({
  amountMinMinor: z.number().int().nonnegative().optional(),
  amountMaxMinor: z.number().int().nonnegative().optional(),
  currencies: z.array(z.string().trim().regex(/^[A-Z]{3}$/)).max(20).optional(),
  categoryIds: z.array(z.uuid()).max(100).optional(),
  regulatoryClasses: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
  supplierIds: z.array(z.uuid()).max(100).optional(),
  branchIds: z.array(z.uuid()).max(100).optional(),
  urgent: z.boolean().optional(),
}).refine(
  (conditions) => conditions.amountMinMinor === undefined || conditions.amountMaxMinor === undefined || conditions.amountMinMinor <= conditions.amountMaxMinor,
  { message: "Minimum amount must not exceed maximum amount", path: ["amountMaxMinor"] },
);

export const approvalStepSchema = z.object({
  sequence: z.number().int().min(1).max(100),
  approverRoleCodes: z.array(z.string().trim().regex(/^[a-z][a-z0-9_]{2,62}$/)).min(1).max(20),
  minApprovals: z.number().int().min(1).max(20).default(1),
});

export const approvalStepsSchema = z.array(approvalStepSchema).min(1).max(20).superRefine((steps, context) => {
  const sequences = new Set<number>();
  for (const [index, step] of steps.entries()) {
    if (sequences.has(step.sequence)) {
      context.addIssue({ code: "custom", message: "Approval step sequences must be unique", path: [index, "sequence"] });
    }
    sequences.add(step.sequence);
    if (step.minApprovals > step.approverRoleCodes.length) {
      context.addIssue({ code: "custom", message: "Minimum approvals cannot exceed available approver roles", path: [index, "minApprovals"] });
    }
  }
});

export const createApprovalPolicySchema = z.object({
  name: z.string().trim().min(3).max(160),
  priority: z.number().int().min(1).max(10_000).default(100),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).default("DRAFT"),
  conditions: approvalConditionsSchema,
  approvalSteps: approvalStepsSchema,
});

export const updateApprovalPolicySchema = z.object({
  version: z.number().int().min(1),
  name: z.string().trim().min(3).max(160).optional(),
  priority: z.number().int().min(1).max(10_000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  conditions: approvalConditionsSchema.optional(),
  approvalSteps: approvalStepsSchema.optional(),
}).refine(
  ({ version: _version, ...changes }) => Object.values(changes).some((value) => value !== undefined),
  "At least one approval policy field must be changed",
);

export const evaluateApprovalSchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  categoryIds: z.array(z.uuid()).max(100).default([]),
  regulatoryClass: z.string().trim().min(1).max(80).optional(),
  supplierId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  urgent: z.boolean().default(false),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ApprovalConditionsInput = z.infer<typeof approvalConditionsSchema>;
export type ApprovalStepInput = z.infer<typeof approvalStepSchema>;
export type CreateApprovalPolicyInput = z.infer<typeof createApprovalPolicySchema>;
export type UpdateApprovalPolicyInput = z.infer<typeof updateApprovalPolicySchema>;
export type EvaluateApprovalInput = z.infer<typeof evaluateApprovalSchema>;

export const createSupplierProfileSchema = z.object({
  regulatoryDetails: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createWarehouseSchema = z.object({
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),
  name: z.string().trim().min(2).max(160),
  cityId: z.uuid().nullable().optional(),
  addressLine: z.string().trim().max(240).nullable().optional(),
  timezone: z.string().trim().min(3).max(80).default("Asia/Almaty"),
});

export const createSupplierDataSourceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(["MANUAL", "CSV", "EXCEL", "PDF", "API", "ERP"]),
  configuration: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const supplierColumnMappingSchema = z.object({
  externalId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  supplierSku: z.string().trim().min(1).max(120).optional(),
  gtin: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  manufacturer: z.string().trim().min(1).max(120).optional(),
  unit: z.string().trim().min(1).max(120).optional(),
  priceMinor: z.string().trim().min(1).max(120).optional(),
  currency: z.string().trim().min(1).max(120).optional(),
  quantityOnHand: z.string().trim().min(1).max(120).optional(),
  lotNumber: z.string().trim().min(1).max(120).optional(),
  expirationDate: z.string().trim().min(1).max(120).optional(),
});

const rawImportRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const createImportBatchSchema = z.object({
  sourceId: z.uuid(),
  fileName: z.string().trim().min(1).max(240),
  fileType: z.enum(["MANUAL", "CSV", "EXCEL", "PDF"]),
  columnMapping: supplierColumnMappingSchema,
  rows: z.array(rawImportRowSchema).min(1).max(5_000).optional(),
  contentBase64: z.string().min(4).max(28_000_000).optional(),
}).refine((value) => value.rows !== undefined || value.contentBase64 !== undefined, {
  message: "Rows or file content must be provided",
});

export const confirmSupplierItemMatchSchema = z.object({ productVariantId: z.uuid() });

export const createSupplierOfferSchema = z.object({
  productVariantId: z.uuid(),
  saleUnitId: z.uuid().nullable().optional(),
  packagingId: z.uuid().nullable().optional(),
  sourceId: z.uuid().nullable().optional(),
  supplierSku: z.string().trim().max(120).nullable().optional(),
  baseUnitsPerSaleUnit: z.number().positive().default(1),
  minimumOrderQuantity: z.number().positive().default(1),
  orderIncrement: z.number().positive().default(1),
  confirmationMode: z.enum(["AUTO", "MANUAL"]).default("MANUAL"),
  sourceType: z.enum(["MANUAL", "IMPORT", "API", "ERP"]).default("MANUAL"),
  externalId: z.string().trim().max(160).nullable().optional(),
});

export const setOfferPriceSchema = z.object({
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  includesVat: z.boolean().default(true),
  vatRate: z.number().min(0).max(100).nullable().optional(),
  source: z.enum(["MANUAL", "IMPORT", "API", "ERP"]).default("MANUAL"),
  reason: z.string().trim().max(240).nullable().optional(),
});

export const setOfferPublicationSchema = z.object({
  status: z.enum(["DRAFT", "UNDER_REVIEW", "PUBLISHED", "HIDDEN", "BLOCKED", "PAUSED", "RESTRICTED"]),
  marketplaceVisible: z.boolean(),
  blockedReason: z.string().trim().max(240).nullable().optional(),
}).refine((value) => !value.marketplaceVisible || value.status === "PUBLISHED" || value.status === "RESTRICTED", {
  message: "Marketplace visibility requires a published or restricted status",
});

export const setInventoryBalanceSchema = z.object({
  warehouseId: z.uuid(),
  productVariantId: z.uuid(),
  offerId: z.uuid().nullable().optional(),
  quantityOnHand: z.number().nonnegative(),
  quantityReserved: z.number().nonnegative().default(0),
  safetyStock: z.number().nonnegative().default(0),
  source: z.enum(["MANUAL", "IMPORT", "API", "ERP"]).default("MANUAL"),
}).refine((value) => value.quantityReserved + value.safetyStock <= value.quantityOnHand, {
  message: "Reserved quantity and safety stock cannot exceed on-hand quantity",
});

export const createInventoryLotSchema = z.object({
  inventoryBalanceId: z.uuid(),
  offerId: z.uuid().nullable().optional(),
  lotNumber: z.string().trim().min(1).max(120),
  series: z.string().trim().max(120).nullable().optional(),
  serialNumber: z.string().trim().max(160).nullable().optional(),
  manufactureDate: z.iso.date().nullable().optional(),
  expirationDate: z.iso.date().nullable().optional(),
  registrationCertificate: z.string().trim().max(240).nullable().optional(),
  importerOrganizationId: z.uuid().nullable().optional(),
  originSource: z.string().trim().max(160).nullable().optional(),
  quantityOnHand: z.number().nonnegative(),
  quantityReserved: z.number().nonnegative().default(0),
  status: z.enum(["ACTIVE", "QUARANTINED", "BLOCKED", "RECALLED", "EXPIRED", "DEPLETED", "UNDER_REVIEW"]).default("UNDER_REVIEW"),
}).refine((value) => value.quantityReserved <= value.quantityOnHand, "Reserved lot quantity cannot exceed on-hand quantity")
  .refine((value) => !value.manufactureDate || !value.expirationDate || value.manufactureDate <= value.expirationDate, "Manufacture date must not be after expiration date");

export const createInventoryReservationSchema = z.object({
  quantity: z.number().positive(),
  idempotencyKey: z.string().trim().min(8).max(160),
  ttlMinutes: z.number().int().min(1).max(24 * 60).default(30),
  inventoryLotId: z.uuid().nullable().optional(),
  referenceType: z.string().trim().max(80).nullable().optional(),
  referenceId: z.string().trim().max(160).nullable().optional(),
});

export type CreateSupplierProfileInput = z.infer<typeof createSupplierProfileSchema>;
export type CreateWarehouseInput = z.infer<typeof createWarehouseSchema>;
export type CreateSupplierDataSourceInput = z.infer<typeof createSupplierDataSourceSchema>;
export type SupplierColumnMappingInput = z.infer<typeof supplierColumnMappingSchema>;
export type CreateImportBatchInput = z.infer<typeof createImportBatchSchema>;
export type ConfirmSupplierItemMatchInput = z.infer<typeof confirmSupplierItemMatchSchema>;
export type CreateSupplierOfferInput = z.infer<typeof createSupplierOfferSchema>;
export type SetOfferPriceInput = z.infer<typeof setOfferPriceSchema>;
export type SetOfferPublicationInput = z.infer<typeof setOfferPublicationSchema>;
export type SetInventoryBalanceInput = z.infer<typeof setInventoryBalanceSchema>;
export type CreateInventoryLotInput = z.infer<typeof createInventoryLotSchema>;
export type CreateInventoryReservationInput = z.infer<typeof createInventoryReservationSchema>;

export const approveProductCandidateSchema = z.object({
  canonicalName: z.string().trim().min(3).max(240),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,159}$/),
  productType: z.string().trim().min(2).max(80),
  regulatoryClass: z.string().trim().max(80).nullable().optional(),
  industryIds: z.array(z.uuid()).min(1).max(20),
  categoryIds: z.array(z.uuid()).min(1).max(20),
  saleUnitId: z.uuid().nullable().optional(),
  packageQuantity: z.number().positive().default(1),
});

export const rejectProductCandidateSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const productCorrectionFieldSchema = z.enum([
  "CANONICAL_NAME",
  "DESCRIPTION",
  "MANUFACTURER_SKU",
  "GTIN",
  "PRODUCT_TYPE",
  "REGULATORY_CLASS",
]);

export const submitProductCorrectionSchema = z.object({
  productId: z.uuid(),
  field: productCorrectionFieldSchema,
  proposedValue: z.string().trim().min(1).max(5_000),
  reason: z.string().trim().min(10).max(1_000),
  evidenceUrl: z.url().max(2_000).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const decideProductCorrectionSchema = z.object({
  acceptedValue: z.string().trim().min(1).max(5_000).optional(),
  moderatorComment: z.string().trim().min(3).max(1_000),
});

export const createOfferPriceTierSchema = z.object({
  minimumQuantity: z.number().positive(),
  maximumQuantity: z.number().positive().nullable().optional(),
  unitPriceMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  validFrom: z.iso.datetime().optional(),
  validTo: z.iso.datetime().nullable().optional(),
}).refine((value) => value.maximumQuantity == null || value.minimumQuantity <= value.maximumQuantity, "Tier minimum cannot exceed maximum")
  .refine((value) => !value.validFrom || !value.validTo || value.validFrom <= value.validTo, "Tier start must not be after end");

export const createContractPriceSchema = z.object({
  buyerOrganizationId: z.uuid(),
  contractReference: z.string().trim().max(160).nullable().optional(),
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  minimumQuantity: z.number().positive().default(1),
  validFrom: z.iso.datetime().optional(),
  validTo: z.iso.datetime().nullable().optional(),
  priority: z.number().int().min(1).max(10_000).default(100),
}).refine((value) => !value.validFrom || !value.validTo || value.validFrom <= value.validTo, "Contract price start must not be after end");

export const resolveOfferPriceSchema = z.object({
  buyerOrganizationId: z.uuid().optional(),
  quantity: z.number().positive(),
  at: z.iso.datetime().optional(),
});

export const recomputeFreshnessSchema = z.object({
  staleAfterMinutes: z.number().int().min(1).max(30 * 24 * 60).optional(),
});

export const createProductPackagingSchema = z.object({
  unitId: z.uuid(),
  parentPackagingId: z.uuid().nullable().optional(),
  code: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.-]+$/),
  name: z.string().trim().min(1).max(160),
  level: z.enum(["BASE", "SALE", "TRANSPORT"]),
  quantityInBaseUnit: z.number().positive(),
  unitsPerParent: z.number().positive().nullable().optional(),
  gtin: z.string().trim().max(32).nullable().optional(),
  netWeightGrams: z.number().positive().nullable().optional(),
  grossWeightGrams: z.number().positive().nullable().optional(),
  lengthMm: z.number().positive().nullable().optional(),
  widthMm: z.number().positive().nullable().optional(),
  heightMm: z.number().positive().nullable().optional(),
}).refine((value) => !value.netWeightGrams || !value.grossWeightGrams || value.grossWeightGrams >= value.netWeightGrams, "Gross weight cannot be below net weight");

export const assignOfferPackagingSchema = z.object({ packagingId: z.uuid(), version: z.number().int().positive() });

export const upsertFreshnessPolicySchema = z.object({
  source: z.enum(["MANUAL", "IMPORT", "API", "ERP"]),
  dataType: z.enum(["PRICE", "INVENTORY"]),
  staleAfterMinutes: z.number().int().min(1).max(365 * 24 * 60),
  expirationBehavior: z.enum(["ALLOW_AUTO", "REQUIRE_CONFIRMATION", "MARK_UNKNOWN", "PAUSE"]),
  confirmationRequired: z.boolean().default(false),
  priority: z.number().int().min(0).max(10_000).default(100),
});

export const createDataOverrideSchema = z.object({
  target: z.enum(["PRICE", "INVENTORY"]),
  offerId: z.uuid().nullable().optional(),
  inventoryBalanceId: z.uuid().nullable().optional(),
  mode: z.enum(["UNTIL_DATE", "UNTIL_NEXT_SYNC", "ONE_TIME", "PERMANENT"]),
  value: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(3).max(1_000),
  validUntil: z.iso.datetime().nullable().optional(),
}).superRefine((value, context) => {
  if (value.target === "PRICE" && (!value.offerId || value.inventoryBalanceId)) context.addIssue({ code: "custom", message: "Price override requires only offerId", path: ["offerId"] });
  if (value.target === "INVENTORY" && !value.inventoryBalanceId) context.addIssue({ code: "custom", message: "Inventory override requires inventoryBalanceId", path: ["inventoryBalanceId"] });
  if (value.mode === "UNTIL_DATE" && !value.validUntil) context.addIssue({ code: "custom", message: "Until-date override requires validUntil", path: ["validUntil"] });
  if (value.target === "PRICE" && (typeof value.value.amountMinor !== "number" || !Number.isInteger(value.value.amountMinor) || value.value.amountMinor < 0)) context.addIssue({ code: "custom", message: "Price override requires a non-negative integer amountMinor", path: ["value", "amountMinor"] });
  if (value.target === "INVENTORY" && (typeof value.value.quantityOnHand !== "number" || value.value.quantityOnHand < 0)) context.addIssue({ code: "custom", message: "Inventory override requires non-negative quantityOnHand", path: ["value", "quantityOnHand"] });
});

export const searchCatalogSchema = z.object({
  buyerOrganizationId: z.uuid(),
  q: z.string().trim().max(240).default(""),
  categoryId: z.uuid().optional(),
  industryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
  manufacturerId: z.uuid().optional(),
  supplierOrganizationId: z.uuid().optional(),
  cityId: z.uuid().optional(),
  warehouseId: z.uuid().optional(),
  deliveryMethod: z.enum(["PICKUP", "SUPPLIER_CITY", "SELECTED_CITIES", "NATIONWIDE", "CARRIER", "MARKETPLACE_LOGISTICS", "PRICE_ON_REQUEST", "SPECIAL"]).optional(),
  unit: z.string().trim().max(24).optional(),
  packaging: z.string().trim().max(120).optional(),
  inStock: z.enum(["true", "false"]).transform((value) => value === "true").optional(),
  minNormalizedPriceMinor: z.coerce.number().nonnegative().optional(),
  maxNormalizedPriceMinor: z.coerce.number().nonnegative().optional(),
  attributeFilters: z.string().max(8_000).optional(),
  sort: z.enum(["RELEVANCE", "PRICE_ASC", "PRICE_DESC", "NAME_ASC", "UPDATED_DESC"]).default("RELEVANCE"),
  offset: z.coerce.number().int().nonnegative().max(10_000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(24),
}).refine((value) => value.minNormalizedPriceMinor == null || value.maxNormalizedPriceMinor == null || value.minNormalizedPriceMinor <= value.maxNormalizedPriceMinor, "Search price range is inverted");

export const compareOffersSchema = z.object({
  buyerOrganizationId: z.uuid(),
  productId: z.uuid(),
  quantity: z.coerce.number().positive().default(1),
  cityId: z.uuid().optional(),
});

export const createLotRecallSchema = z.object({
  inventoryLotId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
  source: z.string().trim().min(2).max(160),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  comment: z.string().trim().max(1_000).nullable().optional(),
});

export const resolveLotRecallSchema = z.object({
  comment: z.string().trim().min(3).max(1_000),
});

export type ApproveProductCandidateInput = z.infer<typeof approveProductCandidateSchema>;
export type RejectProductCandidateInput = z.infer<typeof rejectProductCandidateSchema>;
export type SubmitProductCorrectionInput = z.infer<typeof submitProductCorrectionSchema>;
export type DecideProductCorrectionInput = z.infer<typeof decideProductCorrectionSchema>;
export type CreateOfferPriceTierInput = z.infer<typeof createOfferPriceTierSchema>;
export type CreateContractPriceInput = z.infer<typeof createContractPriceSchema>;
export type ResolveOfferPriceInput = z.infer<typeof resolveOfferPriceSchema>;
export type RecomputeFreshnessInput = z.infer<typeof recomputeFreshnessSchema>;
export type CreateLotRecallInput = z.infer<typeof createLotRecallSchema>;
export type ResolveLotRecallInput = z.infer<typeof resolveLotRecallSchema>;
export type CreateProductPackagingInput = z.infer<typeof createProductPackagingSchema>;
export type AssignOfferPackagingInput = z.infer<typeof assignOfferPackagingSchema>;
export type UpsertFreshnessPolicyInput = z.infer<typeof upsertFreshnessPolicySchema>;
export type CreateDataOverrideInput = z.infer<typeof createDataOverrideSchema>;
export type SearchCatalogInput = z.infer<typeof searchCatalogSchema>;
export type CompareOffersInput = z.infer<typeof compareOffersSchema>;

export const createCartSchema = z.object({
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("KZT"),
});

export const addCartItemSchema = z.object({
  offerId: z.uuid(),
  quantity: z.number().positive().max(1_000_000),
});

export const checkoutCartSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const confirmSupplierOrderSchema = z.object({
  decisions: z.array(z.object({
    itemId: z.uuid(),
    acceptedQuantity: z.number().nonnegative().max(1_000_000),
  })).min(1).max(500),
}).superRefine(({ decisions }, context) => {
  const seen = new Set<string>();
  for (const [index, decision] of decisions.entries()) {
    if (seen.has(decision.itemId)) context.addIssue({ code: "custom", message: "Order item decisions must be unique", path: ["decisions", index, "itemId"] });
    seen.add(decision.itemId);
  }
});

export const createPaymentIntentSchema = z.object({
  providerCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,31}$/).default("MOCK"),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const captureMockPaymentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const createPaymentSessionSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  returnUrl: z.url().max(2_000).nullable().optional(),
});

export const authorizePaymentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const capturePaymentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  allocationIds: z.array(z.uuid()).min(1).max(500).optional(),
});

export const cancelPaymentIntentSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
  reason: z.string().trim().min(3).max(500),
});

export const onboardPaymentMerchantSchema = z.object({
  providerCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  idempotencyKey: z.string().trim().min(8).max(160),
  returnUrl: z.url().max(2_000).nullable().optional(),
});

export const requestPaymentMerchantChangeSchema = z.object({
  requestedExternalMerchantId: z.string().trim().min(3).max(240),
  reason: z.string().trim().min(5).max(1_000),
});

export const reviewPaymentMerchantChangeSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().min(3).max(1_000),
});

export const createRefundSchema = z.object({
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  supplierOrderItemId: z.uuid().nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  reason: z.string().trim().min(3).max(1_000),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const processPayoutSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const paymentOperationsQuerySchema = z.object({
  status: z.string().trim().min(1).max(80).optional(),
  providerCode: z.string().trim().max(32).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const paymentReconciliationImportSchema = z.object({
  providerCode: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,31}$/),
  records: z.array(z.object({
    externalTransactionId: z.string().trim().min(1).max(240),
    type: z.enum(["AUTHORIZATION", "CAPTURE", "VOID", "REFUND", "PAYOUT", "CHARGEBACK", "REVERSAL"]),
    status: z.enum(["PENDING", "PROCESSING", "SUCCEEDED", "FAILED", "CANCELLED"]),
    amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
  })).min(1).max(10_000),
});

export const ledgerQuerySchema = z.object({
  referenceType: z.string().trim().min(1).max(80).optional(),
  referenceId: z.string().trim().min(1).max(160).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).refine((value) => !value.referenceId || value.referenceType, {
  message: "referenceType is required when referenceId is provided",
  path: ["referenceType"],
});

export type CreateCartInput = z.infer<typeof createCartSchema>;
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type CheckoutCartInput = z.infer<typeof checkoutCartSchema>;
export type ConfirmSupplierOrderInput = z.infer<typeof confirmSupplierOrderSchema>;
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;
export type CaptureMockPaymentInput = z.infer<typeof captureMockPaymentSchema>;
export type CreatePaymentSessionInput = z.infer<typeof createPaymentSessionSchema>;
export type AuthorizePaymentInput = z.infer<typeof authorizePaymentSchema>;
export type CapturePaymentInput = z.infer<typeof capturePaymentSchema>;
export type CancelPaymentIntentInput = z.infer<typeof cancelPaymentIntentSchema>;
export type OnboardPaymentMerchantInput = z.infer<typeof onboardPaymentMerchantSchema>;
export type RequestPaymentMerchantChangeInput = z.infer<typeof requestPaymentMerchantChangeSchema>;
export type ReviewPaymentMerchantChangeInput = z.infer<typeof reviewPaymentMerchantChangeSchema>;
export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type ProcessPayoutInput = z.infer<typeof processPayoutSchema>;
export type PaymentOperationsQueryInput = z.infer<typeof paymentOperationsQuerySchema>;
export type PaymentReconciliationImportInput = z.infer<typeof paymentReconciliationImportSchema>;
export type LedgerQueryInput = z.infer<typeof ledgerQuerySchema>;

export const deliveryMethodSchema = z.enum(["PICKUP", "SUPPLIER_CITY", "SELECTED_CITIES", "NATIONWIDE", "CARRIER", "MARKETPLACE_LOGISTICS", "PRICE_ON_REQUEST", "SPECIAL"]);
export const deliveryPriceTypeSchema = z.enum(["FREE", "FIXED", "FREE_FROM_AMOUNT", "PRICE_ON_REQUEST"]);

export const createDeliveryZoneSchema = z.object({
  name: z.string().trim().min(2).max(160),
  cityIds: z.array(z.uuid()).min(1).max(500),
});

const deliveryPricingFields = z.object({
  method: deliveryMethodSchema,
  priceType: deliveryPriceTypeSchema,
  fixedAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  freeFromAmountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("KZT"),
  minLeadTimeHours: z.number().int().nonnegative().max(24 * 365).default(0),
  maxLeadTimeHours: z.number().int().nonnegative().max(24 * 365).nullable().optional(),
}).superRefine((value, context) => {
  if (value.priceType === "FIXED" && value.fixedAmountMinor == null) context.addIssue({ code: "custom", message: "Fixed delivery requires fixedAmountMinor", path: ["fixedAmountMinor"] });
  if (value.priceType === "FREE_FROM_AMOUNT" && value.freeFromAmountMinor == null) context.addIssue({ code: "custom", message: "Free-from delivery requires freeFromAmountMinor", path: ["freeFromAmountMinor"] });
  if (value.priceType === "FREE_FROM_AMOUNT" && value.fixedAmountMinor == null) context.addIssue({ code: "custom", message: "Free-from delivery requires a fallback fixedAmountMinor", path: ["fixedAmountMinor"] });
  if (value.maxLeadTimeHours != null && value.maxLeadTimeHours < value.minLeadTimeHours) context.addIssue({ code: "custom", message: "Maximum lead time must not be below minimum", path: ["maxLeadTimeHours"] });
});

export const createOfferDeliveryOptionSchema = deliveryPricingFields.and(z.object({
  warehouseId: z.uuid(),
  pickupInstructions: z.string().trim().max(1_000).nullable().optional(),
  temperatureControlled: z.boolean().default(false),
  installationRequired: z.boolean().default(false),
}));

export const createDeliveryRuleSchema = deliveryPricingFields.and(z.object({
  warehouseId: z.uuid().nullable().optional(),
  deliveryZoneId: z.uuid().nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  priority: z.number().int().min(0).max(10_000).default(100),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).default("DRAFT"),
}));

export const updateDeliveryRuleSchema = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(2).max(160).optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).optional(),
  conditions: z.record(z.string(), z.unknown()).nullable().optional(),
}).refine(({ version: _version, ...changes }) => Object.values(changes).some((value) => value !== undefined), "At least one delivery-rule field must change");

export const deliveryQuoteSchema = z.object({
  destinationCityId: z.uuid().nullable().optional(),
});

export const createShipmentSchema = z.object({
  warehouseId: z.uuid(),
  method: deliveryMethodSchema,
  recipientName: z.string().trim().min(2).max(160),
  recipientPhone: z.string().trim().max(40).nullable().optional(),
  destinationAddress: z.record(z.string(), z.unknown()).nullable().optional(),
  deliveryWindowStart: z.iso.datetime().nullable().optional(),
  deliveryWindowEnd: z.iso.datetime().nullable().optional(),
  trackingNumber: z.string().trim().max(160).nullable().optional(),
  carrierName: z.string().trim().max(160).nullable().optional(),
  items: z.array(z.object({ supplierOrderItemId: z.uuid(), quantity: z.number().positive() })).min(1).max(500),
  fulfillmentSteps: z.array(z.object({ type: z.enum(["PICKUP", "DELIVERY", "INSTALLATION", "TRAINING", "SERVICE"]), providerOrganizationId: z.uuid().nullable().optional(), scheduledAt: z.iso.datetime().nullable().optional(), notes: z.string().trim().max(1_000).nullable().optional() })).max(50).default([]),
}).refine((value) => !value.deliveryWindowStart || !value.deliveryWindowEnd || value.deliveryWindowStart <= value.deliveryWindowEnd, "Delivery window start must not be after end");

export const transitionShipmentSchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(["PLANNED", "PACKING", "READY", "DISPATCHED", "IN_TRANSIT", "PARTIALLY_DELIVERED", "DELIVERED", "FAILED", "CANCELLED", "RETURNED"]),
  trackingNumber: z.string().trim().max(160).nullable().optional(),
  carrierName: z.string().trim().max(160).nullable().optional(),
  failureReason: z.string().trim().max(1_000).nullable().optional(),
  proofOfDelivery: z.record(z.string(), z.unknown()).nullable().optional(),
  deliveredItems: z.array(z.object({ shipmentItemId: z.uuid(), deliveredQuantity: z.number().nonnegative() })).max(500).optional(),
});

export const transitionFulfillmentStepSchema = z.object({
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"]),
  notes: z.string().trim().max(1_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type CreateDeliveryZoneInput = z.infer<typeof createDeliveryZoneSchema>;
export type CreateOfferDeliveryOptionInput = z.infer<typeof createOfferDeliveryOptionSchema>;
export type CreateDeliveryRuleInput = z.infer<typeof createDeliveryRuleSchema>;
export type UpdateDeliveryRuleInput = z.infer<typeof updateDeliveryRuleSchema>;
export type DeliveryQuoteInput = z.infer<typeof deliveryQuoteSchema>;
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;
export type TransitionShipmentInput = z.infer<typeof transitionShipmentSchema>;
export type TransitionFulfillmentStepInput = z.infer<typeof transitionFulfillmentStepSchema>;

export const documentKindSchema = z.enum(["MARKETPLACE_SUPPLIER_AGREEMENT", "MARKETPLACE_BUYER_TERMS", "FRAMEWORK_SUPPLY_AGREEMENT", "ORDER_SPECIFICATION", "ORDER_CONFIRMATION", "INVOICE", "WAYBILL", "ACCOMPANYING_DOCUMENT", "TAX_CLOSING_DOCUMENT", "INSTALLATION_ACT", "TRAINING_ACT", "WARRANTY", "COMMISSIONING_ACT", "REGISTRATION_CERTIFICATE", "LICENSE", "CERTIFICATE", "OTHER"]);
export const documentFormatSchema = z.enum(["PDF", "DOCX"]);

export const createDocumentTemplateSchema = z.object({
  code: z.string().trim().min(2).max(120).regex(/^[A-Z0-9_.-]+$/),
  version: z.number().int().positive(),
  kind: documentKindSchema,
  name: z.string().trim().min(2).max(240),
  format: documentFormatSchema.default("PDF"),
  locale: z.string().trim().min(2).max(16).default("ru-KZ"),
  templateBody: z.string().min(1).max(200_000),
  requiredSignatureCount: z.number().int().nonnegative().max(20).default(0),
  signatureMethods: z.array(z.enum(["EDS", "EGOV_QR", "SIMPLE", "EXTERNAL", "MOCK"])).max(5).default(["MOCK"]),
  effectiveFrom: z.iso.datetime().optional(),
  effectiveTo: z.iso.datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).refine((value) => !value.effectiveTo || !value.effectiveFrom || value.effectiveTo >= value.effectiveFrom, "Template effectiveTo must not precede effectiveFrom");

export const createGeneratedDocumentSchema = z.object({
  ownerOrganizationId: z.uuid(),
  templateId: z.uuid(),
  checkoutId: z.uuid().nullable().optional(),
  supplierOrderId: z.uuid().nullable().optional(),
  shipmentId: z.uuid().nullable().optional(),
  title: z.string().trim().min(2).max(240),
  documentNumber: z.string().trim().min(1).max(120),
  data: z.record(z.string(), z.unknown()),
  expiresAt: z.iso.datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const uploadDocumentSchema = z.object({
  ownerOrganizationId: z.uuid(),
  kind: documentKindSchema,
  format: documentFormatSchema,
  checkoutId: z.uuid().nullable().optional(),
  supplierOrderId: z.uuid().nullable().optional(),
  shipmentId: z.uuid().nullable().optional(),
  title: z.string().trim().min(2).max(240),
  documentNumber: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(1).max(16_000_000),
  requiredSignatureCount: z.number().int().nonnegative().max(20).default(0),
  expiresAt: z.iso.datetime().nullable().optional(),
  externalId: z.string().trim().max(240).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createDocumentVersionSchema = z.object({
  templateId: z.uuid().optional(),
  data: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(2).max(1_000),
});

export const createSignatureSessionSchema = z.object({
  method: z.enum(["EDS", "EGOV_QR", "SIMPLE", "EXTERNAL", "MOCK"]),
  signerOrganizationId: z.uuid().nullable().optional(),
  signerUserId: z.uuid().nullable().optional(),
  signerName: z.string().trim().max(240).nullable().optional(),
  expiresInMinutes: z.number().int().min(5).max(10_080).default(60),
});

export const completeDocumentSignatureSchema = z.object({
  status: z.enum(["SIGNED", "REJECTED", "FAILED"]),
  externalSignatureId: z.string().trim().max(240).nullable().optional(),
  signatureHash: z.string().trim().max(512).nullable().optional(),
  rejectionReason: z.string().trim().max(1_000).nullable().optional(),
  evidence: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const documentQuerySchema = z.object({
  ownerOrganizationId: z.uuid().optional(),
  supplierOrderId: z.uuid().optional(),
  checkoutId: z.uuid().optional(),
  status: z.enum(["DRAFT", "GENERATING", "GENERATED", "AWAITING_SIGNATURE", "PARTIALLY_SIGNED", "SIGNED", "REJECTED", "EXPIRED", "SUPERSEDED", "ARCHIVED", "FAILED"]).optional(),
  kind: documentKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const organizationCredentialTypeSchema = z.enum(["BUSINESS_LICENSE", "MEDICAL_LICENSE", "WHOLESALE_LICENSE", "MEDICAL_DEVICE_SALE_NOTIFICATION", "REGISTRATION_CERTIFICATE", "DISTRIBUTOR_AUTHORIZATION", "QUALITY_CERTIFICATE", "OTHER"]);
export const createOrganizationCredentialSchema = z.object({
  type: organizationCredentialTypeSchema,
  number: z.string().trim().min(1).max(160),
  issuer: z.string().trim().max(240).nullable().optional(),
  validFrom: z.iso.datetime().nullable().optional(),
  validTo: z.iso.datetime().nullable().optional(),
  fileName: z.string().trim().max(255).nullable().optional(),
  contentBase64: z.string().min(1).max(16_000_000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).refine((value) => Boolean(value.fileName) === Boolean(value.contentBase64), "fileName and contentBase64 must be provided together").refine((value) => !value.validFrom || !value.validTo || value.validTo >= value.validFrom, "Credential validity window is invalid");

export const reviewOrganizationCredentialSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED", "REVOKED"]),
  reason: z.string().trim().max(1_000).nullable().optional(),
}).refine((value) => value.status === "VERIFIED" || Boolean(value.reason), "A reason is required when rejecting or revoking a credential");

export const complianceRiskLevelSchema = z.enum(["GREEN", "YELLOW", "ORANGE", "RED"]);
export const complianceDecisionSchema = z.enum(["ALLOWED", "ALLOWED_WITH_DISCLOSURE", "MANUAL_REVIEW", "BLOCKED"]);
export const createComplianceRuleSchema = z.object({
  code: z.string().trim().min(2).max(120).regex(/^[A-Z0-9_.-]+$/),
  version: z.number().int().positive(),
  name: z.string().trim().min(2).max(240),
  industryCode: z.string().trim().max(120).nullable().optional(),
  categoryId: z.uuid().nullable().optional(),
  productType: z.string().trim().max(120).nullable().optional(),
  regulatoryClass: z.string().trim().max(120).nullable().optional(),
  riskLevel: complianceRiskLevelSchema,
  decision: complianceDecisionSchema,
  priority: z.number().int().min(0).max(10_000).default(100),
  conditions: z.record(z.string(), z.unknown()).default({}),
  requiredCredentialTypes: z.array(organizationCredentialTypeSchema).max(20).default([]),
  disclosureText: z.string().trim().max(2_000).nullable().optional(),
  effectiveFrom: z.iso.datetime(),
  effectiveTo: z.iso.datetime().nullable().optional(),
  supersedesRuleId: z.uuid().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
}).refine((value) => !value.effectiveTo || value.effectiveTo >= value.effectiveFrom, "Compliance rule effective window is invalid");

export const complianceEvaluationSchema = z.object({
  sellerOrganizationId: z.uuid(),
  buyerOrganizationId: z.uuid().nullable().optional(),
  offerId: z.uuid().nullable().optional(),
  warehouseId: z.uuid().nullable().optional(),
  inventoryLotId: z.uuid().nullable().optional(),
  supplierOrderId: z.uuid().nullable().optional(),
  at: z.iso.datetime().optional(),
});

export const reviewComplianceCheckSchema = z.object({
  decision: z.enum(["ALLOWED", "ALLOWED_WITH_DISCLOSURE", "BLOCKED"]),
  comment: z.string().trim().min(2).max(2_000),
});

export const notificationPreferenceSchema = z.object({
  userId: z.uuid().nullable().optional(),
  eventType: z.string().trim().min(1).max(160),
  channel: z.enum(["IN_APP", "EMAIL", "SMS", "WEBHOOK"]),
  enabled: z.boolean().default(true),
  destination: z.string().trim().max(1_000).nullable().optional(),
  quietHours: z.object({ start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().trim().min(1).max(80) }).nullable().optional(),
});

export const createNotificationSchema = z.object({
  recipientOrganizationId: z.uuid(),
  recipientUserId: z.uuid().nullable().optional(),
  eventType: z.string().trim().min(1).max(160),
  channel: z.enum(["IN_APP", "EMAIL", "SMS", "WEBHOOK"]).default("IN_APP"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  subject: z.string().trim().min(1).max(240),
  body: z.string().min(1).max(20_000),
  destination: z.string().trim().max(1_000).nullable().optional(),
  aggregateType: z.string().trim().max(120).nullable().optional(),
  aggregateId: z.string().trim().max(240).nullable().optional(),
  idempotencyKey: z.string().trim().min(1).max(240),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  scheduledAt: z.iso.datetime().optional(),
});

export const notificationQuerySchema = z.object({
  status: z.enum(["PENDING", "PROCESSING", "SENT", "FAILED", "DEAD", "CANCELLED"]).optional(),
  unreadOnly: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateDocumentTemplateInput = z.infer<typeof createDocumentTemplateSchema>;
export type CreateGeneratedDocumentInput = z.infer<typeof createGeneratedDocumentSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type CreateDocumentVersionInput = z.infer<typeof createDocumentVersionSchema>;
export type CreateSignatureSessionInput = z.infer<typeof createSignatureSessionSchema>;
export type CompleteDocumentSignatureInput = z.infer<typeof completeDocumentSignatureSchema>;
export type DocumentQueryInput = z.infer<typeof documentQuerySchema>;
export type CreateOrganizationCredentialInput = z.infer<typeof createOrganizationCredentialSchema>;
export type ReviewOrganizationCredentialInput = z.infer<typeof reviewOrganizationCredentialSchema>;
export type CreateComplianceRuleInput = z.infer<typeof createComplianceRuleSchema>;
export type ComplianceEvaluationInput = z.infer<typeof complianceEvaluationSchema>;
export type ReviewComplianceCheckInput = z.infer<typeof reviewComplianceCheckSchema>;
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;

export const mfaCodeSchema = z.object({
  code: z.string().trim().regex(/^(?:\d{6}|[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})$/i),
});

export type MfaCodeInput = z.infer<typeof mfaCodeSchema>;

export const integrationProviderSchema = z.enum(["MOYSKLAD", "ONE_C", "CUSTOM_API", "MOCK"]);
export const integrationConnectionModeSchema = z.enum(["API", "AGENT", "WEBHOOK", "HYBRID"]);
export const integrationDataTypeSchema = z.enum(["CATALOG", "PRICE", "INVENTORY", "ORDER", "RESERVATION", "SHIPMENT", "RETURN", "IMAGE"]);
export const integrationEntityTypeSchema = z.enum(["PRODUCT", "VARIANT", "WAREHOUSE", "PRICE_TYPE", "COUNTERPARTY", "ORDER_STATE"]);
export const integrationJobTypeSchema = z.enum(["TEST_CONNECTION", "DISCOVER", "FULL_SYNC", "INCREMENTAL_SYNC", "CATALOG_SYNC", "PRICE_SYNC", "INVENTORY_SYNC", "ORDER_EXPORT", "RESERVATION_CREATE", "RESERVATION_RELEASE", "WEBHOOK_PROCESS", "RECONCILIATION"]);

const integrationConfigurationSchema = z.record(z.string().trim().min(1).max(120), z.unknown());
const integrationCredentialsSchema = z.record(z.string().trim().min(1).max(120), z.string().min(1).max(8_192));

export const createIntegrationConnectionSchema = z.object({
  provider: integrationProviderSchema,
  mode: integrationConnectionModeSchema,
  displayName: z.string().trim().min(2).max(160),
  credentials: integrationCredentialsSchema.optional(),
  configuration: integrationConfigurationSchema.nullable().optional(),
  enableWebhook: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.provider === "MOYSKLAD") {
    if (!value.credentials?.accessToken) context.addIssue({ code: "custom", message: "MySklad accessToken is required", path: ["credentials", "accessToken"] });
    if (!(["API", "HYBRID"] as const).includes(value.mode as "API" | "HYBRID")) context.addIssue({ code: "custom", message: "MySklad requires API or HYBRID mode", path: ["mode"] });
  }
  if (value.provider === "ONE_C" && !(["AGENT", "HYBRID"] as const).includes(value.mode as "AGENT" | "HYBRID")) {
    context.addIssue({ code: "custom", message: "1C requires AGENT or HYBRID mode", path: ["mode"] });
  }
  if (value.provider === "ONE_C" && value.credentials && Object.keys(value.credentials).length > 0) {
    context.addIssue({ code: "custom", message: "1C agent credentials are enrolled separately", path: ["credentials"] });
  }
  if (value.provider === "CUSTOM_API" && !value.configuration?.baseUrl) {
    context.addIssue({ code: "custom", message: "Custom API baseUrl is required", path: ["configuration", "baseUrl"] });
  }
});

export const updateIntegrationConnectionSchema = z.object({
  version: z.number().int().positive(),
  displayName: z.string().trim().min(2).max(160).optional(),
  status: z.enum(["ACTIVE", "PAUSED", "REVOKED"]).optional(),
  credentials: integrationCredentialsSchema.optional(),
  configuration: integrationConfigurationSchema.nullable().optional(),
}).refine(({ version: _version, ...changes }) => Object.values(changes).some((value) => value !== undefined), "At least one connection field must be changed");

export const createIntegrationBindingSchema = z.object({
  dataType: integrationDataTypeSchema,
  warehouseId: z.uuid().nullable().optional(),
  offerId: z.uuid().nullable().optional(),
  priority: z.number().int().min(0).max(10_000).default(100),
  configuration: integrationConfigurationSchema.nullable().optional(),
}).refine((value) => !(value.warehouseId && value.offerId), "Only one binding scope may be selected");

export const upsertIntegrationMappingSchema = z.object({
  entityType: integrationEntityTypeSchema,
  externalId: z.string().trim().min(1).max(500),
  internalId: z.uuid().nullable().optional(),
  mappingData: integrationConfigurationSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ERROR"]).default("ACTIVE"),
}).superRefine((value, context) => {
  if (["PRODUCT", "VARIANT", "WAREHOUSE", "COUNTERPARTY"].includes(value.entityType) && !value.internalId) {
    context.addIssue({ code: "custom", message: `${value.entityType} mapping requires internalId`, path: ["internalId"] });
  }
  if (!value.internalId && !value.mappingData) {
    context.addIssue({ code: "custom", message: "internalId or mappingData is required", path: ["mappingData"] });
  }
});

export const enqueueIntegrationJobSchema = z.object({
  type: integrationJobTypeSchema,
  idempotencyKey: z.string().trim().min(8).max(160),
  payload: integrationConfigurationSchema.nullable().optional(),
  maxAttempts: z.number().int().min(1).max(20).default(5),
});

export const enrollConnectorAgentSchema = z.object({
  enrollmentToken: z.string().min(32).max(512),
  version: z.string().trim().min(1).max(40),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
});

export const connectorAgentHeartbeatSchema = z.object({
  version: z.string().trim().min(1).max(40),
  capabilities: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  lastError: z.string().trim().max(2_000).nullable().optional(),
});

export const completeIntegrationJobSchema = z.object({
  result: integrationConfigurationSchema.nullable().optional(),
  cursor: integrationConfigurationSchema.nullable().optional(),
});

export const failIntegrationJobSchema = z.object({
  error: z.string().trim().min(1).max(4_000),
  retryable: z.boolean().default(true),
});

export const reconciliationQuerySchema = z.object({
  status: z.enum(["MATCHED", "MISMATCH", "MISSING_EXTERNAL", "MISSING_INTERNAL", "RESOLVED"]).optional(),
  kind: z.enum(["CATALOG", "PRICE", "INVENTORY", "ORDER", "RESERVATION"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const resolveReconciliationSchema = z.object({
  resolution: z.string().trim().min(3).max(2_000),
});

export const connectorReadinessDirectionSchema = z.enum(["CATALOG", "PRICE", "STOCK", "LOT", "ORDER", "RESERVATION", "SHIPMENT", "DOCUMENT"]);
export const updateConnectorReadinessSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  readinessStatus: z.enum(["READY", "PARTIAL", "BLOCKED"]).optional(),
  goLiveStatus: z.enum(["INTERNAL_READY", "CONNECTOR_NEEDED", "PILOT", "LIVE_VERIFIED", "BLOCKED"]).optional(),
  environment: z.enum(["LOCAL", "SANDBOX", "REAL"]).optional(),
  directions: z.record(connectorReadinessDirectionSchema, z.enum(["NONE", "READ", "WRITE", "READ_WRITE"])).optional(),
  supportsRead: z.boolean().optional(),
  supportsWrite: z.boolean().optional(),
  credentialsRequired: z.boolean().optional(),
  externalConnectorRequired: z.boolean().optional(),
  supportedVersions: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  limitations: z.array(z.string().trim().min(1).max(500)).max(50).optional(),
  evidence: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
  runbookPath: z.string().trim().max(500).nullable().optional(),
  owner: z.string().trim().min(2).max(160).optional(),
  lastVerifiedAt: z.iso.datetime().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one readiness field must be changed");

export type CreateIntegrationConnectionInput = z.infer<typeof createIntegrationConnectionSchema>;
export type UpdateIntegrationConnectionInput = z.infer<typeof updateIntegrationConnectionSchema>;
export type CreateIntegrationBindingInput = z.infer<typeof createIntegrationBindingSchema>;
export type UpsertIntegrationMappingInput = z.infer<typeof upsertIntegrationMappingSchema>;
export type EnqueueIntegrationJobInput = z.infer<typeof enqueueIntegrationJobSchema>;
export type EnrollConnectorAgentInput = z.infer<typeof enrollConnectorAgentSchema>;
export type ConnectorAgentHeartbeatInput = z.infer<typeof connectorAgentHeartbeatSchema>;
export type CompleteIntegrationJobInput = z.infer<typeof completeIntegrationJobSchema>;
export type FailIntegrationJobInput = z.infer<typeof failIntegrationJobSchema>;
export type ReconciliationQueryInput = z.infer<typeof reconciliationQuerySchema>;
export type ResolveReconciliationInput = z.infer<typeof resolveReconciliationSchema>;
export type UpdateConnectorReadinessInput = z.infer<typeof updateConnectorReadinessSchema>;
