import type { Metadata } from "next";
import OpsHeader from "@/components/ops/OpsHeader";
import { KpiStrip, SectionHead } from "@/components/ops/OpsKit";
import { DeletePassButton, IntoOvenDialog, OutOfOvenDialog, OvenTimer } from "@/components/ops/OvenPass";
import PrintRunForm, { DeletePrintRunButton, type PrintBrand } from "@/components/ops/PrintRunForm";
import { InkSwatches } from "@/components/ui/Crown";
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
  OVEN_MINUTES,
  STILLAGE_STATUS_LABEL,
  stillageStatus,
  type OvenStage,
  type PrintRun,
  type StillagePass,
  type StillageStatus,
} from "@/lib/print-runs";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Printed sheets" };

type RunRow = PrintRun & { created_at: string; brands: { name: string; companies: { name: string } | null } | null };
type BrandRow = { id: string; name: string; colours: string[]; companies: { name: string } | null };

const shortCompany = (name: string | undefined | null) => (name ?? "").replace(/\s+(S\.C\.|PLC)$/i, "");
const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Addis_Ababa" });
const hhmm = (iso: string) => timeFmt.format(new Date(iso));

const STATUS_STYLE: Record<StillageStatus, string> = {
  printed: "border border-text",
  varnish_oven: "bg-accent text-bg",
  varnished: "border border-accent-700 text-accent-700",
  lacquer_oven: "bg-accent text-bg",
  finished: "bg-text text-bg",
};

/**
 * Printed sheets: their own process, not tied to orders. Per stillage (about
 * 1,410 sheets): 01 the print line (two-unit roller printer with the UV dryer
 * at its end), 02 varnish through the oven (about 30 minutes), 03 lacquer
 * through the oven again. Internal only: customers never see it.
 */
export default async function PrintedSheetsPage() {
  const me = await requireStaff(opsRolesFor("sheets"));
  const canEnter = me.role === "admin" || me.role === "production";
  const now = new Date();
  const today = addisDateISO(now);
  const nowLocal = addisLocalNow();
  const supabase = await createClient();

  const [{ data: runData }, { data: brandData }] = await Promise.all([
    supabase
      .from("print_runs")
      .select("id, brand_id, stillage_no, run_date, shift, colours, sheets_printed, sheets_spoiled, crowns_per_sheet, coil_lot, notes, created_at, brands(name, companies(name))")
      .gte("run_date", addDays(today, -60))
      .order("run_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<RunRow[]>(),
    supabase.from("brands").select("id, name, colours, companies(name)").eq("active", true).order("name").returns<BrandRow[]>(),
  ]);
  const runs = runData ?? [];
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
    const varnish = mine.find((p) => p.stage === "varnish") ?? null;
    const lacquer = mine.find((p) => p.stage === "lacquer") ?? null;
    return { r, varnish, lacquer, status: stillageStatus(mine), good: goodSheets(Number(r.sheets_printed), mine), label: r.stillage_no ?? `#${r.id.slice(0, 4)}` };
  });
  const at = (s: StillageStatus) => stillages.filter((x) => x.status === s);
  const inOven = stillages.filter((x) => x.status === "varnish_oven" || x.status === "lacquer_oven");
  const waitingVarnish = at("printed").reverse();
  const waitingLacquer = at("varnished").reverse();
  const finishedToday = stillages.filter((x) => x.status === "finished" && x.lacquer?.finished_at && addisDateISO(new Date(x.lacquer.finished_at)) === today);
  const printedToday = stillages.filter((x) => x.r.run_date === today);
  const sum = (xs: typeof stillages, f: (x: (typeof stillages)[number]) => number) => xs.reduce((t, x) => t + f(x), 0);

  const lastBrand = runs[0]?.brand_id;
  const formBrands: PrintBrand[] = (brandData ?? [])
    .map((b) => ({ id: b.id, label: `${b.name} · ${shortCompany(b.companies?.name)}`, colours: b.colours ?? [] }))
    .sort((a, b) => Number(b.id === lastBrand) - Number(a.id === lastBrand));
  const materials = (stage: OvenStage) => [...new Set(passes.filter((p) => p.stage === stage).reverse().map((p) => p.material).filter((m): m is string => Boolean(m)))].slice(0, 20);
  const lastTemp = (stage: OvenStage) => {
    const t = [...passes].reverse().find((p) => p.stage === stage && p.oven_temp_c != null)?.oven_temp_c;
    return t == null ? null : Number(t);
  };

  const finished = at("finished");
  const byBrand = [...new Set(finished.map((x) => x.r.brand_id))]
    .map((id) => {
      const mine = finished.filter((x) => x.r.brand_id === id);
      return { id, brand: mine[0].r.brands, colours: mine[0].r.colours, stillages: mine.length, good: sum(mine, (x) => x.good), last: mine[0].r.run_date };
    })
    .sort((a, b) => b.good - a.good);

  const passLine = (p: StillagePass | null) =>
    p
      ? `${hhmm(p.started_at)}–${p.finished_at ? `${hhmm(p.finished_at)} (${minutesBetween(p.started_at, p.finished_at)} min)` : "in the oven"}${p.oven_temp_c != null ? ` · ${Number(p.oven_temp_c)} °C` : ""}${p.material ? ` · ${p.material}` : ""}`
      : "-";
  const BRAND_COLS = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_80px_110px_80px] items-center gap-3";
  const ROWS = "grid grid-cols-[90px_96px_minmax(0,1fr)_100px_minmax(0,1.4fr)_minmax(0,1.4fr)_190px] items-center gap-3";

  return (
    <>
      <OpsHeader
        crumb={{ label: "Production", href: "/ops/production", current: "Printed sheets" }}
        title="Printed sheets"
        sub={`Per stillage: 01 print line (printer + UV dryer) → 02 varnish through the oven (about ${OVEN_MINUTES} min) → 03 lacquer through the oven. Not tied to orders.`}
        actions={<InternalOnly>Internal only · customers never see printed sheets</InternalOnly>}
      />

      <KpiStrip
        items={[
          { label: "Printed today", value: printedToday.length, sub: `stillages · ${sum(printedToday, (x) => Number(x.r.sheets_printed)).toLocaleString("en-US")} sheets` },
          {
            label: "In the oven",
            value: inOven.length,
            sub: `${inOven.filter((x) => x.status === "varnish_oven").length} varnish · ${inOven.filter((x) => x.status === "lacquer_oven").length} lacquer`,
            hot: inOven.some((x) => minutesBetween((x.lacquer ?? x.varnish)!.started_at, now) > OVEN_MINUTES),
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
            <div className="mb-4">
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
              const pass = (x.status === "lacquer_oven" ? x.lacquer : x.varnish)!;
              return (
                <div key={x.r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-divider py-3 sm:grid-cols-[minmax(0,1fr)_110px_150px]">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <b className="font-mono text-[16px]">{x.label}</b>
                      <span className={`px-[7px] py-0.5 text-[10px] font-extrabold uppercase tracking-[.08em] ${STATUS_STYLE[x.status]}`}>{pass.stage === "varnish" ? "02 varnish" : "03 lacquer"}</span>
                    </span>
                    <span className="block truncate text-[13px] opacity-75">
                      {x.r.brands?.name ?? "-"} · {x.good.toLocaleString("en-US")} sheets · in at {hhmm(pass.started_at)}
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
                      {x.r.brands?.name ?? "-"} · {x.good.toLocaleString("en-US")} sheets ·{" "}
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

      <section className="px-4 pb-6 pt-6 sm:px-8">
        <SectionHead title="Stillages" aside={`${runs.length} in the last 60 days`} />
        <div className="overflow-x-auto">
          <div className="min-w-[1100px]">
            <div className={`${ROWS} th-row border-b border-divider py-2`}>
              <span>Stillage</span>
              <span>01 Printed</span>
              <span>Brand</span>
              <span className="text-right">Sheets</span>
              <span>02 Varnish</span>
              <span>03 Lacquer</span>
              <span>Status</span>
            </div>
            {stillages.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No stillages in the last 60 days.</p>}
            {stillages.slice(0, 60).map((x) => (
              <div key={x.r.id} className={`${ROWS} border-b border-divider py-2 text-[13px]`} title={[x.r.notes, x.varnish?.notes, x.lacquer?.notes].filter(Boolean).join(" · ") || undefined}>
                <b className="truncate font-mono">{x.label}</b>
                <span>
                  {formatDayMonth(x.r.run_date)} · {x.r.shift}
                </span>
                <span className="truncate">
                  {x.r.brands?.name ?? "-"} · {shortCompany(x.r.brands?.companies?.name)}
                </span>
                <span className="text-right">
                  <b className="tabular-nums">{x.good.toLocaleString("en-US")}</b>
                  {x.good !== Number(x.r.sheets_printed) || Number(x.r.sheets_spoiled) > 0 ? (
                    <span className="block text-[11px] text-accent-700">
                      {(Number(x.r.sheets_spoiled) + Number(x.r.sheets_printed) - x.good).toLocaleString("en-US")} spoiled
                    </span>
                  ) : null}
                </span>
                <span className="truncate">
                  {passLine(x.varnish)}
                  {canEnter && x.varnish && !x.lacquer && (
                    <>
                      {" "}
                      <DeletePassButton id={x.varnish.id} label={`varnish of ${x.label}`} />
                    </>
                  )}
                </span>
                <span className="truncate">
                  {passLine(x.lacquer)}
                  {canEnter && x.lacquer && (
                    <>
                      {" "}
                      <DeletePassButton id={x.lacquer.id} label={`lacquer of ${x.label}`} />
                    </>
                  )}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`px-[7px] py-0.5 text-[10px] font-extrabold uppercase tracking-[.06em] ${STATUS_STYLE[x.status]}`}>{STILLAGE_STATUS_LABEL[x.status]}</span>
                  {canEnter && !x.varnish && <DeletePrintRunButton id={x.r.id} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-8 pt-4 sm:px-8">
        <SectionHead title="Finished, by brand" aside="lacquered · last 60 days" />
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className={`${BRAND_COLS} th-row border-b border-divider py-2`}>
              <span>Brand</span>
              <span>Colours</span>
              <span className="text-right">Stillages</span>
              <span className="text-right">Good sheets</span>
              <span>Last</span>
            </div>
            {byBrand.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No finished stillages yet.</p>}
            {byBrand.map((b) => (
              <div key={b.id} className={`${BRAND_COLS} border-b border-divider py-2.5 text-[13px]`}>
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
                  <span className="block text-[11px] opacity-60">≈ {formatQty(crownsFromSheets(b.good, CROWNS_PER_SHEET))} crowns</span>
                </span>
                <span>{formatDate(b.last)}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="mb-0 mt-3 text-[12px] opacity-60">
          Spoiled {formatSpoiledPct(sum(stillages, (x) => x.good), sum(stillages, (x) => Number(x.r.sheets_printed) + Number(x.r.sheets_spoiled) - x.good))} of all sheets
          through the process in the last 60 days.
        </p>
      </section>
    </>
  );
}
