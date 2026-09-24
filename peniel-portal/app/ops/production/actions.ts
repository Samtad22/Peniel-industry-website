"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { addDays, SHIFTS } from "@/lib/production-math";
import { createClient } from "@/lib/supabase/server";

export type ProductionState = { error?: string; ok?: string } | null;

/** Only admin and production enter or publish production (RLS enforces the same). */
const WRITERS = ["admin", "production"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

function refresh() {
  revalidatePath("/ops/production", "layout");
  revalidatePath("/production-entry");
  revalidatePath("/ops/orders", "layout");
}

const count = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

export async function saveEntry(_prev: ProductionState, fd: FormData): Promise<ProductionState> {
  const me = await requireStaff([...WRITERS]);
  const date = String(fd.get("entry_date") ?? "");
  const shift = String(fd.get("shift") ?? "");
  const lineId = String(fd.get("line_id") ?? "");
  const orderId = String(fd.get("order_id") ?? "");
  const produced = count(fd.get("produced"));
  const rejects = count(fd.get("rejects"));
  const today = addisDateISO(new Date());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return { error: "Choose today or an earlier date." };
  if (date < addDays(today, -31)) return { error: "Entries more than a month old can't be added here." };
  if (!SHIFTS.includes(shift as (typeof SHIFTS)[number])) return { error: "Choose the shift." };
  if (!UUID.test(lineId)) return { error: "Choose the line." };
  if (!UUID.test(orderId)) return { error: "Choose the order." };
  if (!Number.isFinite(produced) || produced === 0) return { error: "Enter the crowns produced." };
  if (!Number.isFinite(rejects)) return { error: "Rejects must be a whole number." };
  if (rejects > produced) return { error: "Rejects can't be more than the crowns produced." };

  const supabase = await createClient();
  const { error } = await supabase.from("production_entries").insert({
    entry_date: date,
    shift,
    line_id: lineId,
    order_id: orderId,
    produced_qty: produced,
    reject_qty: rejects,
    entered_by: me.user_id,
  });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't enter production." : "Couldn't save the entry. Please try again." };

  refresh();
  return { ok: `Saved ${produced.toLocaleString("en-US")} crowns. Not shown to the customer until published.` };
}

export async function deleteEntry(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("production_entries").delete().eq("id", id).eq("published", false);
  refresh();
}

export async function setEntryPublished(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("production_entries").update({ published: fd.get("published") === "true" }).eq("id", id);
  refresh();
}

/** Publish every unpublished entry of an order to the customer. */
export async function publishOrder(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const orderId = String(fd.get("order_id") ?? "");
  if (!UUID.test(orderId)) return;
  const supabase = await createClient();
  await supabase.from("production_entries").update({ published: true }).eq("order_id", orderId).eq("published", false);
  refresh();
}
