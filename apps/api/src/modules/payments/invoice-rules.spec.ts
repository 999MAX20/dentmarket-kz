import { describe, expect, it } from "vitest";
import { buildInvoiceDraft } from "./invoice-rules";

describe("invoice creation", () => {
  it("creates a deterministic invoice draft for a supplier allocation", () => {
    const invoice = buildInvoiceDraft({ paymentIntentId: "intent-1", paymentAllocationId: "12345678-aaaa-bbbb-cccc-dddddddddddd", supplierOrderId: "order-1", amountMinor: "125000", currency: "KZT", issuedAt: new Date("2026-07-27T10:00:00.000Z") });
    expect(invoice).toMatchObject({ invoiceNumber: "DM-20260727-12345678", amountMinor: "125000", currency: "KZT", status: "ISSUED", bankDetailsRequired: true });
    expect(invoice.dueAt).toBe("2026-08-01T10:00:00.000Z");
  });

  it("rejects invalid invoice amounts and due periods", () => {
    expect(() => buildInvoiceDraft({ paymentIntentId: "intent-1", paymentAllocationId: "allocation-1", supplierOrderId: "order-1", amountMinor: "0", currency: "KZT" })).toThrow("positive");
    expect(() => buildInvoiceDraft({ paymentIntentId: "intent-1", paymentAllocationId: "allocation-1", supplierOrderId: "order-1", amountMinor: "100", currency: "KZT", dueInDays: 31 })).toThrow("between 1 and 30");
  });
});
