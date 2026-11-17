"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { cartonsLabel, parseDeliveryQuantity } from "@/lib/deliveries";
import { createClient } from "@/lib/supabase/server";

export type DeliveryState = { error?: string; ok?: string } | null;

/** Admin, sales and warehouse record deliveries (RLS enforces the same); only admin deletes. */
const WRITERS = ["admin", "sales", "warehouse"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function refresh(orderId: string) {
  revalidatePath(`/ops/orders/${orderId}`);
  revalidatePath("/ops/orders", "layout");
  revalidatePath("/orders", "layout");
}

/** Record a delivery (DO) of an order, or a return exchange. */
export async function addDelivery(_prev: DeliveryState, fd: FormData): Promise<DeliveryState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const orderId = s("order_id");
  const kind = s("kind") === "return_exchange" ? "return_exchange" : "delivery";
  const doNo = s("do_no").slice(0, 40);
  const day = s("delivered_on");
  const qty = parseDeliveryQuantity(s("quantity"), s("qty_unit") === "crowns" ? "crowns" : "cartons");
  if (!UUID.test(orderId)) return { error: "Order not found." };
  if (!doNo) return { error: "Enter the DO number." };
  if (!DATE.test(day)) return { error: "Choose the date delivered." };
  if (day > addisDateISO(new Date())) return { error: "The date delivered can't be in the future." };
  if (!Number.isFinite(qty)) return { error: "Enter the quantity: cartons of 10,000, or crowns." };
  const supabase = await createClient();
  const { error } = await supabase.from("order_deliveries").insert({
    order_id: orderId,
    kind,
    do_no: doNo,
    delivered_on: day,
    quantity: qty,
    notes: s("notes").slice(0, 1000) || null,
  });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't record deliveries." : "Couldn't save the delivery. Please try again." };
  refresh(orderId);
  return { ok: `${kind === "return_exchange" ? "Return exchange" : "Delivery"} DO ${doNo}: ${cartonsLabel(qty)} recorded.` };
}

/** Admin: remove a delivery entered by mistake. */
export async function deleteDelivery(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
  const id = String(fd.get("id") ?? "");
  const orderId = String(fd.get("order_id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("order_deliveries").delete().eq("id", id);
  if (UUID.test(orderId)) refresh(orderId);
}
