import { getSettings } from "@/lib/settings-server";
import type { Metadata } from "next";
import { BaseCoatDialog, PrintItDialog, ToPressDialog, UndoToPressButton } from "@/components/ops/BaseCoat";
import OpsHeader from "@/components/ops/OpsHeader";
import { KpiStrip, SectionHead } from "@/components/ops/OpsKit";
import { DeletePassButton, IntoOvenDialog, OutOfOvenDialog, OvenTimer } from "@/components/ops/OvenPass";
import PrintRunForm, { DeletePrintRunButton, type PrintBrand } from "@/components/ops/PrintRunForm";
import { DeleteSampleButton, SampleSheetsDialog } from "@/components/ops/SampleSheets";
import { InkSwatches } from "@/components/ui/Crown";
import { brandInks, formatGrams, SAMPLE_PURPOSE, type InkGrams, type InkMaterial, type InkRate, type SamplePurpose } from "@/lib/ink-usage";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth, formatQty } from "@/lib/format";
import { addisLocalNow } from "@/lib/inventory";
import {
  CROWNS_PER_SHEET,
  crownsFromSheets,
  formatSpoiledPct,
  goodSheets,
  minutesBetween,
  nextStillageNo,
  STILLAGE_STATUS_LABEL,
  stillageStatus,
  type OvenStage,
  type PrintRun,
  type StillagePass,
  type StillageStatus,
} from "@/lib/print-runs";
import { loadPressStillages, loadProducibleOrders } from "@/lib/production";
import ConfirmForm from "@/components/ui/ConfirmForm";
import { setStillageUsedUp } from "@/app/ops/production/sheets/actions";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Printed sheets" };

type RunRow = Omit<PrintRun, "brand_id"> & { brand_id: string | null; inks: InkGrams | null; created_at: string; brands: { name: string; companies: { name: string } | null } | null };
type SampleRow = { id: string; sample_date: string; shift: string | null; purpose: SamplePurpose; sheets: number; inks: InkGrams | null; notes: string | null; brands: { name: string } | null };
type BrandRow = { id: string; name: string; colours: string[]; base_coat: "white" | "transparent" | null; companies: { name: string } | null };

const shortCompany = (name: string | undefined | null) => (name ?? "").replace(/\s+(S\.C\.|PLC)$/i, "");
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Addis_Ababa" });
const hhmm = (iso: string) => timeFmt.format(new Date(iso));

const STATUS_STYLE: Record<StillageStatus, string> = {
  base_oven: "bg-accent text-bg",
  base_coated: "border border-dashed border-text",
  printed: "border border-text",
  varnish_oven: "bg-accent text-bg",
  varnished: "border border-accent-700 text-accent-700",
  lacquer_oven: "bg-accent text-bg",
  finished: "bg-text text-bg",
  at_press: "border border-divider opacity-70",
};

/**
 * Printed sheets: their own process, not tied to orders. Per stillage (about
 * 1,420 sheets): 00 a white or transparent base coat through the big oven
 * (only brands that need one), 01 the print line (two-unit roller printer with the UV dryer
 * at its end), 02 varnish through the oven (about 30 minutes), 03 lacquer
 * through the oven again. Internal only: customers never see it.
 */
export default async function PrintedSheetsPage() {
  const OVEN_MINUTES = (await getSettings()).plant.oven_minutes;
  const me = await requireStaff(opsRolesFor("sheets"));
  const canEnter = me.role === "admin" || me.role === "production";
  // Only admin deletes entries (the database enforces the same).
  const canDelete = me.role === "admin";
  const now = new Date();
  const today = addisDateISO(now);
  const nowLocal = addisLocalNow();
  const supabase = await createClient();

  const [{ data: runData }, { data: brandData }, { data: pressData }, openOrders, atPress, { data: inkData }, { data: rateData }, { data: sampleData }] = await Promise.all([
    supabase
      .from("print_runs")
      .select("id, brand_id, stillage_no, run_date, shift, colours, sheets_printed, sheets_spoiled, crowns_per_sheet, coil_lot, notes, printed, base_sheets, to_press_at, press_id, inks, created_at, brands(name, companies(name))")
      // The last 60 days, and anything older still in stock (not yet sent to a press).
      .or(`run_date.gte.${addDays(today, -60)},to_press_at.is.null`)
      .order("run_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<RunRow[]>(),
    supabase.from("brands").select("id, name, colours, base_coat, companies(name)").eq("active", true).order("name").returns<BrandRow[]>(),
    // The presses a stillage can go to (installed ones).
    supabase.from("machines").select("id, name, status").eq("category", "press").is("parent_id", null).neq("status", "on_order").order("sort_order").returns<{ id: string; name: string; status: string }[]>(),
    loadProducibleOrders(supabase),
    loadPressStillages(supabase),
    supabase.from("raw_materials").select("id, ink_name, active").not("ink_name", "is", null).returns<InkMaterial[]>(),
    supabase.from("brand_ink_rates").select("brand_id, material_id, g_per_sheet").returns<InkRate[]>(),
    supabase
      .from("sample_sheets")
      .select("id, sample_date, shift, purpose, sheets, inks, notes, brands(name)")
      .gte("sample_date", addDays(today, -30))
      .order("sample_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<SampleRow[]>(),
  ]);
  const inkMaterials = inkData ?? [];
  const inkLabel = new Map(inkMaterials.map((i) => [i.id, i.ink_name]));
  const inkLine = (inks: InkGrams | null) =>
    Object.entries(inks ?? {})
      .map(([id, g]) => `${inkLabel.get(id) ?? "Ink"} ${formatGrams(Number(g))}`)
      .join(" · ");
  const samples = sampleData ?? [];
  const presses = (pressData ?? []).sort((a, b) => Number(b.status === "running") - Number(a.status === "running"));
  const pressName = new Map((pressData ?? []).map((p) => [p.id, p.name]));
  const runs = runData ?? [];
  // Stillages that fed production can't go back to stock (no "undo" for them).
  const atPressIds = runs.filter((r) => r.to_press_at).map((r) => r.id);
  const { data: linkData } = atPressIds.length
    ? await supabase.from("production_entry_stillages").select("print_run_id").in("print_run_id", atPressIds).returns<{ print_run_id: string }[]>()
    : { data: [] as { print_run_id: string }[] };
  const fedProduction = new Set((linkData ?? []).map((l) => l.print_run_id));
  const { data: passData } = runs.length
    ? await supabase
        .from("stillage_passes")
        .select("id, print_run_id, stage, material, oven_temp_c, started_at, finished_at, sheets_spoiled, notes")
        .in("print_run_id", runs.map((r) => r.id))
        .order("started_at")
        .returns<StillagePass[]>()
    : { data: [] as StillagePass[] };
  const passes = passData ?? [];

  const stillages = runs.map((r) => {
    const mine = passes.filter((p) => p.print_run_id === r.id);
    const base = mine.find((p) => p.stage === "base_coat") ?? null;
    const varnish = mine.find((p) => p.stage === "varnish") ?? null;
    const lacquer = mine.find((p) => p.stage === "lacquer") ?? null;
    const printed = r.printed !== false;
    // Before printing, the sheets are the ones base-coated (less what the base coat spoiled).
    const good = printed ? goodSheets(Number(r.sheets_printed), mine) : Math.max(0, Number(r.base_sheets ?? 0) - Number(base?.sheets_spoiled ?? 0));
    return { r, base, varnish, lacquer, printed, status: stillageStatus(mine, printed, r.to_press_at ?? null), good, label: r.stillage_no ?? `#${r.id.slice(0, 4)}` };
  });
  const at = (s: StillageStatus) => stillages.filter((x) => x.status === s);
  const inOven = stillages.filter((x) => x.status === "base_oven" || x.status === "varnish_oven" || x.status === "lacquer_oven");
  // Base-coated for a brand wait for the print line; base-coated stock gets its brand when printed.
  const waitingPrint = at("base_coated").filter((x) => x.r.brand_id).reverse();
  const coatedStock = at("base_coated").filter((x) => !x.r.brand_id).reverse();
  const coatedBy = (coat: string) => coatedStock.filter((x) => (x.base?.material ?? "").toLowerCase().includes(coat));
  const waitingVarnish = at("printed").reverse();
  const waitingLacquer = at("varnished").reverse();
  const finishedToday = stillages.filter((x) => x.status === "finished" && x.lacquer?.finished_at && addisDateISO(new Date(x.lacquer.finished_at)) === today);
  const printedToday = stillages.filter((x) => x.printed && x.r.run_date === today);
  const printedOnes = stillages.filter((x) => x.printed);
  const sum = (xs: typeof stillages, f: (x: (typeof stillages)[number]) => number) => xs.reduce((t, x) => t + f(x), 0);
  const sum2 = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((t, x) => t + f(x), 0);

  const lastBrand = runs[0]?.brand_id;
  const formBrands: PrintBrand[] = (brandData ?? [])
    .map((b) => ({
      id: b.id,
      label: `${b.name} · ${shortCompany(b.companies?.name)}`,
      colours: b.colours ?? [],
      baseCoat: b.base_coat,
      inks: brandInks(b.colours, b.id, inkMaterials, rateData ?? []),
    }))
    .sort((a, b) => Number(b.id === lastBrand) - Number(a.id === lastBrand));
  const materials = (stage: OvenStage) => [...new Set(passes.filter((p) => p.stage === stage).reverse().map((p) => p.material).filter((m): m is string => Boolean(m)))].slice(0, 20);
  const lastTemp = (stage: OvenStage) => {
    const t = [...passes].reverse().find((p) => p.stage === stage && p.oven_temp_c != null)?.oven_temp_c;
    return t == null ? null : Number(t);
  };

  // Printed-sheet stock: finished stillages not yet sent to a press, per brand,
  // against what open orders of that brand still need.
  const inStock = at("finished").reverse();
  const needFor = (brand: { name: string; companies: { name: string } | null } | null) =>
    openOrders
      .filter((o) => o.brand === brand?.name && o.company === (brand?.companies?.name ?? "-"))
      .reduce((t, o) => t + Math.max(0, o.quantity - o.good), 0);
  const byBrand = [...new Set([...inStock.map((x) => x.r.brand_id)])]
    .map((id) => {
      const mine = inStock.filter((x) => x.r.brand_id === id);
      const good = sum(mine, (x) => x.good);
      const crowns = crownsFromSheets(good, CROWNS_PER_SHEET);
      const need = needFor(mine[0].r.brands);
      return { id, brand: mine[0].r.brands, colours: mine[0].r.colours, stillages: mine.length, good, crowns, need, oldest: mine[0].lacquer?.finished_at ?? mine[0].r.run_date };
    })
    .sort((a, b) => b.good - a.good);
  // Brands with open orders but no printed sheets in stock at all.
  const shortBrands = [...new Map(openOrders.map((o) => [`${o.brand}|${o.company}`, o])).values()]
    .filter((o) => !byBrand.some((b) => b.brand?.name === o.brand && (b.brand?.companies?.name ?? "-") === o.company))
    .map((o) => ({ brand: o.brand, company: o.company, need: openOrders.filter((x) => x.brand === o.brand && x.company === o.company).reduce((t, x) => t + Math.max(0, x.quantity - x.good), 0) }))
    .filter((o) => o.need > 0);
  const sentToday = stillages.filter((x) => x.r.to_press_at && addisDateISO(new Date(x.r.to_press_at)) === today);

  const passLine = (p: StillagePass | null) =>
    p
      ? `${hhmm(p.started_at)}–${p.finished_at ? `${hhmm(p.finished_at)} (${minutesBetween(p.started_at, p.finished_at)} min)` : "in the oven"}${p.oven_temp_c != null ? ` · ${Number(p.oven_temp_c)} °C` : ""}${p.material ? ` · ${p.material}` : ""}`
      : "-";
  const BRAND_COLS = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_80px_110px_140px_90px] items-center gap-3";
  const ROWS = "grid grid-cols-[90px_minmax(0,1fr)_96px_minmax(0,1fr)_100px_minmax(0,1.3fr)_minmax(0,1.3fr)_190px] items-center gap-3";

  return (
    <>
      <OpsHeader
        crumb={{ label: "Production", href: "/ops/production", current: "Printed sheets" }}
        title="Printed sheets"
        sub={`Per stillage: 00 base coat through the oven (brands that need it) → 01 print line (printer + UV dryer) → 02 varnish through the oven (about ${OVEN_MINUTES} min) → 03 lacquer through the oven. Not tied to orders.`}
        actions={<InternalOnly>Internal only · customers never see printed sheets</InternalOnly>}
      />

      <KpiStrip
        items={[
          {
            label: "Printed today",
            value: printedToday.length,
            sub: `stillages · ${sum(printedToday, (x) => Number(x.r.sheets_printed)).toLocaleString("en-US")} sheets${waitingPrint.length ? ` · ${waitingPrint.length} base-coated waiting` : ""}`,
          },
          {
            label: "In the oven",
            value: inOven.length,
            sub: `${inOven.some((x) => x.status === "base_oven") ? `${inOven.filter((x) => x.status === "base_oven").length} base coat · ` : ""}${inOven.filter((x) => x.status === "varnish_oven").length} varnish · ${inOven.filter((x) => x.status === "lacquer_oven").length} lacquer`,
            hot: inOven.some((x) => minutesBetween((x.lacquer ?? x.varnish ?? x.base)!.started_at, now) > OVEN_MINUTES),
          },
          { label: "Waiting for varnish", value: waitingVarnish.length, sub: `${sum(waitingVarnish, (x) => x.good).toLocaleString("en-US")} sheets` },
          { label: "Waiting for lacquer", value: waitingLacquer.length, sub: `${sum(waitingLacquer, (x) => x.good).toLocaleString("en-US")} sheets` },
          {
            label: "Finished today",
            value: finishedToday.length,
            sub: (
              <>
                {sum(finishedToday, (x) => x.good).toLocaleString("en-US")} good sheets
                <span className="block text-[11px] opacity-60">about {formatQty(crownsFromSheets(sum(finishedToday, (x) => x.good), CROWNS_PER_SHEET))} crowns</span>
              </>
            ),
          },
        ]}
      />

      <div className={`grid grid-cols-[minmax(0,1fr)] ${canEnter ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
        {canEnter && (
          <section className="border-b-2 border-divider px-4 py-6 sm:px-8 xl:border-r-2">
            <div className="mb-4 flex flex-col gap-3">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <BaseCoatDialog brands={formBrands} nextNo={nextStillageNo(runs.map((r) => r.stillage_no))} nowLocal={nowLocal} lastTemp={lastTemp("base_coat")} />
                <BaseCoatDialog stock brands={formBrands} nextNo={nextStillageNo(runs.map((r) => r.stillage_no))} nowLocal={nowLocal} lastTemp={lastTemp("base_coat")} />
              </div>
              <SampleSheetsDialog today={today} brands={formBrands} />
              <SectionHead title="01 · Print a stillage" aside="printer + UV dryer" />
            </div>
            <PrintRunForm today={today} brands={formBrands} nextNo={nextStillageNo(runs.map((r) => r.stillage_no))} />
          </section>
        )}

        <section className="flex min-w-0 flex-col gap-7 border-b-2 border-divider px-4 py-6 sm:px-8">
          <div>
            <SectionHead title="In the oven" aside={`usually ${OVEN_MINUTES} min a pass`} />
            {inOven.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">Nothing in the oven.</p>}
            {inOven.map((x) => {
              const pass = (x.status === "lacquer_oven" ? x.lacquer : x.status === "base_oven" ? x.base : x.varnish)!;
              return (
                <div key={x.r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-divider py-3 sm:grid-cols-[minmax(0,1fr)_110px_150px]">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="font-mono text-[16px]">{x.label}</b>
                      <span className={`px-[7px] py-0.5 text-[10px] font-extrabold uppercase tracking-[.08em] ${STATUS_STYLE[x.status]}`}>{pass.stage === "base_coat" ? `00 ${pass.material ?? "base coat"}` : pass.stage === "varnish" ? "02 varnish" : "03 lacquer"}</span>
                    </span>
                    <span className="block truncate text-[13px] opacity-75">
                      {x.r.brands?.name ?? "No brand yet"} · {x.good.toLocaleString("en-US")} sheets · in at {hhmm(pass.started_at)}
                      {pass.oven_temp_c != null && ` · ${Number(pass.oven_temp_c)} °C`}
                    </span>
                  </span>
                  <OvenTimer startedAt={pass.started_at} now={now.toISOString()} />
                  {canEnter && (
                    <span className="col-span-2 sm:col-span-1">
                      <OutOfOvenDialog passId={pass.id} stillageNo={x.label} stage={pass.stage} startedAt={pass.started_at} nowLocal={nowLocal} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <SectionHead
              title="00 · Base-coated stock"
              aside={`brand later · ${coatedStock.length} stillage${coatedStock.length === 1 ? "" : "s"} · ${sum(coatedStock, (x) => x.good).toLocaleString("en-US")} sheets`}
            />
            {coatedStock.length === 0 ? (
              <p className="m-0 py-3 text-[13px] opacity-60">None. &ldquo;00 · Base coat only (brand later)&rdquo; puts plain sheets through the oven before the brand is known.</p>
            ) : (
              <>
                <p className="m-0 py-1.5 text-[12px] opacity-75">
                  {(["white", "transparent"] as const)
                    .map((c) => ({ c, xs: coatedBy(c) }))
                    .filter((g) => g.xs.length)
                    .map((g) => `${g.c === "white" ? "White" : "Transparent"}: ${g.xs.length} stillage${g.xs.length === 1 ? "" : "s"}, ${sum(g.xs, (x) => x.good).toLocaleString("en-US")} sheets`)
                    .join(" · ")}
                </p>
                {coatedStock.slice(0, 12).map((x) => (
                  <div key={x.r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-divider py-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
                    <span className="min-w-0">
                      <b className="font-mono text-[15px]">{x.label}</b>
                      <span className="block truncate text-[13px] opacity-75">
                        No brand yet · {x.good.toLocaleString("en-US")} sheets · {x.base?.material ?? "base coat"}
                        {x.base?.finished_at ? ` out ${formatDayMonth(x.base.finished_at)} ${hhmm(x.base.finished_at)}` : ""}
                      </span>
                    </span>
                    {canEnter && <PrintItDialog today={today} brands={formBrands} stillage={{ id: x.r.id, brandId: "", stillageNo: x.label, sheets: x.good || null }} />}
                  </div>
                ))}
                {coatedStock.length > 12 && <p className="m-0 pt-2 text-[12px] opacity-60">+ {coatedStock.length - 12} more, oldest first above.</p>}
              </>
            )}
          </div>

          {waitingPrint.length > 0 && (
            <div>
              <SectionHead title="01 · Waiting for printing" aside={`${waitingPrint.length} base-coated`} />
              {waitingPrint.slice(0, 12).map((x, i) => (
                <div key={x.r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-divider py-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
                  <span className="min-w-0">
                    <b className="font-mono text-[15px]">{x.label}</b>
                    <span className="block truncate text-[13px] opacity-75">
                      {x.r.brands?.name ?? "No brand yet"} · {x.good.toLocaleString("en-US")} sheets · {x.base?.material ?? "base coat"}
                      {x.base?.finished_at ? ` out ${formatDayMonth(x.base.finished_at)} ${hhmm(x.base.finished_at)}` : ""}
                    </span>
                  </span>
                  {canEnter && (
                    <PrintItDialog today={today} brands={formBrands} stillage={{ id: x.r.id, brandId: x.r.brand_id ?? "", stillageNo: x.label, sheets: x.good || null }} primary={i === 0} />
                  )}
                </div>
              ))}
            </div>
          )}

          {(
            [
              ["Waiting for varnish", "02", waitingVarnish, "varnish"],
              ["Waiting for lacquer", "03", waitingLacquer, "lacquer"],
            ] as const
          ).map(([title, no, list, stage]) => (
            <div key={stage}>
              <SectionHead title={`${no} · ${title}`} aside={`${list.length} stillage${list.length === 1 ? "" : "s"}`} />
              {list.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">None waiting.</p>}
              {list.slice(0, 12).map((x, i) => (
                <div key={x.r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-divider py-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
                  <span className="min-w-0">
                    <b className="font-mono text-[15px]">{x.label}</b>
                    <span className="block truncate text-[13px] opacity-75">
                      {x.r.brands?.name ?? "No brand yet"} · {x.good.toLocaleString("en-US")} sheets ·{" "}
                      {stage === "varnish" ? `printed ${formatDayMonth(x.r.run_date)} (${x.r.shift})` : `varnish out ${formatDayMonth(x.varnish!.finished_at)} ${hhmm(x.varnish!.finished_at!)}`}
                    </span>
                  </span>
                  {canEnter && (
                    <IntoOvenDialog runId={x.r.id} stillageNo={x.label} stage={stage} nowLocal={nowLocal} materials={materials(stage)} lastTemp={lastTemp(stage)} primary={i === 0} />
                  )}
                </div>
              ))}
              {list.length > 12 && <p className="m-0 pt-2 text-[12px] opacity-60">+ {list.length - 12} more, oldest first above.</p>}
            </div>
          ))}
        </section>
      </div>

      <section className="border-b-2 border-divider px-4 pb-6 pt-6 sm:px-8">
        <SectionHead
          title="Printed-sheet stock"
          aside={`${inStock.length} finished stillage${inStock.length === 1 ? "" : "s"} · ${sum(inStock, (x) => x.good).toLocaleString("en-US")} sheets · ${sentToday.length} sent to the press today`}
        />
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={`${BRAND_COLS} th-row border-b border-divider py-2`}>
              <span>Brand</span>
              <span>Colours</span>
              <span className="text-right">Stillages</span>
              <span className="text-right">Good sheets</span>
              <span className="text-right">Open orders need</span>
              <span>Oldest</span>
            </div>
            {byBrand.length === 0 && shortBrands.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No finished stillages in stock.</p>}
            {byBrand.map((b) => {
              const short = b.need > b.crowns;
              return (
                <div key={b.id} className={`${BRAND_COLS} border-b border-divider py-2.5 text-[13px] ${short ? "bg-accent-100" : ""}`}>
                  <span className="min-w-0">
                    <b className="block truncate">{b.brand?.name ?? "-"}</b>
                    <span className="block truncate text-[12px] opacity-65">{shortCompany(b.brand?.companies?.name)}</span>
                  </span>
                  <span className="min-w-0 text-[12px]">
                    <InkSwatches colours={b.colours} compact />
                  </span>
                  <b className="text-right tabular-nums">{b.stillages}</b>
                  <span className="text-right">
                    <b className="tabular-nums">{b.good.toLocaleString("en-US")}</b>
                    <span className="block text-[11px] opacity-60">≈ {formatQty(b.crowns)} crowns</span>
                  </span>
                  <span className={`text-right ${short ? "font-extrabold text-accent-800" : ""}`}>
                    {b.need ? `${formatQty(b.need)} crowns` : "-"}
                    {short && <span className="block text-[11px]">print ≈ {formatQty(Math.ceil((b.need - b.crowns) / CROWNS_PER_SHEET))} more sheets</span>}
                  </span>
                  <span>{formatDate(b.oldest)}</span>
                </div>
              );
            })}
            {shortBrands.map((b) => (
              <div key={`${b.brand}|${b.company}`} className={`${BRAND_COLS} border-b border-divider bg-accent-100 py-2.5 text-[13px]`}>
                <span className="min-w-0">
                  <b className="block truncate">{b.brand}</b>
                  <span className="block truncate text-[12px] opacity-65">{shortCompany(b.company)}</span>
                </span>
                <span />
                <b className="text-right tabular-nums">0</b>
                <span className="text-right opacity-60">none in stock</span>
                <span className="text-right font-extrabold text-accent-800">
                  {formatQty(b.need)} crowns
                  <span className="block text-[11px]">print ≈ {formatQty(Math.ceil(b.need / CROWNS_PER_SHEET))} sheets</span>
                </span>
                <span />
              </div>
            ))}
          </div>
        </div>
        {inStock.length > 0 && canEnter && (
          <div className="mt-5">
            <h3 className="m-0 mb-1 text-[16px]">In stock, oldest first</h3>
            {inStock.slice(0, 15).map((x, i) => (
              <div key={x.r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-divider py-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
                <span className="min-w-0">
                  <b className="font-mono text-[15px]">{x.label}</b>
                  <span className="block truncate text-[13px] opacity-75">
                    {x.r.brands?.name ?? "No brand yet"} · {x.good.toLocaleString("en-US")} sheets · finished {x.lacquer?.finished_at ? `${formatDayMonth(x.lacquer.finished_at)} ${hhmm(x.lacquer.finished_at)}` : "-"}
                  </span>
                </span>
                <ToPressDialog id={x.r.id} stillageNo={x.label} presses={presses} nowLocal={nowLocal} primary={i === 0} />
              </div>
            ))}
            {inStock.length > 15 && <p className="m-0 pt-2 text-[12px] opacity-60">+ {inStock.length - 15} more.</p>}
          </div>
        )}
        <div className="mt-6">
          <h3 className="m-0 mb-1 text-[16px]">At the presses</h3>
          <p className="m-0 mb-1 text-[12px] opacity-70">
            Sent to a press and not used up yet. The daily entry picks from these; tick &quot;all sheets used&quot; there, or mark one used up here.
          </p>
          {atPress.length === 0 && <p className="m-0 py-2 text-[13px] opacity-60">None at the presses.</p>}
          {atPress.map((x) => (
            <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-divider py-2.5">
              <span className="min-w-0">
                <b className="font-mono text-[15px]">{x.stillage_no}</b>
                <span className="block truncate text-[13px] opacity-75">
                  {x.brand} · {x.sheets.toLocaleString("en-US")} sheets · at {x.press} since {formatDayMonth(x.to_press_at)} {hhmm(x.to_press_at)} ·{" "}
                  {x.entries ? `used in ${x.entries} ${x.entries === 1 ? "entry" : "entries"}` : "not used yet"}
                </span>
              </span>
              {canEnter && (
                <ConfirmForm
                  action={setStillageUsedUp}
                  fields={{ id: x.id, used: "1" }}
                  message={`Stillage ${x.stillage_no}: all sheets used? It leaves the daily entry's list.`}
                  label="Used up ✓"
                  className="btn btn-secondary min-h-10 whitespace-nowrap text-text"
                />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="px-4 pb-6 pt-6 sm:px-8">
        <SectionHead title="Stillages" aside={`${runs.length} in the last 60 days`} />
        <div className="overflow-x-auto">
          <div className="min-w-[1240px]">
            <div className={`${ROWS} th-row border-b border-divider py-2`}>
              <span>Stillage</span>
              <span>00 Base coat</span>
              <span>01 Printed</span>
              <span>Brand</span>
              <span className="text-right">Sheets</span>
              <span>02 Varnish</span>
              <span>03 Lacquer</span>
              <span>Status</span>
            </div>
            {stillages.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No stillages in the last 60 days.</p>}
            {stillages.slice(0, 60).map((x) => (
              <div key={x.r.id} className={`${ROWS} border-b border-divider py-2 text-[13px]`} title={[inkLine(x.r.inks) && `Ink: ${inkLine(x.r.inks)}`, x.r.notes, x.base?.notes, x.varnish?.notes, x.lacquer?.notes].filter(Boolean).join(" · ") || undefined}>
                <b className="truncate font-mono">{x.label}</b>
                <span className="truncate">{x.base ? passLine(x.base) : <span className="opacity-40">-</span>}</span>
                <span>{x.printed ? `${formatDayMonth(x.r.run_date)} · ${x.r.shift}` : <span className="opacity-60">not yet</span>}</span>
                <span className="truncate">
                  {x.r.brands ? `${x.r.brands.name} · ${shortCompany(x.r.brands.companies?.name)}` : "No brand yet"}
                </span>
                <span className="text-right">
                  <b className="tabular-nums">{x.good.toLocaleString("en-US")}</b>
                  {x.printed && (x.good !== Number(x.r.sheets_printed) || Number(x.r.sheets_spoiled) > 0) ? (
                    <span className="block text-[11px] text-accent-700">
                      {(Number(x.r.sheets_spoiled) + Number(x.r.sheets_printed) - x.good).toLocaleString("en-US")} spoiled
                    </span>
                  ) : null}
                </span>
                <span className="truncate">
                  {passLine(x.varnish)}
                  {canDelete && x.varnish && !x.lacquer && (
                    <>
                      {" "}
                      <DeletePassButton id={x.varnish.id} label={`varnish of ${x.label}`} />
                    </>
                  )}
                </span>
                <span className="truncate">
                  {passLine(x.lacquer)}
                  {canDelete && x.lacquer && (
                    <>
                      {" "}
                      <DeletePassButton id={x.lacquer.id} label={`lacquer of ${x.label}`} />
                    </>
                  )}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`px-[7px] py-0.5 text-[10px] font-extrabold uppercase tracking-[.06em] ${STATUS_STYLE[x.status]}`} title={x.r.to_press_at ? `${pressName.get(x.r.press_id ?? "") ?? "Press"} · ${formatDayMonth(x.r.to_press_at)} ${hhmm(x.r.to_press_at)}` : undefined}>
                    {x.status === "at_press" && x.r.press_id ? `To ${pressName.get(x.r.press_id) ?? "the press"}` : STILLAGE_STATUS_LABEL[x.status]}
                  </span>
                  {canEnter && x.status === "at_press" && !fedProduction.has(x.r.id) && <UndoToPressButton id={x.r.id} label={x.label} />}
                  {canDelete && !x.varnish && <DeletePrintRunButton id={x.r.id} />}
                </span>
              </div>
            ))}
          </div>
        </div>
        <p className="mb-0 mt-3 text-[12px] opacity-60">
          Spoiled {formatSpoiledPct(sum(printedOnes, (x) => x.good), sum(printedOnes, (x) => Number(x.r.sheets_printed) + Number(x.r.sheets_spoiled) - x.good))} of all sheets
          through the process in the last 60 days.
        </p>
      </section>

      <section className="border-t-2 border-divider px-4 pb-8 pt-6 sm:px-8">
        <SectionHead
          title="Sample sheets"
          aside={`last 30 days · ${sum2(samples, (s) => Number(s.sheets)).toLocaleString("en-US")} sheets · ${formatGrams(sum2(samples, (s) => Object.values(s.inks ?? {}).reduce((t, g) => t + Number(g), 0)))} of ink`}
        />
        {samples.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No sample sheets in the last 30 days.</p>}
        {samples.map((s) => (
          <div key={s.id} className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-start gap-3 border-b border-divider py-2.5 text-[13px] sm:grid-cols-[100px_minmax(0,1fr)_120px_60px]">
            <span>
              {formatDayMonth(s.sample_date)}
              {s.shift ? ` · ${s.shift}` : ""}
            </span>
            <span className="min-w-0">
              <b>{s.brands?.name ?? "No brand"}</b> · {SAMPLE_PURPOSE[s.purpose] ?? s.purpose}
              <span className="block text-[12px] opacity-75">{inkLine(s.inks) || "No ink recorded"}</span>
              {s.notes && <span className="block truncate text-[12px] opacity-60">{s.notes}</span>}
            </span>
            <b className="text-right tabular-nums">{Number(s.sheets).toLocaleString("en-US")} sheets</b>
            <span className="text-right">{canDelete && <DeleteSampleButton id={s.id} />}</span>
          </div>
        ))}
      </section>


    </>
  );
}
