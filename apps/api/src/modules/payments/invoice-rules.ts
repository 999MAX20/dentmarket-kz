export type InvoiceDraft = {
  invoiceNumber: string;
  paymentIntentId: string;
  paymentAllocationId: string;
  supplierOrderId: string;
  amountMinor: string;
  currency: string;
  status: "ISSUED";
  issuedAt: string;
  dueAt: string;
  paymentInstructions: string;
  bankDetailsRequired: boolean;
  bankDetails?: { bankName: string; iban: string; bik: string; beneficiary: string };
};

export function buildInvoiceDraft(input: { paymentIntentId: string; paymentAllocationId: string; supplierOrderId: string; amountMinor: string; currency: string; issuedAt?: Date; dueInDays?: number; bankDetails?: InvoiceDraft["bankDetails"] }): InvoiceDraft {
  const issuedAt = input.issuedAt ?? new Date();
  const dueInDays = input.dueInDays ?? 5;
  if (!Number.isInteger(dueInDays) || dueInDays < 1 || dueInDays > 30) throw new Error("Invoice due period must be between 1 and 30 days");
  if (BigInt(input.amountMinor) <= 0n) throw new Error("Invoice amount must be positive");
  const date = issuedAt.toISOString().slice(0, 10).replaceAll("-", "");
  const sequence = input.paymentAllocationId.replaceAll("-", "").slice(0, 8).toUpperCase();
  const dueAt = new Date(issuedAt.getTime() + dueInDays * 86_400_000);
  return {
    invoiceNumber: `DM-${date}-${sequence}`,
    paymentIntentId: input.paymentIntentId,
    paymentAllocationId: input.paymentAllocationId,
    supplierOrderId: input.supplierOrderId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    status: "ISSUED",
    issuedAt: issuedAt.toISOString(),
    dueAt: dueAt.toISOString(),
    paymentInstructions: "Перечислите сумму по реквизитам поставщика и укажите номер счёта в назначении платежа.",
    bankDetailsRequired: !input.bankDetails,
    ...(input.bankDetails ? { bankDetails: input.bankDetails } : {}),
  };
}
