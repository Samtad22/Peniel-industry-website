import { formatDayMonth } from "./format.ts";
import type { OrderStatus } from "./order-status.ts";

export type TimelineEvent = { status: OrderStatus; created_at: string; customer_reason?: string | null };

export type TimelineStep = {
  label: string;
  /** Short date, e.g. `20 Nov`, or `due 14 Oct` for the final future step. */
  date: string;
  state: "done" | "now" | "next";
  /** Customer-facing reason given with this change (a hold, rejection or new date). */
  note?: string | null;
};

const LABELS: Record<OrderStatus, string> = {
  submitted: "Order submitted",
  confirmed: "Order confirmed",
  awaiting_approval: "Artwork approval",
  scheduled: "Scheduled",
  in_production: "In production",
  quality_check: "QC inspection",
  ready_for_pickup: "Ready for pickup",
  dispatched: "Dispatched",
  delivered: "Delivered",
  on_hold: "On hold",
  rejected: "Rejected",
};

/** The usual path; artwork approval only appears when it happened. */
const PATH: OrderStatus[] = [
  "submitted",
  "confirmed",
  "scheduled",
  "in_production",
  "quality_check",
  "ready_for_pickup",
  "delivered",
];

const rank = (s: OrderStatus) => {
  if (s === "awaiting_approval") return 1.5;
  if (s === "dispatched") return PATH.indexOf("ready_for_pickup");
  return PATH.indexOf(s);
};

/**
 * The order's progress as shown to both sides: what happened (from the
 * status events), where it is now, and the steps still to come.
 */
export function buildTimeline(order: {
  status: OrderStatus;
  delivery_method: "pickup" | "delivery";
  due_date: string | null;
  events: TimelineEvent[];
}): TimelineStep[] {
  const events = [...order.events].sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Drop repeats of the same status in a row (e.g. a reason edit).
  const past = events.filter((e, i) => i === 0 || e.status !== events[i - 1].status);

  const steps: TimelineStep[] = past.map((e, i) => ({
    label: LABELS[e.status],
    date: formatDayMonth(e.created_at),
    state: i === past.length - 1 && e.status !== "delivered" ? "now" : "done",
    note: e.customer_reason || undefined,
  }));

  if (order.status === "rejected" || order.status === "delivered") return steps;

  const reached = Math.max(-1, ...past.map((e) => rank(e.status)).filter((r) => r >= 0));
  const handover: OrderStatus = order.delivery_method === "delivery" ? "dispatched" : "ready_for_pickup";
  for (const s of PATH) {
    if (PATH.indexOf(s) <= reached) continue;
    const status = s === "ready_for_pickup" ? handover : s;
    steps.push({
      label: LABELS[status],
      date: s === "delivered" && order.due_date ? `due ${formatDayMonth(order.due_date)}` : "",
      state: "next",
    });
  }
  return steps;
}
