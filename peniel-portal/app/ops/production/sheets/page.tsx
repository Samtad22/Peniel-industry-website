import type { Metadata } from "next";
import OpsHeader from "@/components/ops/OpsHeader";
import { KpiStrip, SectionHead } from "@/components/ops/OpsKit";
import PrintRunForm, { DeletePrintRunButton, type PrintBrand } from "@/components/ops/PrintRunForm";
import { InkSwatches } from "@/components/ui/Crown";
import { InternalOnly } from "@/components/ui/Visibility";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate, formatDayMonth, formatQty } from "@/lib/format";
import { formatSpoiledPct, printTotals, type PrintRun } from "@/lib/print-runs";
import { addDays } from "@/lib/production-math";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Printed sheets" };

type RunRow = PrintRun & { created_at: string; brands: { name: string; companies: { name: string } | null } | null };
type BrandRow = { id: string; name: string; colours: string[]; companies: { name: string } | null };

const shortCompany = (name: string | undefined | null) => (name ?? "").replace(/\s+(S\.C\.|PLC)$/i, "");

/**
 * Printed sheets: their own process, not tied to orders. Tinplate sheets go
 * through the 2-unit roller printer, UV dryer, varnish oven and lacquer
 * coating and come off on stillages (about 1,410 sheets each). One entry per
 * finished stillage. Internal only: customers never see it.
 */
export default async function PrintedSheetsPage() {
  const me = await requireStaff(opsRolesFor("sheets"));
  const canEnter = me.role === "admin" || me.role === "production";
  const today = addisDateISO(new Date());
  const supabase = await createClient();

  const [{ data: runData }, { data: brandData }] = await Promise.all([
    supabase
      .from("print_runs")
      .select(
        "id, brand_id, stillage_no, run_date, shift, colours, sheets_printed, sheets_spoiled, crowns_per_sheet, varnish, lacquer, oven_temp_c, coil_lot, notes, created_at, brands(name, companies(name))",
      )
      .gte("run_date", addDays(today, -60))
      .order("run_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000)
      .returns<RunRow[]>(),
    supabase.from("brands").select("id, name, colours, companies(name)").eq("active", true).order("name").returns<BrandRow[]>(),
  ]);
  const runs = runData ?? [];

  const todayT = printTotals(runs.filter((r) => r.run_date === today));
  const weekT = printTotals(runs.filter((r) => r.run_date >= addDays(today, -6)));
  // The brand printed last comes first in the form.
  const lastBrand = runs[0]?.brand_id;
  const formBrands: PrintBrand[] = (brandData ?? [])
    .map((b) => ({ id: b.id, label: `${b.name} · ${shortCompany(b.companies?.name)}`, colours: b.colours ?? [] }))
    .sort((a, b) => Number(b.id === lastBrand) - Number(a.id === lastBrand));
  const distinct = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].slice(0, 20);

  const byBrand = [...new Set(runs.map((r) => r.brand_id))]
    .map((id) => {
      const mine = runs.filter((r) => r.brand_id === id);
      return { id, brand: mine[0].brands, colours: mine[0].colours, t: printTotals(mine) };
    })
    .sort((a, b) => b.t.printed - a.t.printed);

  const BRAND_COLS = "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_80px_110px_80px_90px] items-center gap-3";
  const RUN_COLS = "grid grid-cols-[96px_44px_90px_minmax(0,1fr)_80px_70px_minmax(0,1.6fr)_56px] items-center gap-3";

  return (
    <>
      <OpsHeader
        crumb={{ label: "Production", href: "/ops/production", current: "Printed sheets" }}
        title="Printed sheets"
        sub="Tinplate sheets through the 2-unit roller printer, UV dryer, varnish oven and lacquer coating, counted per stillage. Not tied to orders."
        actions={<InternalOnly>Internal only · customers never see printed sheets</InternalOnly>}
      />

      <KpiStrip
        items={[
          { label: "Stillages today", value: todayT.stillages, sub: `${todayT.printed.toLocaleString("en-US")} good sheets` },
          { label: "Spoiled today", value: formatSpoiledPct(todayT.printed, todayT.spoiled), sub: `${todayT.spoiled.toLocaleString("en-US")} sheets`, warn: todayT.spoiled > 0 },
          {
            label: "Sheets · 7 days",
            value: weekT.printed.toLocaleString("en-US"),
            sub: (
              <>
                {weekT.stillages} stillages · {formatSpoiledPct(weekT.printed, weekT.spoiled)} spoiled
                <span className="block text-[11px] opacity-60">about {formatQty(weekT.crowns)} crowns</span>
              </>
            ),
          },
          { label: "Brands printed · 7 days", value: new Set(runs.filter((r) => r.run_date >= addDays(today, -6)).map((r) => r.brand_id)).size, sub: "different designs" },
        ]}
      />

      <div className={`grid grid-cols-[minmax(0,1fr)] ${canEnter ? "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" : ""}`}>
        {canEnter && (
          <section className="border-b-2 border-divider px-4 py-6 sm:px-8 xl:border-r-2">
            <div className="mb-4">
              <SectionHead title="Log a stillage" />
            </div>
            <PrintRunForm today={today} brands={formBrands} varnishes={distinct(runs.map((r) => r.varnish))} lacquers={distinct(runs.map((r) => r.lacquer))} />
          </section>
        )}
        <section className="min-w-0 border-b-2 border-divider px-4 py-6 sm:px-8">
          <SectionHead title="By brand" aside="last 60 days" />
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className={`${BRAND_COLS} th-row border-b border-divider py-2`}>
                <span>Brand</span>
                <span>Colours</span>
                <span className="text-right">Stillages</span>
                <span className="text-right">Good sheets</span>
                <span className="text-right">Spoiled</span>
                <span>Last</span>
              </div>
              {byBrand.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No stillages logged yet.</p>}
              {byBrand.map(({ id, brand, colours, t }) => (
                <div key={id} className={`${BRAND_COLS} border-b border-divider py-2.5 text-[13px]`}>
                  <span className="min-w-0">
                    <b className="block truncate">{brand?.name ?? "-"}</b>
                    <span className="block truncate text-[12px] opacity-65">{shortCompany(brand?.companies?.name)}</span>
                  </span>
                  <span className="min-w-0 text-[12px]">
                    <InkSwatches colours={colours} compact />
                  </span>
                  <b className="text-right tabular-nums">{t.stillages}</b>
                  <span className="text-right">
                    <b className="tabular-nums">{t.printed.toLocaleString("en-US")}</b>
                    <span className="block text-[11px] opacity-60">≈ {formatQty(t.crowns)} crowns</span>
                  </span>
                  <span className="text-right">{formatSpoiledPct(t.printed, t.spoiled)}</span>
                  <span>{t.lastRun ? formatDayMonth(t.lastRun) : "-"}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="px-4 pb-8 pt-6 sm:px-8">
        <SectionHead title="Recent stillages" aside={`${runs.length} in the last 60 days`} />
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={`${RUN_COLS} th-row border-b border-divider py-2`}>
              <span>Date</span>
              <span>Shift</span>
              <span>Stillage</span>
              <span>Brand</span>
              <span className="text-right">Good</span>
              <span className="text-right">Spoiled</span>
              <span>Varnish · oven · lacquer · coil</span>
              <span />
            </div>
            {runs.length === 0 && <p className="m-0 py-3 text-[13px] opacity-60">No stillages in the last 60 days.</p>}
            {runs.slice(0, 50).map((r) => (
              <div key={r.id} className={`${RUN_COLS} border-b border-divider py-2 text-[13px]`} title={r.notes ?? undefined}>
                <span>{formatDate(r.run_date)}</span>
                <span>{r.shift}</span>
                <span className="truncate font-mono text-[12px]">{r.stillage_no ?? "-"}</span>
                <span className="truncate">
                  {r.brands?.name ?? "-"} · {shortCompany(r.brands?.companies?.name)}
                </span>
                <b className="text-right tabular-nums">{r.sheets_printed.toLocaleString("en-US")}</b>
                <span className={`text-right tabular-nums ${r.sheets_spoiled ? "font-extrabold text-accent-700" : ""}`}>{r.sheets_spoiled.toLocaleString("en-US")}</span>
                <span className="truncate">
                  {[r.varnish, r.oven_temp_c != null ? `${Number(r.oven_temp_c)} °C` : null, r.lacquer, r.coil_lot].filter(Boolean).join(" · ") || "-"}
                </span>
                {canEnter ? <DeletePrintRunButton id={r.id} /> : <span />}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
