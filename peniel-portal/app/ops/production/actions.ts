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
  await requireStaff([...WRITERS]);
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

  // The printed stillage(s) it was pressed from (required), and any whose sheets are now all used.
  const stillages = [...new Set(fd.getAll("stillage").map(String).filter((id) => UUID.test(id)))];
  const usedUp = [...new Set(fd.getAll("used_up").map(String))].filter((id) => stillages.includes(id));
  if (stillages.length === 0) return { error: "Choose the printed stillage(s) this was pressed from." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_production_entry", {
    p_entry_date: date,
    p_shift: shift,
    p_line_id: lineId,
    p_order_id: orderId,
    p_produced: produced,
    p_rejects: rejects,
    p_stillages: stillages,
    p_used_up: usedUp,
  });
  if (error) {
    if (/stillage_not_at_press/.test(error.message)) return { error: "That stillage isn't at a press any more. Refresh the page." };
    if (/stillage_wrong_brand/.test(error.message)) return { error: "That stillage is a different brand from the order." };
    if (/stillage_required/.test(error.message)) return { error: "Choose the printed stillage(s) this was pressed from." };
    return { error: /row-level|permission/i.test(error.message) ? "Your role can't enter production." : "Couldn't save the entry. Please try again." };
  }

  refresh();
  revalidatePath("/ops/production/sheets");
  const done = usedUp.length ? ` ${usedUp.length === 1 ? "1 stillage" : `${usedUp.length} stillages`} marked used up.` : "";
  return { ok: `Saved ${produced.toLocaleString("en-US")} crowns.${done} Not shown to the customer until published.` };
}

export async function deleteEntry(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
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
