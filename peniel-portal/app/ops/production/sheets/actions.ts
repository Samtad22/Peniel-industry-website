"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisDateISO } from "@/lib/format";
import { addisLocalToIso } from "@/lib/inventory";
import { BASE_COAT_LABEL, CROWNS_PER_SHEET, formatSpoiledPct, minutesBetween, OVEN_STAGE_LABEL, wholeNumber, type BaseCoat, type OvenStage } from "@/lib/print-runs";
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

/** Record a stillage off the print line (printer + UV dryer): the start of its process (internal only). */
export async function savePrintRun(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const date = s("run_date");
  const shift = s("shift");
  const brandId = s("brand_id");
  const stillage = s("stillage_no").slice(0, 40);
  const printed = wholeNumber(s("sheets_printed"));
  const spoiled = wholeNumber(s("sheets_spoiled"));
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
  if (!stillage) return { error: "Enter the stillage number, so its varnish and lacquer can be logged against it." };
  if (!Number.isFinite(printed) || printed > MAX_STILLAGE) return { error: `Good sheets: enter the sheets on this stillage (up to ${MAX_STILLAGE.toLocaleString("en-US")}).` };
  if (!Number.isFinite(spoiled) || spoiled > MAX_STILLAGE) return { error: "Spoiled sheets: enter a whole number." };
  if (printed + spoiled === 0) return { error: "Enter the good or the spoiled sheets." };

  const supabase = await createClient();
  // A base-coated stillage waiting for the print line: print that one.
  const existing = s("id");
  if (UUID.test(existing)) {
    const { data: row, error } = await supabase
      .from("print_runs")
      .update({
        run_date: date,
        shift,
        colours,
        sheets_printed: printed,
        sheets_spoiled: spoiled,
        crowns_per_sheet: CROWNS_PER_SHEET,
        coil_lot: s("coil_lot").slice(0, 60) || null,
        notes: s("notes").slice(0, 1000) || null,
        printed: true,
      })
      .eq("id", existing)
      .eq("printed", false)
      .select("stillage_no")
      .maybeSingle<{ stillage_no: string | null }>();
    if (error) {
      if (/base coat out of the oven/i.test(error.message)) return { error: "Take the base coat out of the oven before printing this stillage." };
      return { error: /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save the stillage. Please try again." };
    }
    if (!row) return { error: "That stillage is already printed. Refresh the page." };
    refresh();
    return { ok: `Stillage ${row.stillage_no ?? ""} printed: ${printed.toLocaleString("en-US")} good sheets, ${spoiled.toLocaleString("en-US")} spoiled (${formatSpoiledPct(printed, spoiled)}). Next: varnish.` };
  }

  const { error } = await supabase.from("print_runs").insert({
    brand_id: brandId,
    stillage_no: stillage,
    run_date: date,
    shift,
    colours,
    sheets_printed: printed,
    sheets_spoiled: spoiled,
    crowns_per_sheet: CROWNS_PER_SHEET,
    coil_lot: s("coil_lot").slice(0, 60) || null,
    notes: s("notes").slice(0, 1000) || null,
  });
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save the stillage. Please try again." };

  refresh();
  return {
    ok: `Stillage ${stillage} printed: ${printed.toLocaleString("en-US")} good sheets, ${spoiled.toLocaleString("en-US")} spoiled (${formatSpoiledPct(printed, spoiled)}). Next: varnish.`,
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

/**
 * 00 base coat (brands that need one): a new stillage goes into the big oven
 * for its white or transparent base coat, before printing. With an out time
 * as well, the whole pass is logged at once.
 */
export async function startBaseCoat(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const brandId = s("brand_id");
  const stillage = s("stillage_no").slice(0, 40);
  const coat = s("coat") as BaseCoat;
  const shift = s("shift");
  const sheets = wholeNumber(s("base_sheets"));
  const startedAt = addisLocalToIso(s("started_at"));
  const finishedAt = s("finished_at") ? addisLocalToIso(s("finished_at")) : null;
  const tempRaw = s("oven_temp_c").replace(",", ".");
  const temp = tempRaw ? Number(tempRaw) : null;
  const spoiled = wholeNumber(s("sheets_spoiled"));

  if (!UUID.test(brandId)) return { error: "Choose the brand." };
  if (!stillage) return { error: "Enter the stillage number." };
  if (!(coat in BASE_COAT_LABEL)) return { error: "Choose white or transparent." };
  if (!SHIFTS.includes(shift as (typeof SHIFTS)[number])) return { error: "Choose the shift." };
  if (!Number.isFinite(sheets) || sheets < 1 || sheets > MAX_STILLAGE) return { error: `Sheets: enter the sheets on the stillage (up to ${MAX_STILLAGE.toLocaleString("en-US")}).` };
  if (!startedAt) return { error: "Enter when the stillage went into the oven." };
  if (s("finished_at") && !finishedAt) return { error: "Enter when it came out, or leave it empty while it's in the oven." };
  if (finishedAt && finishedAt < startedAt) return { error: "It can't come out before it went in." };
  if (new Date(startedAt).getTime() > Date.now() + 5 * 60_000) return { error: "The time it went in is in the future." };
  if (temp != null && (!Number.isFinite(temp) || temp < 0 || temp > 400)) return { error: "Oven temperature: enter °C, from 0 to 400." };
  if (!Number.isFinite(spoiled) || spoiled > sheets) return { error: "Spoiled sheets: enter a whole number, no more than the sheets." };

  const supabase = await createClient();
  const { data: run, error } = await supabase
    .from("print_runs")
    .insert({
      brand_id: brandId,
      stillage_no: stillage,
      run_date: s("started_at").slice(0, 10),
      shift,
      colours: [],
      sheets_printed: 0,
      sheets_spoiled: 0,
      crowns_per_sheet: CROWNS_PER_SHEET,
      printed: false,
      base_sheets: sheets,
      notes: s("notes").slice(0, 1000) || null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !run) return { error: /row-level|permission/i.test(error?.message ?? "") ? "Your role can't record printed sheets." : "Couldn't save the stillage. Please try again." };
  const { error: passErr } = await supabase.from("stillage_passes").insert({
    print_run_id: run.id,
    stage: "base_coat",
    material: BASE_COAT_LABEL[coat],
    oven_temp_c: temp,
    started_at: startedAt,
    finished_at: finishedAt,
    sheets_spoiled: spoiled,
  });
  if (passErr) {
    await supabase.from("print_runs").delete().eq("id", run.id);
    return { error: "Couldn't save the base coat. Please try again." };
  }
  refresh();
  return {
    ok: finishedAt
      ? `Stillage ${stillage}: ${BASE_COAT_LABEL[coat].toLowerCase()} logged. Next: print it (it's under "Waiting for printing").`
      : `Stillage ${stillage}: ${BASE_COAT_LABEL[coat].toLowerCase()} in the oven since ${s("started_at").slice(11)}.`,
  };
}

const STAGE_LABEL = OVEN_STAGE_LABEL;

/**
 * A stillage into the oven for varnish or lacquer. With an out time as well,
 * the whole pass is logged at once (it already came out).
 */
export async function startPass(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const runId = s("print_run_id");
  const stage = s("stage") as OvenStage;
  const startedAt = addisLocalToIso(s("started_at"));
  const finishedAt = s("finished_at") ? addisLocalToIso(s("finished_at")) : null;
  const tempRaw = s("oven_temp_c").replace(",", ".");
  const temp = tempRaw ? Number(tempRaw) : null;
  const spoiled = wholeNumber(s("sheets_spoiled"));

  if (!UUID.test(runId)) return { error: "Choose the stillage." };
  if (stage !== "varnish" && stage !== "lacquer") return { error: "Choose varnish or lacquer." };
  if (!startedAt) return { error: "Enter when the stillage went into the oven." };
  if (s("finished_at") && !finishedAt) return { error: "Enter when it came out, or leave it empty while it's in the oven." };
  if (finishedAt && finishedAt < startedAt) return { error: "It can't come out before it went in." };
  if (new Date(startedAt).getTime() > Date.now() + 5 * 60_000) return { error: "The time it went in is in the future." };
  if (temp != null && (!Number.isFinite(temp) || temp < 0 || temp > 400)) return { error: "Oven temperature: enter °C, from 0 to 400." };
  if (!Number.isFinite(spoiled) || spoiled > 3_000) return { error: "Spoiled sheets: enter a whole number." };

  const supabase = await createClient();
  const { error } = await supabase.from("stillage_passes").insert({
    print_run_id: runId,
    stage,
    material: s("material").slice(0, 100) || null,
    oven_temp_c: temp,
    started_at: startedAt,
    finished_at: finishedAt,
    sheets_spoiled: spoiled,
    notes: s("notes").slice(0, 1000) || null,
  });
  if (error) {
    if (error.code === "23505") return { error: `This stillage already has its ${stage}.` };
    if (/before lacquer/i.test(error.message)) return { error: "Varnish this stillage (and take it out of the oven) before lacquer." };
    return { error: /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save. Please try again." };
  }
  refresh();
  return {
    ok: finishedAt
      ? `${STAGE_LABEL[stage]} logged: ${minutesBetween(startedAt, finishedAt)} min in the oven.`
      : `${STAGE_LABEL[stage]}: in the oven since ${s("started_at").slice(11)}.`,
  };
}

/** The stillage came out of the oven. */
export async function finishPass(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const passId = s("pass_id");
  const finishedAt = addisLocalToIso(s("finished_at"));
  const spoiled = wholeNumber(s("sheets_spoiled"));
  if (!UUID.test(passId)) return { error: "Pass not found." };
  if (!finishedAt) return { error: "Enter when it came out of the oven." };
  if (!Number.isFinite(spoiled) || spoiled > 3_000) return { error: "Spoiled sheets: enter a whole number." };

  const supabase = await createClient();
  const { data: pass } = await supabase.from("stillage_passes").select("started_at, stage").eq("id", passId).maybeSingle<{ started_at: string; stage: OvenStage }>();
  if (!pass) return { error: "Pass not found." };
  if (new Date(finishedAt) < new Date(pass.started_at)) return { error: "It can't come out before it went in." };
  const note = s("notes").slice(0, 1000);
  const { error } = await supabase
    .from("stillage_passes")
    .update({ finished_at: finishedAt, sheets_spoiled: spoiled, ...(note ? { notes: note } : {}) })
    .eq("id", passId);
  if (error) return { error: /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save. Please try again." };
  refresh();
  return { ok: `${STAGE_LABEL[pass.stage]} out of the oven after ${minutesBetween(pass.started_at, finishedAt)} min.` };
}

/** Remove an oven pass entered by mistake (the lacquer first, if there is one). */
export async function deletePass(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("stillage_passes").delete().eq("id", id);
  refresh();
}

/** A finished stillage goes to a press: it leaves the printed-sheet stock. */
export async function sendToPress(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const id = s("id");
  const pressId = s("press_id");
  const at = addisLocalToIso(s("at"));
  if (!UUID.test(id)) return { error: "Stillage not found." };
  if (!UUID.test(pressId)) return { error: "Choose the press." };
  if (!at) return { error: "Enter when it went to the press." };
  if (new Date(at).getTime() > Date.now() + 5 * 60_000) return { error: "That time is in the future." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("print_runs")
    .update({ to_press_at: at, press_id: pressId })
    .eq("id", id)
    .is("to_press_at", null)
    .select("stillage_no")
    .maybeSingle<{ stillage_no: string | null }>();
  if (error) {
    if (/finished \(lacquered\)/.test(error.message)) return { error: "Only a finished (lacquered) stillage goes to the press." };
    return { error: /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save. Please try again." };
  }
  if (!data) return { error: "That stillage has already gone to the press. Refresh the page." };
  refresh();
  return { ok: `Stillage ${data.stillage_no ?? ""} sent to the press.` };
}

/** Undo "to the press" (sent by mistake): the stillage is back in stock. */
export async function undoToPress(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("print_runs").update({ to_press_at: null }).eq("id", id);
  refresh();
}
