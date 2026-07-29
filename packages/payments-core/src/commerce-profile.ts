export type CommerceTier = "BASIC" | "SMART" | "ENTERPRISE";
export type CommerceOperatingMode = "MANUAL" | "SEMI_AUTOMATED" | "AUTOMATED";

export type CommercePaymentMethod =
  | "CARD"
  | "CORPORATE_CARD"
  | "QR"
  | "BANK_TRANSFER"
  | "INVOICE"
  | "DEFERRED_PAYMENT"
  | "CREDIT"
  | "INSTALLMENT";

export type CommerceIntegration = "NONE" | "EXCEL_PDF" | "ERP_API" | "ERP_WMS_EDO";

export type CommerceProfile = {
  tier: CommerceTier;
  operatingMode: CommerceOperatingMode;
  integration: CommerceIntegration;
  paymentMethods: CommercePaymentMethod[];
  bankAddOnEnabled: boolean;
  autoPriceStock: boolean;
  autoOrderConfirmation: boolean;
  electronicDocuments: boolean;
  autoPaymentMatching: boolean;
  autoRefunds: boolean;
};

export type CommercePolicy = {
  canTrade: true;
  manualFlowAllowed: true;
  enabledPaymentMethods: CommercePaymentMethod[];
  workflow: {
    mode: CommerceOperatingMode;
    import: boolean;
    matching: boolean;
    supplierConfirmation: boolean;
    exceptionHandling: true;
  };
  automation: {
    priceStock: boolean;
    orderConfirmation: boolean;
    documents: boolean;
    paymentMatching: boolean;
    refunds: boolean;
  };
  bankAddOn: {
    enabled: boolean;
    requiresProviderCredentials: boolean;
    protectsCardData: false;
  };
};

const tierRank: Record<CommerceTier, number> = { BASIC: 0, SMART: 1, ENTERPRISE: 2 };

export function deriveCommerceTier(input: Pick<CommerceProfile, "integration" | "autoPriceStock" | "autoOrderConfirmation" | "electronicDocuments" | "autoPaymentMatching">): CommerceTier {
  if (input.integration === "ERP_WMS_EDO" && input.autoPriceStock && input.autoOrderConfirmation && input.electronicDocuments && input.autoPaymentMatching) return "ENTERPRISE";
  if (input.integration === "ERP_API" || input.autoPriceStock || input.autoOrderConfirmation || input.electronicDocuments || input.autoPaymentMatching) return "SMART";
  return "BASIC";
}

export function normalizeCommerceProfile(input: Partial<CommerceProfile> = {}): CommerceProfile {
  const integration = input.integration ?? "NONE";
  const inferredMode: CommerceOperatingMode = integration === "EXCEL_PDF" ? "SEMI_AUTOMATED" : integration === "ERP_API" || integration === "ERP_WMS_EDO" ? "AUTOMATED" : "MANUAL";
  const profile: CommerceProfile = {
    tier: input.tier ?? "BASIC",
    operatingMode: input.operatingMode ?? inferredMode,
    integration,
    paymentMethods: [...new Set<CommercePaymentMethod>(input.paymentMethods ?? ["CARD", "BANK_TRANSFER", "INVOICE"])],
    bankAddOnEnabled: input.bankAddOnEnabled ?? false,
    autoPriceStock: input.autoPriceStock ?? false,
    autoOrderConfirmation: input.autoOrderConfirmation ?? false,
    electronicDocuments: input.electronicDocuments ?? false,
    autoPaymentMatching: input.autoPaymentMatching ?? false,
    autoRefunds: input.autoRefunds ?? false,
  };
  const derived = deriveCommerceTier(profile);
  if (tierRank[profile.tier] > tierRank[derived]) profile.tier = derived;
  return profile;
}

export function buildCommercePolicy(input: Partial<CommerceProfile> = {}): CommercePolicy {
  const profile = normalizeCommerceProfile(input);
  return {
    canTrade: true,
    manualFlowAllowed: true,
    enabledPaymentMethods: profile.paymentMethods,
    workflow: { mode: profile.operatingMode, import: profile.operatingMode !== "MANUAL", matching: profile.operatingMode !== "MANUAL", supplierConfirmation: profile.operatingMode !== "AUTOMATED", exceptionHandling: true },
    automation: {
      priceStock: profile.autoPriceStock,
      orderConfirmation: profile.autoOrderConfirmation,
      documents: profile.electronicDocuments,
      paymentMatching: profile.autoPaymentMatching,
      refunds: profile.autoRefunds,
    },
    bankAddOn: {
      enabled: profile.bankAddOnEnabled,
      requiresProviderCredentials: profile.bankAddOnEnabled,
      protectsCardData: false,
    },
  };
}

export function assertPaymentMethodEnabled(profile: Partial<CommerceProfile>, method: CommercePaymentMethod): void {
  if (!normalizeCommerceProfile(profile).paymentMethods.includes(method)) throw new Error(`Payment method ${method} is not enabled for this organization`);
}

export function validatePaymentMethodPolicy(profile: Partial<CommerceProfile>, method: CommercePaymentMethod): { allowed: boolean; reason?: string } {
  const normalized = normalizeCommerceProfile(profile);
  if (normalized.paymentMethods.includes(method)) return { allowed: true };
  return { allowed: false, reason: `Payment method ${method} is not enabled for this organization` };
}
