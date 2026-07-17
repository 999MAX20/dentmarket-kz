import { z } from "zod";

const idempotencyKey = z.string().trim().min(8).max(160);
const version = z.number().int().positive();
const evidence = z.record(z.string(), z.unknown()).nullable().optional();

export const createProductGapSchema = z.object({
  impactedOrganizationId: z.uuid().nullable().optional(),
  subjectType: z.string().trim().min(2).max(80),
  subjectId: z.string().trim().min(1).max(160),
  type: z.enum(["MATCHING_ERROR", "STALE_PRICE", "UNRELIABLE_STOCK", "PACKAGING_ERROR", "INCOMPLETE_DOCUMENTS", "DELIVERY_FAILURE", "SUSPICIOUS_PROMOTION", "FAKE_REVIEW", "UNVERIFIED_LOCATION", "PAYMENT_DETAILS_CHANGE", "OTHER"]),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  reasonCode: z.string().trim().min(2).max(100),
  explanation: z.string().trim().min(10).max(4_000),
  actionType: z.enum(["NONE", "REQUIRE_CONFIRMATION", "DOWNRANK", "DISABLE_COMPARISON", "RESTRICT_SCOPE", "HIDE_DISCOUNT", "HOLD_FOR_REVIEW", "FREEZE_CHANGE", "HARD_BLOCK"]).default("NONE"),
  actionExpiresAt: z.iso.datetime().nullable().optional(),
  remediation: z.string().trim().min(5).max(2_000),
  restorationCondition: z.string().trim().min(5).max(2_000),
  hardBlockReason: z.string().trim().min(10).max(2_000).nullable().optional(),
  sourceEntityType: z.string().trim().max(80).nullable().optional(),
  sourceEntityId: z.string().trim().max(160).nullable().optional(),
  idempotencyKey,
}).superRefine((value, context) => {
  if (value.actionType === "HARD_BLOCK" && value.severity !== "CRITICAL") context.addIssue({ code: "custom", path: ["severity"], message: "Hard block requires CRITICAL severity" });
  if (value.actionType === "HARD_BLOCK" && !value.hardBlockReason) context.addIssue({ code: "custom", path: ["hardBlockReason"], message: "Hard block requires a documented reason" });
});

export const updateProductGapSchema = z.object({
  version,
  status: z.enum(["OPEN", "SOFT_ACTION_ACTIVE", "RESOLVED", "HARD_BLOCKED"]),
  actionType: z.enum(["NONE", "REQUIRE_CONFIRMATION", "DOWNRANK", "DISABLE_COMPARISON", "RESTRICT_SCOPE", "HIDE_DISCOUNT", "HOLD_FOR_REVIEW", "FREEZE_CHANGE", "HARD_BLOCK"]).optional(),
  actionExpiresAt: z.iso.datetime().nullable().optional(),
  resolution: z.string().trim().min(5).max(2_000).nullable().optional(),
  explanation: z.string().trim().min(10).max(4_000).optional(),
  remediation: z.string().trim().min(5).max(2_000).optional(),
  restorationCondition: z.string().trim().min(5).max(2_000).optional(),
});

export const createTrustAppealSchema = z.object({
  reason: z.string().trim().min(20).max(4_000),
  evidence,
  eventIds: z.array(z.uuid()).max(100).default([]),
  idempotencyKey,
});

export const decideTrustAppealSchema = z.object({
  version,
  status: z.enum(["UPHELD", "PARTIALLY_UPHELD", "REJECTED"]),
  decision: z.string().trim().min(20).max(4_000),
  excludeEventIds: z.array(z.uuid()).max(100).default([]),
});

export const createOrderCommentSchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  idempotencyKey,
});

export const updateOrderCommentSchema = z.object({ body: z.string().trim().min(1).max(10_000), version });

const reviewDimensionsSchema = z.object({
  availabilityAccuracy: z.number().int().min(1).max(5),
  priceAccuracy: z.number().int().min(1).max(5),
  confirmationSpeed: z.number().int().min(1).max(5),
  completeness: z.number().int().min(1).max(5),
  delivery: z.number().int().min(1).max(5),
  documents: z.number().int().min(1).max(5),
  communication: z.number().int().min(1).max(5),
});

export const createVerifiedReviewSchema = z.object({
  productVariantId: z.uuid().nullable().optional(),
  overallRating: z.number().int().min(1).max(5),
  dimensions: reviewDimensionsSchema,
  comment: z.string().trim().max(4_000).nullable().optional(),
  idempotencyKey,
});

export const updateVerifiedReviewSchema = createVerifiedReviewSchema.omit({ idempotencyKey: true, productVariantId: true }).extend({ version, reason: z.string().trim().min(3).max(500).optional() });
export const respondVerifiedReviewSchema = z.object({ response: z.string().trim().min(2).max(4_000), version });
export const moderateVerifiedReviewSchema = z.object({ status: z.enum(["PUBLISHED", "HIDDEN"]), reason: z.string().trim().min(5).max(2_000), version });

export const recordTrustMetricSchema = z.object({
  supplierOrganizationId: z.uuid(),
  metricCode: z.enum(["availability_accuracy", "price_accuracy", "order_fulfillment", "confirmation_speed", "delivery_ontime", "document_quality", "communication_quality", "data_freshness", "dispute_resolution"]),
  value: z.number().min(0).max(1),
  weight: z.number().positive().max(100).default(1),
  categoryId: z.uuid().nullable().optional(),
  cityId: z.uuid().nullable().optional(),
  fulfillmentType: z.string().trim().max(80).nullable().optional(),
  sourceEntityType: z.string().trim().min(2).max(80),
  sourceEntityId: z.string().trim().min(1).max(160),
  occurredAt: z.iso.datetime(),
  metadata: evidence,
});

export const updateGeoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  district: z.string().trim().max(160).nullable().optional(),
  evidence,
  version,
});

export const verifyGeoPointSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  method: z.enum(["ORGANIZATION_DETAILS", "DOCUMENT", "MAP", "OPERATOR", "DELIVERY_HISTORY"]),
  evidence,
  reason: z.string().trim().min(5).max(1_000),
  version,
});

export const updateDeliveryZoneGeoSchema = z.object({
  zoneType: z.enum(["CITY_LIST", "REGION_LIST", "RADIUS", "HYBRID"]),
  centerLatitude: z.number().min(-90).max(90).nullable().optional(),
  centerLongitude: z.number().min(-180).max(180).nullable().optional(),
  radiusKm: z.number().positive().max(5_000).nullable().optional(),
  regionCodes: z.array(z.string().trim().min(2).max(20)).max(50).default([]),
  excludedCityIds: z.array(z.uuid()).max(200).default([]),
  version,
}).superRefine((value, context) => {
  if (["RADIUS", "HYBRID"].includes(value.zoneType) && (value.centerLatitude == null || value.centerLongitude == null || value.radiusKm == null)) context.addIssue({ code: "custom", message: "Radius zones require center coordinates and radius", path: ["radiusKm"] });
});

export const smartRecommendationSchema = z.object({
  buyerOrganizationId: z.uuid(),
  productId: z.uuid(),
  destinationAddressId: z.uuid(),
  quantity: z.number().positive().max(1_000_000).default(1),
  mode: z.enum(["URGENT", "VALUE", "BALANCED", "TRUSTED", "PERSONAL_PRICE"]).default("BALANCED"),
  idempotencyKey,
});

export const setPromotionPlacementSchema = z.object({
  isSponsored: z.boolean(),
  label: z.string().trim().min(3).max(80).default("Продвижение"),
  version,
});

export type CreateProductGapInput = z.infer<typeof createProductGapSchema>;
export type UpdateProductGapInput = z.infer<typeof updateProductGapSchema>;
export type CreateTrustAppealInput = z.infer<typeof createTrustAppealSchema>;
export type DecideTrustAppealInput = z.infer<typeof decideTrustAppealSchema>;
export type CreateVerifiedReviewInput = z.infer<typeof createVerifiedReviewSchema>;
export type RecordTrustMetricInput = z.infer<typeof recordTrustMetricSchema>;
export type SmartRecommendationInput = z.infer<typeof smartRecommendationSchema>;
