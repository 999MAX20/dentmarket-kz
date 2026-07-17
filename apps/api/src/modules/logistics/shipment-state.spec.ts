import { describe, expect, it } from "vitest";
import { canTransitionFulfillment, canTransitionShipment, orderStatusForShipment } from "./shipment-state";

describe("shipment state machine", () => {
  it("accepts only explicit shipment transitions", () => {
    expect(canTransitionShipment("DRAFT", "PLANNED")).toBe(true);
    expect(canTransitionShipment("READY", "DISPATCHED")).toBe(true);
    expect(canTransitionShipment("DRAFT", "DELIVERED")).toBe(false);
    expect(canTransitionShipment("DELIVERED", "RETURNED")).toBe(false);
    expect(orderStatusForShipment("PARTIALLY_DELIVERED")).toBe("IN_TRANSIT");
  });

  it("prevents completed fulfillment from reopening", () => {
    expect(canTransitionFulfillment("PENDING", "IN_PROGRESS")).toBe(true);
    expect(canTransitionFulfillment("FAILED", "SCHEDULED")).toBe(true);
    expect(canTransitionFulfillment("COMPLETED", "IN_PROGRESS")).toBe(false);
  });
});
