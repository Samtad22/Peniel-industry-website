import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAINTENANCE_KINDS, type MaintenanceKind } from "@/lib/maintenance";
import { monthBounds, type MonthInput } from "@/lib/month-report";
import { addDays } from "@/lib/production-math";

// Loads one month's records for the monthly summary (lib/month-report.ts), with
// an admin's own client (the page) or the service role (the email on the 1st).
// INTERNAL: never for customers.

type Named = { name: string } | null;
const DONE = ["ready_for_pickup", "dispatched", "delivered"];

export async function loadMonthInput(db: SupabaseClient, month: string): Promise<MonthInput> {
  const { from, to } = monthBounds(month);
  const start = `${from}T00:00:00+03:00`;
  const end = `${addDays(to, 1)}T00:00:00+03:00`;

  const [prod, runs, stock, insp, sorting, created, done, held, maint, materials, moves] = await Promise.all([
    db
      .from("production_entries")
      .select("entry_date, produced_qty, reject_qty, production_lines(name), orders(companies(name), brands(name))")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .limit(20000)
      .returns<{ entry_date: string; produced_qty: number; reject_qty: number; production_lines: Named; orders: { companies: Named; brands: Named } | null }[]>(),
    db
      .from("print_runs")
      .select("printed, sheets_printed, sheets_spoiled, base_sheets, to_press_at, stillage_passes(stage, sheets_spoiled)")
      .gte("run_date", from)
      .lte("run_date", to)
      .limit(20000)
      .returns<{ printed: boolean; sheets_printed: number; sheets_spoiled: number; base_sheets: number | null; to_press_at: string | null; stillage_passes: { stage: string; sheets_spoiled: number }[] }[]>(),
    // Finished stillages in stock now: printed, lacquer out, not sent to a press.
    db
      .from("print_runs")
      .select("id, stillage_passes(stage, finished_at)")
      .eq("printed", true)
      .is("to_press_at", null)
      .limit(20000)
      .returns<{ id: string; stillage_passes: { stage: string; finished_at: string | null }[] }[]>(),
    db.from("qc_inspections").select("result").gte("inspected_at", start).lt("inspected_at", end).returns<{ result: "released" | "on_hold" | null }[]>(),
    db.from("sorting_records").select("passed_cartons, waste_cartons").gte("sorted_on", from).lte("sorted_on", to).returns<{ passed_cartons: number; waste_cartons: number }[]>(),
    db.from("orders").select("quantity, companies(name)").gte("created_at", start).lt("created_at", end).returns<{ quantity: number; companies: Named }[]>(),
    db.from("order_status_events").select("order_id").in("status", DONE).gte("created_at", start).lt("created_at", end).returns<{ order_id: string }[]>(),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "on_hold"),
    db
      .from("maintenance_logs")
      .select("kind, started_at, finished_at, stopped_machine, machines(name)")
      .lt("started_at", end)
      .or(`finished_at.is.null,finished_at.gte.${start}`)
      .returns<{ kind: MaintenanceKind; started_at: string; finished_at: string | null; stopped_machine: boolean; machines: Named }[]>(),
    db.from("raw_materials").select("id, name, unit, on_hand").order("name").returns<{ id: string; name: string; unit: string; on_hand: number }[]>(),
    db.from("raw_material_movements").select("material_id, quantity, source").gte("created_at", start).lt("created_at", end).limit(50000).returns<{ material_id: string; quantity: number; source: string }[]>(),
  ]);

  const a = Date.parse(start);
  const b = Math.min(Date.parse(end), Date.now());
  const inMonth = (s: string, f: string | null) => Math.max(0, Math.round((Math.min(b, f ? Date.parse(f) : b) - Math.max(a, Date.parse(s))) / 60000));

  return {
    month,
    production: (prod.data ?? []).map((p) => ({
      line: p.production_lines?.name ?? "-",
      brand: p.orders?.brands?.name ?? "",
      customer: p.orders?.companies?.name ?? "",
      produced: Number(p.produced_qty),
      rejects: Number(p.reject_qty),
      date: p.entry_date,
    })),
    stillages: (runs.data ?? []).map((r) => ({
      printed: r.printed,
      // Good sheets: printed less what varnish and lacquer spoiled.
      good: Math.max(0, Number(r.sheets_printed) - (r.stillage_passes ?? []).filter((p) => p.stage !== "base_coat").reduce((t, p) => t + Number(p.sheets_spoiled), 0)),
      spoiled: Number(r.sheets_spoiled) + (r.stillage_passes ?? []).filter((p) => p.stage !== "base_coat").reduce((t, p) => t + Number(p.sheets_spoiled), 0),
      baseCoated: r.base_sheets != null,
      toPress: Boolean(r.to_press_at),
    })),
    sheetStock: (stock.data ?? []).filter((r) => (r.stillage_passes ?? []).some((p) => p.stage === "lacquer" && p.finished_at)).length,
    inspections: insp.data ?? [],
    sorting: (sorting.data ?? []).map((s) => ({ passed: Number(s.passed_cartons), waste: Number(s.waste_cartons) })),
    newOrders: (created.data ?? []).map((o) => ({ quantity: Number(o.quantity), customer: o.companies?.name ?? "" })),
    completedOrders: new Set((done.data ?? []).map((e) => e.order_id)).size,
    onHoldNow: held.count ?? 0,
    maintenance: (maint.data ?? []).map((l) => ({
      machine: l.machines?.name ?? "Machine",
      kind: MAINTENANCE_KINDS[l.kind]?.label ?? l.kind,
      minutes: inMonth(l.started_at, l.finished_at),
      stopped: l.stopped_machine,
    })),
    materials: (materials.data ?? []).map((m) => {
      const mine = (moves.data ?? []).filter((x) => x.material_id === m.id);
      return {
        name: m.name,
        unit: m.unit,
        used: -mine.filter((x) => Number(x.quantity) < 0).reduce((t, x) => t + Number(x.quantity), 0),
        received: mine.filter((x) => Number(x.quantity) > 0).reduce((t, x) => t + Number(x.quantity), 0),
        onHand: Number(m.on_hand),
      };
    }),
  };
}
