"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisLocalToIso } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";

export type InvState = { error?: string; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const int = (v: string) => {
  const n = Number(v.replace(/[,\s]/g, ""));
  return Number.isInteger(n) ? n : NaN;
};

function refresh() {
  revalidatePath("/ops/inventory", "layout");
  revalidatePath("/production");
}

/** Finished goods into the warehouse (admin, warehouse, quality — RLS). */
export async function receiveStock(_prev: InvState, fd: FormData): Promise<InvState> {
  await requireStaff(["admin", "warehouse", "quality"]);
  const companyId = s(fd, "company_id");
  const brandId = s(fd, "brand_id");
  const orderId = s(fd, "order_id");
  const batch = s(fd, "batch_no");
  const qty = int(s(fd, "quantity"));
  const status = s(fd, "status");
  const reason = s(fd, "customer_reason");
  if (!UUID.test(companyId) || !UUID.test(brandId)) return { error: "Choose the customer and brand." };
  if (!batch) return { error: "Enter the batch number." };
  if (!(qty > 0)) return { error: "Enter the quantity." };
  if (!["available", "reserved", "on_hold"].includes(status)) return { error: "Choose the status." };
  if (status === "on_hold" && !reason) return { error: "Write the reason the customer will see for the hold." };

  const supabase = await createClient();
  const { error } = await supabase.from("finished_stock").insert({
    company_id: companyId,
    brand_id: brandId,
    order_id: UUID.test(orderId) ? orderId : null,
    batch_no: batch,
    quantity: qty,
    location: s(fd, "location") || null,
    status,
    customer_reason: reason || null,
  });
  if (error) {
    return { error: /foreign key|violates/.test(error.message) ? "The brand or order doesn't belong to that customer." : "Couldn't save the stock." };
  }
  refresh();
  return { ok: `Received ${qty.toLocaleString("en-US")} crowns, batch ${batch}.` };
}

export async function setStockStatus(_prev: InvState, fd: FormData): Promise<InvState> {
  await requireStaff(["admin", "warehouse", "quality"]);
  const id = s(fd, "id");
  const status = s(fd, "status");
  const reason = s(fd, "customer_reason");
  if (!UUID.test(id) || !["available", "reserved", "on_hold"].includes(status)) return { error: "Choose the status." };
  if (status === "on_hold" && !reason) return { error: "Write the reason the customer will see for the hold." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("finished_stock")
    .update({ status, customer_reason: status === "on_hold" ? reason : null, location: s(fd, "location") || null })
    .eq("id", id);
  if (error) return { error: "Couldn't update the stock." };
  refresh();
  return { ok: "Saved." };
}

/** Raw material in (+) or out (−); the trigger updates the stock on hand. */
export async function recordMaterial(_prev: InvState, fd: FormData): Promise<InvState> {
  const me = await requireStaff(["admin", "warehouse", "production"]);
  const id = s(fd, "material_id");
  const qty = Number(s(fd, "quantity").replace(",", "."));
  const dir = s(fd, "direction") === "out" ? -1 : 1;
  const reason = s(fd, "reason");
  if (!UUID.test(id)) return { error: "Choose the material." };
  if (!(qty > 0)) return { error: "Enter the quantity." };
  if (!reason) return { error: "Say why (e.g. delivery received, issued to Line 2)." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("raw_material_movements")
    .insert({ material_id: id, quantity: dir * qty, reason: reason.slice(0, 200), created_by: me.user_id });
  if (error) return { error: /not_negative/.test(error.message) ? "That's more than is in stock." : "Couldn't record the movement." };
  refresh();
  return { ok: "Recorded." };
}

export async function approvePickup(fd: FormData): Promise<void> {
  await requireStaff(["admin", "warehouse", "sales"]);
  const id = s(fd, "id");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data: b } = await supabase.from("pickup_bookings").select("requested_at, proposed_time").eq("id", id).maybeSingle<{ requested_at: string; proposed_time: string | null }>();
  if (!b) return;
  await supabase.from("pickup_bookings").update({ status: "confirmed", proposed_time: b.proposed_time ?? b.requested_at }).eq("id", id).neq("status", "collected");
  refresh();
}

export async function proposePickupTime(_prev: InvState, fd: FormData): Promise<InvState> {
  await requireStaff(["admin", "warehouse", "sales"]);
  const id = s(fd, "id");
  const at = addisLocalToIso(s(fd, "proposed_time"));
  if (!UUID.test(id) || !at) return { error: "Choose a date and time." };
  if (new Date(at) < new Date()) return { error: "Choose a time in the future." };
  const supabase = await createClient();
  const { error } = await supabase.from("pickup_bookings").update({ status: "rescheduled", proposed_time: at }).eq("id", id).neq("status", "collected");
  if (error) return { error: "Couldn't save the new time." };
  refresh();
  return { ok: "New time sent. The customer sees it on their Stock page." };
}

export async function recordCollection(_prev: InvState, fd: FormData): Promise<InvState> {
  await requireStaff(["admin", "warehouse", "sales"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_record_collection", {
    p_booking_id: s(fd, "id"),
    p_vehicle: s(fd, "vehicle"),
    p_driver: s(fd, "driver"),
    p_delivery_note: s(fd, "delivery_note_no"),
  });
  if (error) {
    return { error: /delivery note|already recorded/.test(error.message) ? error.message : "Couldn't record the collection." };
  }
  refresh();
  revalidatePath("/ops/orders", "layout");
  return { ok: "Collection recorded. Fully collected orders are now Delivered." };
}
