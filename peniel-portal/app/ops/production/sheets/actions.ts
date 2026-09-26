"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { formatSpoiledPct, wholeNumber } from "@/lib/print-runs";
import { addDays, SHIFTS } from "@/lib/production-math";
import { createClient } from "@/lib/supabase/server";

export type PrintRunState = { error?: string; ok?: string } | null;

/** Only admin and production record print runs (RLS enforces the same). */
const WRITERS = ["admin", "production"] as const;
const UUID = /^[0-9a-f-]{36}$/i;

function refresh() {
  revalidatePath("/ops/production", "layout");
  revalidatePath("/ops", "layout");
}

/** Record one coat & print run (internal only). */
export async function savePrintRun(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const date = s("run_date");
  const shift = s("shift");
  const orderId = s("order_id");
  const printed = wholeNumber(s("sheets_printed"));
  const spoiled = wholeNumber(s("sheets_spoiled"));
  const perSheet = wholeNumber(s("crowns_per_sheet"));
  const ovenRaw = s("oven_temp_c").replace(",", ".");
  const oven = ovenRaw ? Number(ovenRaw) : null;
  const colours = fd
    .getAll("colours")
    .map((c) => String(c).trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 8);
  const today = addisDateISO(new Date());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return { error: "Choose today or an earlier date." };
  if (date < addDays(today, -31)) return { error: "Runs more than a month old can't be added here." };
  if (!SHIFTS.includes(shift as (typeof SHIFTS)[number])) return { error: "Choose the shift." };
  if (!UUID.test(orderId)) return { error: "Choose the order." };
  if (!Number.isFinite(printed) || printed > 1_000_000) return { error: "Good sheets: enter a whole number." };
  if (!Number.isFinite(spoiled) || spoiled > 1_000_000) return { error: "Spoiled sheets: enter a whole number." };
  if (printed + spoiled === 0) return { error: "Enter the good or the spoiled sheets." };
  if (!Number.isFinite(perSheet) || perSheet < 1 || perSheet > 2000) return { error: "Crowns per sheet: enter a number from 1 to 2,000." };
  if (oven != null && (!Number.isFinite(oven) || oven < 0 || oven > 400)) return { error: "Oven temperature: enter °C, from 0 to 400." };

  const supabase = await createClient();
  const { error } = await supabase.from("print_runs").insert({
    order_id: orderId,
    run_date: date,
    shift,
    colours,
    sheets_printed: printed,
    sheets_spoiled: spoiled,
    crowns_per_sheet: perSheet,
    coating: s("coating").slice(0, 100) || null,
    lacquer: s("lacquer").slice(0, 100) || null,
    oven_temp_c: oven,
    coil_lot: s("coil_lot").slice(0, 60) || null,
    notes: s("notes").slice(0, 1000) || null,
  });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't record print runs." : "Couldn't save the run. Please try again." };

  refresh();
  return {
    ok: `Saved ${printed.toLocaleString("en-US")} good sheets, ${spoiled.toLocaleString("en-US")} spoiled (${formatSpoiledPct(printed, spoiled)}): about ${(printed * perSheet).toLocaleString("en-US")} crowns.`,
  };
}

/** Remove a run entered by mistake. */
export async function deletePrintRun(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("print_runs").delete().eq("id", id);
  refresh();
}
