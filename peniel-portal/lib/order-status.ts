export type OrderStatus =
  | "submitted"
  | "confirmed"
  | "awaiting_approval"
  | "scheduled"
  | "in_production"
  | "quality_check"
  | "ready_for_pickup"
  | "dispatched"
  | "delivered"
  | "on_hold"
  | "rejected";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  submitted: "Submitted",
  confirmed: "Confirmed",
  awaiting_approval: "Awaiting approval",
  scheduled: "Scheduled",
  in_production: "In production",
  quality_check: "Quality check",
  ready_for_pickup: "Ready for pickup",
  dispatched: "Dispatched",
  delivered: "Delivered",
  on_hold: "On hold",
  rejected: "Rejected",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, "neutral" | "info" | "progress" | "success" | "warning" | "danger"> = {
  submitted: "neutral",
  confirmed: "info",
  awaiting_approval: "warning",
  scheduled: "info",
  in_production: "progress",
  quality_check: "progress",
  ready_for_pickup: "success",
  dispatched: "success",
  delivered: "success",
  on_hold: "danger",
  rejected: "danger",
};
