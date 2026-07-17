import { z } from "zod";

const moneyMinor = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const currency = z.string().trim().regex(/^[A-Z]{3}$/).default("KZT");

export const socialExchangeSchema = z.object({
  provider: z.enum(["GOOGLE", "APPLE"]),
  idToken: z.string().min(32).max(16_384),
  organizationId: z.uuid().optional(),
  invitationToken: z.string().min(24).max(512).optional(),
  registrationToken: z.string().min(32).max(512).optional(),
});

export const demoSessionSchema = z.object({
  capability: z.enum(["BUYER", "SUPPLIER"]),
});

export const createRegistrationIntentSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  ownerDisplayName: z.string().trim().min(2).max(160),
  legalName: z.string().trim().min(2).max(240),
  organizationDisplayName: z.string().trim().min(2).max(160),
  bin: z.string().regex(/^\d{12}$/, "БИН должен содержать 12 цифр"),
  capability: z.enum(["BUYER", "SUPPLIER"]),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
  marketingConsent: z.boolean().default(false),
  consentVersion: z.string().trim().min(1).max(40).default("2026-07-17"),
  source: z.string().trim().min(2).max(80).default("landing"),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const completeDevelopmentRegistrationSchema = z.object({
  registrationToken: z.string().min(32).max(512),
});

export const createBuyerSupplierAgreementSchema = z.object({
  supplierOrganizationId: z.uuid(),
  buyerOrganizationId: z.uuid(),
  renewalMode: z.enum(["AUTO_ANNUAL", "MANUAL_ANNUAL"]).default("AUTO_ANNUAL"),
});

export const signBuyerSupplierAgreementSchema = z.object({
  signerName: z.string().trim().min(2).max(240),
  expiresInMinutes: z.number().int().min(5).max(24 * 60).default(60),
});

export const buyerSupplierAgreementDecisionSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(32).max(512).optional(),
  csrfToken: z.string().min(24).max(256).optional(),
});

export const switchSessionOrganizationSchema = z.object({ organizationId: z.uuid() });
export const revokeSessionSchema = z.object({ reason: z.string().trim().min(3).max(240).default("user_requested") });
export const unlinkExternalIdentitySchema = z.object({ provider: z.enum(["GOOGLE", "APPLE"]) });

const promotionScopeSchema = z.object({
  offerIds: z.array(z.uuid()).max(500).default([]),
  productIds: z.array(z.uuid()).max(500).default([]),
  categoryIds: z.array(z.uuid()).max(200).default([]),
  cityIds: z.array(z.uuid()).max(200).default([]),
  warehouseIds: z.array(z.uuid()).max(200).default([]),
});

export const createPromotionSchema = z.object({
  name: z.string().trim().min(3).max(160),
  description: z.string().trim().max(1_000).nullable().optional(),
  kind: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
  percentageBasisPoints: z.number().int().min(1).max(9_000).nullable().optional(),
  fixedAmountMinor: moneyMinor.nullable().optional(),
  currency: currency.nullable().optional(),
  minimumOrderMinor: moneyMinor.nullable().optional(),
  minimumQuantity: z.number().positive().nullable().optional(),
  scope: promotionScopeSchema,
  couponCode: z.string().trim().min(4).max(64).nullable().optional(),
  isPrivate: z.boolean().default(false),
  usageLimit: z.number().int().positive().max(10_000_000).nullable().optional(),
  perBuyerLimit: z.number().int().positive().max(10_000).nullable().optional(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
}).superRefine((value, context) => {
  if (value.startsAt >= value.endsAt) context.addIssue({ code: "custom", path: ["endsAt"], message: "Promotion end must be after start" });
  if (value.kind === "PERCENTAGE" && value.percentageBasisPoints == null) context.addIssue({ code: "custom", path: ["percentageBasisPoints"], message: "Percentage promotion requires percentageBasisPoints" });
  if (value.kind === "FIXED_AMOUNT" && value.fixedAmountMinor == null) context.addIssue({ code: "custom", path: ["fixedAmountMinor"], message: "Fixed promotion requires fixedAmountMinor" });
  if (value.isPrivate && !value.couponCode) context.addIssue({ code: "custom", path: ["couponCode"], message: "Private promotion requires coupon code" });
});

export const updatePromotionStatusSchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "ARCHIVED"]),
  version: z.number().int().positive(),
});

export const evaluatePromotionSchema = z.object({
  offerId: z.uuid(),
  buyerOrganizationId: z.uuid(),
  quantity: z.number().positive(),
  subtotalMinor: moneyMinor,
  currency,
  cityId: z.uuid().nullable().optional(),
  warehouseId: z.uuid().nullable().optional(),
  couponCode: z.string().trim().max(64).nullable().optional(),
  at: z.iso.datetime().optional(),
});

export const redeemPromotionSchema = evaluatePromotionSchema.extend({
  promotionId: z.uuid(),
  checkoutId: z.uuid().nullable().optional(),
  supplierOrderId: z.uuid().nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(160),
});

export const createSavedListSchema = z.object({ name: z.string().trim().min(2).max(120), isDefault: z.boolean().default(false) });
export const upsertSavedListItemSchema = z.object({ offerId: z.uuid(), quantity: z.number().positive().default(1), note: z.string().trim().max(500).nullable().optional() });

export const createCostCenterSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_.-]+$/),
  name: z.string().trim().min(2).max(160),
  managerId: z.uuid().nullable().optional(),
});

export const createPurchaseBudgetSchema = z.object({
  costCenterId: z.uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  limitMinor: moneyMinor,
  currency,
}).refine((value) => value.periodStart < value.periodEnd, { path: ["periodEnd"], message: "Budget end must be after start" });

export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(4).max(200),
  description: z.string().trim().min(10).max(10_000),
  category: z.string().trim().min(2).max(80),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  links: z.array(z.object({ entityType: z.string().trim().min(2).max(80), entityId: z.string().trim().min(1).max(160), label: z.string().trim().max(160).optional() })).max(20).default([]),
});

export const addSupportMessageSchema = z.object({
  body: z.string().trim().min(1).max(20_000),
  isInternal: z.boolean().default(false),
  attachments: z.array(z.object({ assetId: z.uuid(), name: z.string().trim().max(240) })).max(10).default([]),
});

export const updateSupportTicketSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  assigneeId: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one support field must be updated");

export const startImpersonationSchema = z.object({
  targetUserId: z.uuid(),
  targetOrganizationId: z.uuid(),
  ticketId: z.uuid().nullable().optional(),
  reason: z.string().trim().min(10).max(500),
  durationMinutes: z.number().int().min(1).max(30).default(10),
});

export const createBillingPlanSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9_.-]+$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1_000).nullable().optional(),
  monthlyPriceMinor: moneyMinor,
  currency,
  trialDays: z.number().int().min(0).max(365).default(0),
  graceDays: z.number().int().min(0).max(90).default(7),
  entitlements: z.array(z.object({ featureKey: z.string().trim().min(2).max(100), enabled: z.boolean().default(true), limits: z.record(z.string(), z.unknown()).nullable().optional() })).max(100).default([]),
});

export const createSubscriptionSchema = z.object({
  organizationId: z.uuid(),
  planId: z.uuid(),
  startsAt: z.iso.datetime().optional(),
});

export const setOrganizationFeatureSchema = z.object({
  enabled: z.boolean(),
  limits: z.record(z.string(), z.unknown()).nullable().optional(),
  expiresAt: z.iso.datetime().nullable().optional(),
});

export const createAiConversationSchema = z.object({ role: z.enum(["BUYER", "SUPPLIER", "OPERATOR", "SUPPORT"]), title: z.string().trim().max(160).nullable().optional() });
export const sendAiMessageSchema = z.object({ content: z.string().trim().min(2).max(4_000), confirmedToolExecutionId: z.uuid().nullable().optional() });
export const aiFeedbackSchema = z.object({ messageId: z.uuid().nullable().optional(), rating: z.number().int().min(-1).max(1), comment: z.string().trim().max(1_000).nullable().optional() });

export const submitProductCandidateSchema = z.object({
  proposedName: z.string().trim().min(3).max(240),
  proposedSku: z.string().trim().max(120).nullable().optional(),
  proposedGtin: z.string().trim().regex(/^\d{8,14}$/).nullable().optional(),
  proposedBrand: z.string().trim().max(160).nullable().optional(),
  suggestedCategoryId: z.uuid().nullable().optional(),
  rawSubmission: z.record(z.string(), z.unknown()).default({}),
});

export const initiateMarketplaceAgreementSchema = z.object({
  supplierOrganizationId: z.uuid().optional(),
  renewalMode: z.enum(["AUTO_ANNUAL", "MANUAL_ANNUAL"]).default("AUTO_ANNUAL"),
});

export const signMarketplaceAgreementSchema = z.object({
  signerName: z.string().trim().min(2).max(240),
  expiresInMinutes: z.number().int().min(5).max(1_440).default(60),
});

export const marketplaceAgreementDecisionSchema = z.object({
  reason: z.string().trim().min(10).max(1_000),
});

export const signatureGatewayCallbackSchema = z.object({
  signatureId: z.uuid(),
  externalSessionId: z.string().trim().min(6).max(240),
  status: z.enum(["SIGNED", "REJECTED", "FAILED"]),
  externalSignatureId: z.string().trim().max(240).nullable().optional(),
  signatureHash: z.string().trim().min(32).max(512).nullable().optional(),
  rejectionReason: z.string().trim().max(1_000).nullable().optional(),
  signedDocumentChecksum: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  certificate: z.object({
    subjectBin: z.string().regex(/^\d{12}$/),
    issuer: z.string().trim().min(2).max(500),
    serialNumber: z.string().trim().min(2).max(240),
    validFrom: z.iso.datetime(),
    validTo: z.iso.datetime(),
  }),
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export type SocialExchangeInput = z.infer<typeof socialExchangeSchema>;
export type CreateRegistrationIntentInput = z.infer<typeof createRegistrationIntentSchema>;
export type CreateBuyerSupplierAgreementInput = z.infer<typeof createBuyerSupplierAgreementSchema>;
export type SignBuyerSupplierAgreementInput = z.infer<typeof signBuyerSupplierAgreementSchema>;
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
export type EvaluatePromotionInput = z.infer<typeof evaluatePromotionSchema>;
export type RedeemPromotionInput = z.infer<typeof redeemPromotionSchema>;
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
export type AddSupportMessageInput = z.infer<typeof addSupportMessageSchema>;
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;
export type CreateBillingPlanInput = z.infer<typeof createBillingPlanSchema>;
export type SendAiMessageInput = z.infer<typeof sendAiMessageSchema>;
export type SubmitProductCandidateInput = z.infer<typeof submitProductCandidateSchema>;
