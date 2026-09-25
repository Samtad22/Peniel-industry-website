"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { addisLocalToIso } from "@/lib/inventory";
import { createClient } from "@/lib/supabase/server";
import { notifyPickupRequested } from "@/lib/notify";

export type PickupState = { error?: string; ok?: string } | null;

/** Book a pickup of available stock (customer_request_pickup checks the stock is yours). */
export async function bookPickup(_prev: PickupState, fd: FormData): Promise<PickupState> {
  await requireCustomer();
  const ids = fd.getAll("stock_id").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const at = addisLocalToIso(String(fd.get("requested_at") ?? ""));
  const note = String(fd.get("note") ?? "").trim();
  if (ids.length === 0) return { error: "Choose the batches to collect." };
  if (!at) return { error: "Choose a date and time." };
  if (note.length > 500) return { error: "Keep the note under 500 characters." };
  const supabase = await createClient();
  const { data: bookingId, error } = await supabase.rpc("customer_request_pickup", { p_stock_ids: ids, p_requested_at: at, p_note: note || null });
  if (error) {
    return { error: /future|not available/.test(error.message) ? error.message : "We couldn't book the pickup. Please try again." };
  }
  revalidatePath("/production");
  if (bookingId) notifyPickupRequested(bookingId as string);
  return { ok: "Pickup requested. Peniel will confirm the time." };
}
