"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { CROWNS_PER_CARTON, parseGoodsQuantity } from "@/lib/produced-goods";
import { createClient } from "@/lib/supabase/server";

export type GoodsState = { error?: string; ok?: string } | null;

/** Admin, production and quality record produced goods (RLS enforces the same); only admin deletes. */
const WRITERS = ["admin", "production", "quality"] as const;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh() {
  revalidatePath("/ops/production", "layout");
  revalidatePath("/ops/quality", "layout");
  revalidatePath("/certificates", "layout");
  revalidatePath("/production", "layout");
}

/** Add produced goods for a batch of an order, or correct an entry (with its id). */
export async function saveProducedGoods(_prev: GoodsState, fd: FormData): Promise<GoodsState> {
  await requireStaff([...WRITERS]);
  const id = s(fd, "id");
  const orderId = s(fd, "order_id");
  const batch = s(fd, "batch_no");
  const qty = parseGoodsQuantity(s(fd, "quantity"), s(fd, "qty_unit") === "cartons" ? "cartons" : "crowns");
  const day = s(fd, "produced_on");
  const notes = s(fd, "notes").slice(0, 1000);

  if (!UUID.test(orderId)) return { error: "Choose the order." };
  if (!batch) return { error: "Enter the batch number." };
  if (batch.length > 40) return { error: "Batch number: up to 40 characters." };
  if (!Number.isFinite(qty) || qty <= 0) return { error: "Enter the quantity produced: a whole number of crowns (or cartons of 10,000)." };
  if (qty > 1_000_000_000) return { error: "That quantity is too large. Check the figure." };
  if (!DATE.test(day)) return { error: "Choose the date produced." };
  if (day > addisDateISO(new Date())) return { error: "The date produced can't be in the future." };

  const row = { order_id: orderId, batch_no: batch, quantity: qty, produced_on: day, notes: notes || null };
  const supabase = await createClient();
  const { error } = UUID.test(id) ? await supabase.from("produced_goods").update(row).eq("id", id) : await supabase.from("produced_goods").insert(row);
  if (error) {
    if (/row-level|permission/i.test(error.message)) return { error: "Your role can't record produced goods." };
    if (/foreign key/i.test(error.message)) return { error: "That order no longer exists." };
    return { error: "Couldn't save. Please try again." };
  }
  refresh();
  const amount = qty % CROWNS_PER_CARTON === 0 ? `${qty.toLocaleString("en-US")} crowns (${(qty / CROWNS_PER_CARTON).toLocaleString("en-US")} cartons)` : `${qty.toLocaleString("en-US")} crowns`;
  return { ok: UUID.test(id) ? `Saved: ${amount}, batch ${batch}.` : `Recorded ${amount} for batch ${batch}. Its certificate shows the batch total.` };
}

/** Admin: remove an entry made by mistake. */
export async function deleteProducedGoods(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("produced_goods").delete().eq("id", id);
  refresh();
}
