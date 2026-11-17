"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatQty } from "@/lib/format";
import { formatGrams, parseInkGrams, SAMPLE_PURPOSE, splitInks } from "@/lib/ink-usage";
import { addisLocalToIso } from "@/lib/inventory";
import {
  BASE_COAT_LABEL,
  CROWNS_PER_SHEET,
  crownsFromSheets,
  formatSpoiledPct,
  MAX_STILLAGE_SHEETS,
  MAX_OVEN_AT_ONCE,
  MAX_STILLAGES_AT_ONCE,
  minutesBetween,
  OVEN_STAGE_LABEL,
  splitEvenly,
  stillageNumbers,
  stillagesFromTotal,
  coatOfPass,
  wholeNumber,
  type BaseCoat,
  type OvenStage,
} from "@/lib/print-runs";
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
const MAX_STILLAGE = MAX_STILLAGE_SHEETS;
const n = (x: number) => x.toLocaleString("en-US");

/** A database refusal, in words for the form. */
function saveError(message: string): string {
  if (/ink_unknown/.test(message)) return "An ink isn't on the list any more. Refresh the page and try again.";
  if (/ink_grams/.test(message)) return "Ink used: type a number for each ink (e.g. 850 g or 1.2 kg).";
  if (/row-level|permission/i.test(message)) return "Your role can't record printed sheets.";
  return "Couldn't save. Please try again.";
}

/**
 * Record stillages off the print line (printer + UV dryer): the start of
 * their process (internal only). Several at once are saved as separate
 * stillages, numbered on from the first, each with the sheets per stillage;
 * the spoiled sheets are shared over them.
 */
export async function savePrintRun(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const date = s("run_date");
  const shift = s("shift");
  const brandId = s("brand_id");
  const stillage = s("stillage_no").slice(0, 40);
  const count = s("stillages") ? wholeNumber(s("stillages")) : 1;
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
  if (!Number.isFinite(count) || count < 1 || count > MAX_STILLAGES_AT_ONCE) return { error: `Stillages: 1 to ${MAX_STILLAGES_AT_ONCE} at a time.` };
  if (!Number.isFinite(printed) || printed > MAX_STILLAGE) return { error: `Good sheets: enter the sheets on each stillage (up to ${n(MAX_STILLAGE)}).` };
  if (!Number.isFinite(spoiled) || spoiled > MAX_STILLAGE * count) return { error: "Spoiled sheets: enter a whole number." };
  if (printed + spoiled === 0) return { error: "Enter the good or the spoiled sheets." };
  if (count > 1 && printed === 0) return { error: "Enter the good sheets on each stillage." };
  const numbers = stillageNumbers(stillage, count);
  if (!numbers) return { error: "To save several stillages, end the first stillage number with a number (e.g. ST-014)." };
  // Ink used for all of them together, in grams.
  const inks = parseInkGrams(s("inks"));
  if (!inks) return { error: "Ink used: type a number for each ink (e.g. 850 g or 1.2 kg)." };

  const supabase = await createClient();
  // Base-coated stillages waiting for the print line (one, or several ticked): print those.
  const existing = idsOf(fd, "id");
  if (existing.length) {
    if (existing.length > MAX_OVEN_AT_ONCE) return { error: `Up to ${MAX_OVEN_AT_ONCE} stillages at a time.` };
    if (existing.length > 1 && printed === 0) return { error: "Enter the good sheets on each stillage." };
    const [{ data: rows }, { data: bases }, { data: brand }] = await Promise.all([
      supabase.from("print_runs").select("id, stillage_no, brand_id, printed").in("id", existing).returns<{ id: string; stillage_no: string | null; brand_id: string | null; printed: boolean }[]>(),
      supabase.from("stillage_passes").select("print_run_id, material, finished_at").eq("stage", "base_coat").in("print_run_id", existing).returns<{ print_run_id: string; material: string | null; finished_at: string | null }[]>(),
      supabase.from("brands").select("name, base_coat").eq("id", brandId).maybeSingle<{ name: string; base_coat: BaseCoat | null }>(),
    ]);
    if (!rows || rows.length !== existing.length) return { error: "A stillage wasn't found. Refresh the page." };
    const label = (r: { id: string; stillage_no: string | null }) => r.stillage_no ?? `#${r.id.slice(0, 4)}`;
    const done = rows.filter((r) => r.printed);
    if (done.length) return { error: `Already printed: ${done.map(label).join(", ")}. Refresh the page.` };
    const other = rows.filter((r) => r.brand_id && r.brand_id !== brandId);
    if (other.length) return { error: `Base coated for another brand: ${other.map(label).join(", ")}.` };
    const inOven = rows.filter((r) => bases?.some((b) => b.print_run_id === r.id && !b.finished_at));
    if (inOven.length) return { error: `Take the base coat out of the oven first: ${inOven.map(label).join(", ")}.` };
    // Each sheet gets one coat: the stillage's coat must be the brand's, unless confirmed.
    const coatOf = new Map((bases ?? []).map((b) => [b.print_run_id, coatOfPass(b.material)]));
    const wrong = brand?.base_coat ? rows.filter((r) => coatOf.get(r.id) && coatOf.get(r.id) !== brand.base_coat) : [];
    if (wrong.length && s("coat_ok") !== "1")
      return {
        error: `${wrong.map(label).join(", ")} ${wrong.length === 1 ? "has" : "have"} the ${BASE_COAT_LABEL[coatOf.get(wrong[0].id)!].toLowerCase()}; ${brand?.name} gets the ${BASE_COAT_LABEL[brand!.base_coat!].toLowerCase()}. Tick "Print anyway" if that is right.`,
      };
    const order = existing.map((id) => rows.find((r) => r.id === id)!);
    const spoiledEach = splitEvenly(spoiled, order.length);
    const inksEach = splitInks(inks, order.length);
    for (const [i, r] of order.entries()) {
      const { data: row, error } = await supabase
        .from("print_runs")
        .update({
          // Base-coated stock gets its brand now; a brand's own stillage keeps it.
          brand_id: brandId,
          inks: inksEach[i],
          run_date: date,
          shift,
          colours,
          sheets_printed: printed,
          sheets_spoiled: spoiledEach[i],
          crowns_per_sheet: CROWNS_PER_SHEET,
          coil_lot: s("coil_lot").slice(0, 60) || null,
          notes: s("notes").slice(0, 1000) || null,
          printed: true,
        })
        .eq("id", r.id)
        .eq("printed", false)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (error || !row) {
        refresh();
        const why = error && /base coat out of the oven/i.test(error.message) ? `Take the base coat out of the oven before printing ${label(r)}.` : error ? saveError(error.message) : `${label(r)} is already printed. Refresh the page.`;
        return { error: i ? `${i} of ${order.length} saved. ${why}` : why };
      }
    }
    refresh();
    const good = printed * order.length;
    return {
      ok:
        order.length === 1
          ? `Stillage ${label(order[0])} printed: ${n(printed)} good sheets, ${n(spoiled)} spoiled (${formatSpoiledPct(printed, spoiled)}). Next: varnish.`
          : `${order.length} base-coated stillages printed (${order.map(label).join(", ")}): ${n(good)} good sheets, ${n(spoiled)} spoiled (${formatSpoiledPct(good, spoiled)}). Next: varnish.`,
    };
  }

  // One row per stillage, all saved together or none.
  const spoiledEach = splitEvenly(spoiled, count);
  const inksEach = splitInks(inks, count);
  const { error } = await supabase.from("print_runs").insert(
    numbers.map((no, i) => ({
      brand_id: brandId,
      inks: inksEach[i],
      stillage_no: no,
      run_date: date,
      shift,
      colours,
      sheets_printed: printed,
      sheets_spoiled: spoiledEach[i],
      crowns_per_sheet: CROWNS_PER_SHEET,
      coil_lot: s("coil_lot").slice(0, 60) || null,
      notes: s("notes").slice(0, 1000) || null,
    })),
  );
  if (error) return { error: saveError(error.message) };

  refresh();
  const good = printed * count;
  return {
    ok:
      count === 1
        ? `Stillage ${stillage} printed: ${n(printed)} good sheets, ${n(spoiled)} spoiled (${formatSpoiledPct(printed, spoiled)}). Next: varnish.`
        : `${count} stillages printed (${numbers[0]} to ${numbers[count - 1]}): ${n(good)} good sheets (about ${formatQty(crownsFromSheets(good, CROWNS_PER_SHEET))} crowns), ${n(spoiled)} spoiled (${formatSpoiledPct(good, spoiled)}). Next: varnish.`,
  };
}

/** Remove a stillage entered by mistake. */
export async function deletePrintRun(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("print_runs").delete().eq("id", id);
  refresh();
}

/**
 * 00 base coat: new stillages go into the big oven for their white or
 * transparent base coat, before printing. Several at once: a number of
 * stillages of so many sheets each, or a day's total of sheets cut into
 * stillages of so many sheets (the last one takes what is left). Numbered on
 * from the first stillage number. With an out time as well, the whole pass
 * is logged at once.
 */
export async function startBaseCoat(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const brandId = s("brand_id");
  const stillage = s("stillage_no").slice(0, 40);
  const coat = s("coat") as BaseCoat;
  const shift = s("shift");
  const perStillage = wholeNumber(s("base_sheets"));
  const byTotal = s("amount") === "total";
  const total = wholeNumber(s("total_sheets"));
  const count = byTotal ? 0 : s("stillages") ? wholeNumber(s("stillages")) : 1;
  const startedAt = addisLocalToIso(s("started_at"));
  const finishedAt = s("finished_at") ? addisLocalToIso(s("finished_at")) : null;
  const tempRaw = s("oven_temp_c").replace(",", ".");
  const temp = tempRaw ? Number(tempRaw) : null;
  const spoiled = wholeNumber(s("sheets_spoiled"));

  // Base-coated stock: the brand is chosen when it is printed.
  const stock = s("stock") === "1";
  if (!stock && !UUID.test(brandId)) return { error: "Choose the brand." };
  if (!stillage) return { error: "Enter the stillage number." };
  if (!(coat in BASE_COAT_LABEL)) return { error: "Choose white or transparent." };
  if (!SHIFTS.includes(shift as (typeof SHIFTS)[number])) return { error: "Choose the shift." };
  if (!Number.isFinite(perStillage) || perStillage < 1 || perStillage > MAX_STILLAGE)
    return { error: `Sheets a stillage: enter the sheets on one stillage (up to ${MAX_STILLAGE.toLocaleString("en-US")}).` };
  let sizes: number[];
  if (byTotal) {
    if (!Number.isFinite(total) || total < 1) return { error: "Total sheets: enter the sheets base coated." };
    sizes = stillagesFromTotal(total, perStillage);
    if (sizes.length > MAX_OVEN_AT_ONCE) return { error: `That makes ${sizes.length} stillages; up to ${MAX_OVEN_AT_ONCE} at a time.` };
  } else {
    if (!Number.isFinite(count) || count < 1 || count > MAX_OVEN_AT_ONCE) return { error: `Stillages: 1 to ${MAX_OVEN_AT_ONCE} at a time.` };
    sizes = Array.from({ length: count }, () => perStillage);
  }
  const numbers = stillageNumbers(stillage, sizes.length);
  if (!numbers) return { error: "To save several stillages, end the first stillage number with a number (e.g. ST-014)." };
  const sheets = sizes.reduce((t, x) => t + x, 0);
  if (!startedAt) return { error: "Enter when the stillages went into the oven." };
  if (s("finished_at") && !finishedAt) return { error: "Enter when they came out, or leave it empty while they're in the oven." };
  if (finishedAt && finishedAt < startedAt) return { error: "They can't come out before they went in." };
  if (new Date(startedAt).getTime() > Date.now() + 5 * 60_000) return { error: "The time they went in is in the future." };
  if (temp != null && (!Number.isFinite(temp) || temp < 0 || temp > 400)) return { error: "Oven temperature: enter °C, from 0 to 400." };
  if (!Number.isFinite(spoiled) || spoiled > sheets) return { error: "Spoiled sheets: enter a whole number, no more than the sheets." };
  // Spoiled sheets shared over the stillages, never more than a stillage holds.
  const spoiledEach = splitEvenly(spoiled, sizes.length).map((x, i) => Math.min(x, sizes[i]));

  const supabase = await createClient();
  const { data: runs, error } = await supabase
    .from("print_runs")
    .insert(
      numbers.map((no, i) => ({
        brand_id: stock ? null : brandId,
        stillage_no: no,
        run_date: s("started_at").slice(0, 10),
        shift,
        colours: [],
        sheets_printed: 0,
        sheets_spoiled: 0,
        crowns_per_sheet: CROWNS_PER_SHEET,
        printed: false,
        base_sheets: sizes[i],
        notes: s("notes").slice(0, 1000) || null,
      })),
    )
    .select("id, stillage_no")
    .returns<{ id: string; stillage_no: string }[]>();
  if (error || !runs || runs.length !== numbers.length)
    return { error: /row-level|permission/i.test(error?.message ?? "") ? "Your role can't record printed sheets." : "Couldn't save the stillages. Please try again." };
  const idOf = new Map(runs.map((r) => [r.stillage_no, r.id]));
  const { error: passErr } = await supabase.from("stillage_passes").insert(
    numbers.map((no, i) => ({
      print_run_id: idOf.get(no),
      stage: "base_coat",
      material: BASE_COAT_LABEL[coat],
      oven_temp_c: temp,
      started_at: startedAt,
      finished_at: finishedAt,
      sheets_spoiled: spoiledEach[i],
    })),
  );
  if (passErr) {
    await supabase.from("print_runs").delete().in("id", runs.map((r) => r.id));
    return { error: "Couldn't save the base coat. Please try again." };
  }
  refresh();
  const which = numbers.length === 1 ? `Stillage ${numbers[0]}` : `${numbers.length} stillages (${numbers[0]} to ${numbers[numbers.length - 1]}, ${n(sheets)} sheets)`;
  return {
    ok: finishedAt
      ? stock
        ? `${which}: ${BASE_COAT_LABEL[coat].toLowerCase()} logged. Waiting in base-coated stock; the brand is chosen when printed.`
        : `${which}: ${BASE_COAT_LABEL[coat].toLowerCase()} logged. Next: print (under "Waiting for printing").`
      : `${which}: ${BASE_COAT_LABEL[coat].toLowerCase()} in the oven since ${s("started_at").slice(11)}.`,
  };
}

/** Sample sheets (colour match, proof, trial): tinplate and ink come off stock; not stock for the presses. */
export async function saveSampleSheets(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const date = s("sample_date");
  const shift = s("shift");
  const brandId = s("brand_id");
  const purpose = s("purpose");
  const sheets = wholeNumber(s("sheets"));
  const inks = parseInkGrams(s("inks"));
  const today = addisDateISO(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return { error: "Choose today or an earlier date." };
  if (date < addDays(today, -31)) return { error: "Samples more than a month old can't be added here." };
  if (shift && !SHIFTS.includes(shift as (typeof SHIFTS)[number])) return { error: "Choose the shift." };
  if (brandId && !UUID.test(brandId)) return { error: "Choose the brand." };
  if (!(purpose in SAMPLE_PURPOSE)) return { error: "Choose what the samples were for." };
  if (!Number.isFinite(sheets) || sheets < 1 || sheets > MAX_STILLAGE) return { error: `Sheets used: 1 to ${n(MAX_STILLAGE)}.` };
  if (!inks) return { error: "Ink used: type a number for each ink (e.g. 850 g or 1.2 kg)." };

  const supabase = await createClient();
  const { error } = await supabase.from("sample_sheets").insert({
    sample_date: date,
    shift: shift || null,
    brand_id: brandId || null,
    purpose,
    sheets,
    inks,
    notes: s("notes").slice(0, 1000) || null,
  });
  if (error) return { error: saveError(error.message) };
  refresh();
  revalidatePath("/ops/inventory", "layout");
  const grams = Object.values(inks).reduce((t, g) => t + g, 0);
  return { ok: `${n(sheets)} sample sheet${sheets === 1 ? "" : "s"} logged${grams ? `, ${formatGrams(grams)} of ink` : ""}. Tinplate and ink are off the stock.` };
}

/** Remove sample sheets logged by mistake (admin only; their tinplate and ink go back). */
export async function deleteSampleSheets(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
  const id = String(fd.get("id") ?? "");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("sample_sheets").delete().eq("id", id);
  refresh();
  revalidatePath("/ops/inventory", "layout");
}

const STAGE_LABEL = OVEN_STAGE_LABEL;

/** The ids sent for a field (one or several), each once. */
const idsOf = (fd: FormData, key: string) => [...new Set(fd.getAll(key).map((v) => String(v).trim()))].filter((v) => UUID.test(v));

/**
 * Stillages into the oven for varnish or lacquer: one, or several together
 * (ticked). With an out time as well, the whole pass is logged at once; the
 * spoiled sheets are shared over the stillages.
 */
export async function startPass(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const runIds = idsOf(fd, "print_run_id");
  const stage = s("stage") as OvenStage;
  const startedAt = addisLocalToIso(s("started_at"));
  const finishedAt = s("finished_at") ? addisLocalToIso(s("finished_at")) : null;
  const tempRaw = s("oven_temp_c").replace(",", ".");
  const temp = tempRaw ? Number(tempRaw) : null;
  const spoiled = wholeNumber(s("sheets_spoiled"));

  if (runIds.length === 0) return { error: "Tick the stillages going into the oven." };
  if (runIds.length > MAX_OVEN_AT_ONCE) return { error: `Up to ${MAX_OVEN_AT_ONCE} stillages at a time.` };
  if (stage !== "varnish" && stage !== "lacquer") return { error: "Choose varnish or lacquer." };
  if (!startedAt) return { error: "Enter when the stillages went into the oven." };
  if (s("finished_at") && !finishedAt) return { error: "Enter when they came out, or leave it empty while they're in the oven." };
  if (finishedAt && finishedAt < startedAt) return { error: "They can't come out before they went in." };
  if (new Date(startedAt).getTime() > Date.now() + 5 * 60_000) return { error: "The time they went in is in the future." };
  if (temp != null && (!Number.isFinite(temp) || temp < 0 || temp > 400)) return { error: "Oven temperature: enter °C, from 0 to 400." };
  if (!Number.isFinite(spoiled) || spoiled > MAX_STILLAGE * runIds.length) return { error: "Spoiled sheets: enter a whole number." };
  const spoiledEach = splitEvenly(spoiled, runIds.length);

  const supabase = await createClient();
  // All together or none.
  const { error } = await supabase.from("stillage_passes").insert(
    runIds.map((id, i) => ({
      print_run_id: id,
      stage,
      material: s("material").slice(0, 100) || null,
      oven_temp_c: temp,
      started_at: startedAt,
      finished_at: finishedAt,
      sheets_spoiled: spoiledEach[i],
      notes: s("notes").slice(0, 1000) || null,
    })),
  );
  if (error) {
    const which = runIds.length === 1 ? "This stillage" : "One of these stillages";
    if (error.code === "23505") return { error: `${which} already has its ${stage}. Refresh the page.` };
    if (/before lacquer/i.test(error.message)) return { error: `${which} isn't varnished yet (or is still in the oven). Lacquer comes after the varnish.` };
    return { error: /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save. Please try again." };
  }
  refresh();
  const who = runIds.length === 1 ? "" : ` (${runIds.length} stillages)`;
  return {
    ok: finishedAt
      ? `${STAGE_LABEL[stage]} logged${who}: ${minutesBetween(startedAt, finishedAt)} min in the oven.`
      : `${STAGE_LABEL[stage]}${who}: in the oven since ${s("started_at").slice(11)}.`,
  };
}

/** Stillages out of the oven: one, or several together (ticked); spoiled sheets shared over them. */
export async function finishPass(_prev: PrintRunState, fd: FormData): Promise<PrintRunState> {
  await requireStaff([...WRITERS]);
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  const passIds = idsOf(fd, "pass_id");
  const finishedAt = addisLocalToIso(s("finished_at"));
  const spoiled = wholeNumber(s("sheets_spoiled"));
  if (passIds.length === 0) return { error: "Tick the stillages that came out." };
  if (passIds.length > MAX_OVEN_AT_ONCE) return { error: `Up to ${MAX_OVEN_AT_ONCE} stillages at a time.` };
  if (!finishedAt) return { error: "Enter when they came out of the oven." };
  if (!Number.isFinite(spoiled) || spoiled > MAX_STILLAGE * passIds.length) return { error: "Spoiled sheets: enter a whole number." };

  const supabase = await createClient();
  const { data: passes } = await supabase
    .from("stillage_passes")
    .select("id, started_at, stage, finished_at")
    .in("id", passIds)
    .returns<{ id: string; started_at: string; stage: OvenStage; finished_at: string | null }[]>();
  if (!passes || passes.length !== passIds.length) return { error: "A pass wasn't found. Refresh the page." };
  if (passes.some((p) => new Date(finishedAt) < new Date(p.started_at))) return { error: "They can't come out before they went in." };
  const note = s("notes").slice(0, 1000);
  const spoiledEach = splitEvenly(spoiled, passIds.length);
  for (const [i, id] of passIds.entries()) {
    const { error } = await supabase
      .from("stillage_passes")
      .update({ finished_at: finishedAt, sheets_spoiled: spoiledEach[i], ...(note ? { notes: note } : {}) })
      .eq("id", id);
    if (error) {
      refresh();
      const msg = /row-level|permission/i.test(error.message) ? "Your role can't record printed sheets." : "Couldn't save. Please try again.";
      return { error: i ? `${i} of ${passIds.length} saved. ${msg}` : msg };
    }
  }
  refresh();
  const first = passes[0];
  if (passIds.length === 1) return { ok: `${STAGE_LABEL[first.stage]} out of the oven after ${minutesBetween(first.started_at, finishedAt)} min.` };
  return { ok: `${passIds.length} stillages out of the oven.` };
}

/** Remove an oven pass entered by mistake (the lacquer first, if there is one). */
export async function deletePass(fd: FormData): Promise<void> {
  await requireStaff(["admin"]);
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
  await supabase.from("print_runs").update({ to_press_at: null, used_up_at: null }).eq("id", id);
  refresh();
}

/** A stillage at a press: all its sheets used (it leaves the daily entry's list), or not after all. */
export async function setStillageUsedUp(fd: FormData): Promise<void> {
  await requireStaff([...WRITERS]);
  const id = String(fd.get("id") ?? "");
  const used = String(fd.get("used") ?? "") === "1";
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  await supabase.from("print_runs").update({ used_up_at: used ? new Date().toISOString() : null }).eq("id", id);
  refresh();
  revalidatePath("/production-entry");
}
