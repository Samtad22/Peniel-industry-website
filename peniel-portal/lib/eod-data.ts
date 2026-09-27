import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EodInput } from "@/lib/eod-report";
import { addDays } from "@/lib/production-math";
import { getSettings } from "@/lib/settings-server";
import type { OrderStatus } from "@/lib/order-status";
import { downtimeMinutes, MAINTENANCE_KINDS, nextServiceDue, type Machine, type MaintenanceLog } from "@/lib/maintenance";

// Loads one day's records for the end-of-day report (lib/eod-report.ts). Runs
// with an admin's own client (the report page) or the service role (the
// evening email); both read every row. INTERNAL: never for customers.

type Named = { name: string } | null;
const ACTIVE: OrderStatus[] = ["confirmed", "awaiting_approval", "scheduled", "in_production", "quality_check", "on_hold"];

export async function loadEodInput(db: SupabaseClient, date: string, now = new Date()): Promise<EodInput> {
  // The day in Addis Ababa (UTC+3, no daylight saving).
  const from = `${date}T00:00:00+03:00`;
  const to = `${addDays(date, 1)}T00:00:00+03:00`;
  const week = addDays(date, 7);

  const [prod, runs, out, oven, insp, unsigned, sorting, created, events, inbox, held, open, added, collected, pickups, materials, machinesRes, maintRes, sent, stock] = await Promise.all([
    db
      .from("production_entries")
      .select("shift, produced_qty, reject_qty, published, orders(order_no, companies(name), brands(name))")
      .eq("entry_date", date)
      .returns<{ shift: string; produced_qty: number; reject_qty: number; published: boolean; orders: { order_no: string; companies: Named; brands: Named } | null }[]>(),
    db
      .from("print_runs")
      .select("stillage_no, sheets_printed, sheets_spoiled, brands(name)")
      .eq("run_date", date)
      .eq("printed", true)
      .order("created_at")
      .returns<{ stillage_no: string | null; sheets_printed: number; sheets_spoiled: number; brands: Named }[]>(),
    db.from("stillage_passes").select("stage, sheets_spoiled").gte("finished_at", from).lt("finished_at", to).returns<EodInput["passesOut"]>(),
    db
      .from("stillage_passes")
      .select("stage, started_at, print_runs(stillage_no)")
      .is("finished_at", null)
      .order("started_at")
      .returns<{ stage: "base_coat" | "varnish" | "lacquer"; started_at: string; print_runs: { stillage_no: string | null } | null }[]>(),
    db
      .from("qc_inspections")
      .select("batch_no, result, published, orders(order_no, brands(name))")
      .gte("inspected_at", from)
      .lt("inspected_at", to)
      .order("inspected_at")
      .returns<{ batch_no: string; result: "released" | "on_hold" | null; published: boolean; orders: { order_no: string; brands: Named } | null }[]>(),
    // Released and published, not from before signing existed, and no signature yet.
    db
      .from("qc_inspections")
      .select("batch_no, orders(order_no), coa_signatures(id)")
      .eq("published", true)
      .eq("result", "released")
      .eq("coa_legacy", false)
      .gte("inspected_at", `${addDays(date, -60)}T00:00:00+03:00`)
      .returns<{ batch_no: string; orders: { order_no: string } | null; coa_signatures: { id: string }[] }[]>(),
    db.from("sorting_records").select("passed_cartons, waste_cartons").eq("sorted_on", date).returns<EodInput["sorting"]>(),
    db
      .from("orders")
      .select("order_no, quantity, companies(name), brands(name)")
      .gte("created_at", from)
      .lt("created_at", to)
      .order("order_no")
      .returns<{ order_no: string; quantity: number; companies: Named; brands: Named }[]>(),
    db
      .from("order_status_events")
      .select("status, orders(order_no)")
      .gte("created_at", from)
      .lt("created_at", to)
      .returns<{ status: OrderStatus; orders: { order_no: string } | null }[]>(),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "on_hold"),
    db
      .from("orders")
      .select("order_no, status, confirmed_due_date, revised_due_date, companies(name), brands(name)")
      .in("status", ACTIVE)
      .returns<{ order_no: string; status: OrderStatus; confirmed_due_date: string | null; revised_due_date: string | null; companies: Named; brands: Named }[]>(),
    db.from("finished_stock").select("quantity").gte("ready_since", from).lt("ready_since", to).returns<{ quantity: number }[]>(),
    db.from("finished_stock").select("quantity").gte("collected_at", from).lt("collected_at", to).returns<{ quantity: number }[]>(),
    db.from("pickup_bookings").select("id", { count: "exact", head: true }).eq("status", "requested"),
    db.from("raw_materials").select("name, on_hand, unit, reorder_level").eq("active", true).returns<{ name: string; on_hand: number; unit: string; reorder_level: number | null }[]>(),
    db
      .from("machines")
      .select("id, code, name, category, parent_id, sort_order, status, status_note, status_since, service_every_days")
      .eq("active", true)
      .returns<Machine[]>(),
    // Jobs of the last year (for planned services) that started before the day ended.
    db
      .from("maintenance_logs")
      .select("id, machine_id, kind, started_at, finished_at, stopped_machine, description, parts, done_by, notes")
      .lt("started_at", to)
      .gte("started_at", `${addDays(date, -365)}T00:00:00+03:00`)
      .returns<MaintenanceLog[]>(),
    db.from("print_runs").select("id", { count: "exact", head: true }).gte("to_press_at", from).lt("to_press_at", to),
    db
      .from("print_runs")
      .select("id, stillage_passes(stage, finished_at)")
      .eq("printed", true)
      .is("to_press_at", null)
      .limit(20000)
      .returns<{ id: string; stillage_passes: { stage: string; finished_at: string | null }[] }[]>(),
  ]);
  const machines = machinesRes.data ?? [];
  const maintLogs = maintRes.data ?? [];
  const nameOf = new Map(machines.map((m) => [m.id, m.name]));
  const end = new Date(Math.min(now.getTime(), Date.parse(to))).toISOString();
  // Jobs that ran on the day: started that day, or still open / finished that day.
  const dayFrom = Date.parse(from);
  const onDay = maintLogs.filter((l) => !l.finished_at || Date.parse(l.finished_at) >= dayFrom || Date.parse(l.started_at) >= dayFrom);

  return {
    date,
    now: now.toISOString(),
    production: (prod.data ?? []).map((p) => ({
      shift: p.shift,
      produced_qty: Number(p.produced_qty),
      reject_qty: Number(p.reject_qty),
      published: p.published,
      order_no: p.orders?.order_no ?? "-",
      brand: p.orders?.brands?.name ?? "",
      customer: p.orders?.companies?.name ?? "",
    })),
    printRuns: (runs.data ?? []).map((r) => ({ stillage_no: r.stillage_no, brand: r.brands?.name ?? "", sheets_printed: Number(r.sheets_printed), sheets_spoiled: Number(r.sheets_spoiled) })),
    passesOut: (out.data ?? []).map((p) => ({ stage: p.stage, sheets_spoiled: Number(p.sheets_spoiled) })),
    toPress: sent.count ?? 0,
    sheetStock: (stock.data ?? []).filter((r) => (r.stillage_passes ?? []).some((p) => p.stage === "lacquer" && p.finished_at)).length,
    inOven: (oven.data ?? []).map((p) => ({ stage: p.stage, started_at: p.started_at, stillage_no: p.print_runs?.stillage_no ?? null })),
    inspections: (insp.data ?? []).map((i) => ({ batch_no: i.batch_no, result: i.result, published: i.published, order_no: i.orders?.order_no ?? "-", brand: i.orders?.brands?.name ?? "" })),
    unsignedCertificates: (unsigned.data ?? []).filter((i) => i.coa_signatures.length === 0).map((i) => ({ batch_no: i.batch_no, order_no: i.orders?.order_no ?? "-" })),
    sorting: (sorting.data ?? []).map((s) => ({ passed_cartons: Number(s.passed_cartons), waste_cartons: Number(s.waste_cartons) })),
    newOrders: (created.data ?? []).map((o) => ({ order_no: o.order_no, quantity: Number(o.quantity), customer: o.companies?.name ?? "", brand: o.brands?.name ?? "" })),
    statusChanges: (events.data ?? []).map((e) => ({ status: e.status, order_no: e.orders?.order_no ?? "-" })),
    inboxWaiting: inbox.count ?? 0,
    onHold: held.count ?? 0,
    dueSoon: (open.data ?? [])
      .map((o) => ({ order_no: o.order_no, status: o.status, customer: o.companies?.name ?? "", brand: o.brands?.name ?? "", due: o.revised_due_date ?? o.confirmed_due_date ?? "" }))
      .filter((o) => o.due && o.due >= date && o.due <= week)
      .sort((a, b) => a.due.localeCompare(b.due)),
    stockAdded: (added.data ?? []).map((s) => Number(s.quantity)),
    stockCollected: (collected.data ?? []).map((s) => Number(s.quantity)),
    pickupsRequested: pickups.count ?? 0,
    lowMaterials: (materials.data ?? [])
      .filter((m) => m.reorder_level != null && Number(m.on_hand) <= Number(m.reorder_level))
      .map((m) => ({ name: m.name, on_hand: Number(m.on_hand), unit: m.unit, reorder_level: Number(m.reorder_level) })),
    maintenance: onDay
      .sort((a, b) => a.started_at.localeCompare(b.started_at))
      .map((l) => ({
        machine: nameOf.get(l.machine_id) ?? "Machine",
        kind: MAINTENANCE_KINDS[l.kind]?.label ?? l.kind,
        description: l.description,
        minutes: downtimeMinutes([l], new Date(from).toISOString(), end),
        open: !l.finished_at,
        stopped: l.stopped_machine,
      })),
    machinesDown: machines.filter((m) => m.status === "down").map((m) => ({ name: m.name, since: m.status_since, note: m.status_note })),
    servicesOverdue: machines
      .map((m) => ({ name: m.name, due: nextServiceDue(m, maintLogs.filter((l) => l.machine_id === m.id), date) }))
      .filter((x) => x.due && x.due.days < 0)
      .map((x) => ({ name: x.name, days: -x.due!.days })),
  };
}

/** Who gets the end-of-day and monthly reports: the staff chosen in Settings, or all active admins. */
export async function eodRecipients(db: SupabaseClient): Promise<string[]> {
  const chosen = (await getSettings()).report_recipients;
  let q = db.from("profiles").select("email").eq("active", true).neq("role", "customer_user");
  q = chosen.length ? q.in("user_id", chosen) : q.eq("role", "admin");
  const { data } = await q.returns<{ email: string | null }[]>();
  return (data ?? []).map((p) => p.email ?? "").filter(Boolean);
}
