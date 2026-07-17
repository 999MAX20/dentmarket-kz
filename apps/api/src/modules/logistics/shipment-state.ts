import type { FulfillmentStepStatus, ShipmentStatus, SupplierOrderStatus } from "@prisma/client";

const shipmentTransitions: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["PACKING", "CANCELLED"],
  PACKING: ["READY", "CANCELLED"],
  READY: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["IN_TRANSIT", "DELIVERED", "FAILED"],
  IN_TRANSIT: ["PARTIALLY_DELIVERED", "DELIVERED", "FAILED"],
  PARTIALLY_DELIVERED: ["IN_TRANSIT", "DELIVERED", "RETURNED"],
  FAILED: ["PLANNED", "RETURNED"],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};

const fulfillmentTransitions: Record<FulfillmentStepStatus, readonly FulfillmentStepStatus[]> = {
  PENDING: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "FAILED", "CANCELLED"],
  FAILED: ["SCHEDULED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

const orderStatusByShipment: Partial<Record<ShipmentStatus, SupplierOrderStatus>> = {
  PACKING: "ASSEMBLING",
  READY: "READY_TO_SHIP",
  DISPATCHED: "SHIPPED",
  IN_TRANSIT: "IN_TRANSIT",
  PARTIALLY_DELIVERED: "IN_TRANSIT",
  DELIVERED: "DELIVERED",
  RETURNED: "RETURN_DISPUTE",
};

export function canTransitionShipment(from: ShipmentStatus, to: ShipmentStatus) {
  return shipmentTransitions[from].includes(to);
}

export function canTransitionFulfillment(from: FulfillmentStepStatus, to: FulfillmentStepStatus) {
  return fulfillmentTransitions[from].includes(to);
}

export function orderStatusForShipment(status: ShipmentStatus) {
  return orderStatusByShipment[status] ?? null;
}
