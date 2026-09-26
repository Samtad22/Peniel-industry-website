"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { CROWNS_PER_SHEET, formatSpoiledPct, wholeNumber } from "@/lib/print-runs";
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

/** Most sheets one stillage holds; more means a typo (a stillage is about 1,400 to 1,420). */
const MAX_STILLAGE = 3_000;

/** Record one finished stillage of printed sheets (internal only). */
export async function savePrintRun(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const date = s("run_date");
  const shift = s("shift");
  const brandId = s("brand_id");
  const stillage = s("stillage_no").slice(0, 40);
  const printed = wholeNumber(s("sheets_printed"));
  const spoiled = wholeNumber(s("sheets_spoiled"));
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
  if (!UUID.test(brandId)) return { error: "Choose the brand printed." };
  if (!Number.isFinite(printed) || printed > MAX_STILLAGE) return { error: `Good sheets: enter the sheets on this stillage (up to ${MAX_STILLAGE.toLocaleString("en-US")}).` };
  if (!Number.isFinite(spoiled) || spoiled > MAX_STILLAGE) return { error: "Spoiled sheets: enter a whole number." };
  if (printed + spoiled === 0) return { error: "Enter the good or the spoiled sheets." };
  if (oven != null && (!Number.isFinite(oven) || oven < 0 || oven > 400)) return { error: "Oven temperature: enter °C, from 0 to 400." };

  const supabase = await createClient();
  const { error } = await supabase.from("print_runs").insert({
    brand_id: brandId,
    stillage_no: stillage || null,
    run_date: date,
    shift,
    colours,
    sheets_printed: printed,
    sheets_spoiled: spoiled,
    crowns_per_sheet: CROWNS_PER_SHEET,
    varnish: s("varnish").slice(0, 100) || null,
    lacquer: s("lacquer").slice(0, 100) || null,
    oven_temp_c: oven,
    coil_lot: s("coil_lot").slice(0, 60) || null,
    notes: s("notes").slice(0, 1000) || null,
  });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save the stillage. Please try again." };

  refresh();
  return {
    ok: `Stillage${stillage ? ` ${stillage}` : ""} saved: ${printed.toLocaleString("en-US")} good sheets, ${spoiled.toLocaleString("en-US")} spoiled (${formatSpoiledPct(printed, spoiled)}).`,
  };
}

/** Remove a stillage entered by mistake. */
export async function deletePrintRun(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("print_runs").delete().eq("id", id);
  refresh();
}
