import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { addisDateISO, formatDate } from "@/lib/format";
import { MACHINE_SECTIONS, MAINTENANCE_KINDS, type MaintenanceKind } from "@/lib/maintenance";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { addDays } from "@/lib/production-math";
import { MEASURES, measureValue } from "@/lib/qc";
import { EXPORTS, isExportKind, type ExportKind } from "@/lib/report-exports";
import { buildXlsx, xlsxName } from "@/lib/xlsx-report";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

type Named = { name: string } | null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const time = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
/** A timestamp as Addis Ababa local time, `2026-09-27 08:30`. */
const local = (v: string | null | undefined) => (v ? time.format(new Date(v)).replace(",", "") : "");
const mins = (a: string, b: string | null) => (b ? Math.round((Date.parse(b) - Date.parse(a)) / 60000) : null);

type Kind = ExportKind;

/** Columns totalled at the bottom of each sheet. */
const TOTALS: Record<Kind, string[]> = {
  production: ["Crowns produced", "Camera rejects", "Good crowns"],
  sheets: ["Base-coated sheets", "Base coat: sheets spoiled", "Good sheets printed", "Spoiled on the print line", "Varnish: sheets spoiled", "Lacquer: sheets spoiled"],
  quality: [],
  maintenance: ["Minutes"],
  orders: ["Quantity"],
  materials: ["In", "Out"],
};

/**
 * Report downloads as Excel files in Peniel's style (admin only; internal data).
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` (Addis Ababa days, both included).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  await requireStaff(opsRolesFor("reports"));
  const { kind } = await params;
  if (!isExportKind(kind)) return new NextResponse("Not found", { status: 404 });
  const today = addisDateISO(new Date());
  const sp = request.nextUrl.searchParams;
  const from = DATE.test(sp.get("from") ?? "") ? sp.get("from")! : addDays(today, -30);
  const to = DATE.test(sp.get("to") ?? "") && sp.get("to")! >= from ? sp.get("to")! : today;
  const start = `${from}T00:00:00+03:00`;
  const end = `${addDays(to, 1)}T00:00:00+03:00`;
  const db = await createClient();
  const rows = await build(kind, db, { from, to, start, end });
  const file = await buildXlsx({
    title: EXPORTS.find((e) => e.kind === kind)!.sheetTitle,
    period: `${formatDate(from)} to ${formatDate(to)}`,
    header: rows[0] as string[],
    rows: rows.slice(1),
    totals: TOTALS[kind],
  });

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${xlsxName(kind, from, to)}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function build(kind: Kind, db: Awaited<ReturnType<typeof createClient>>, r: { from: string; to: string; start: string; end: string }) {
  if (kind === "production") {
    const { data } = await db
      .from("production_entries")
      .select("entry_date, shift, produced_qty, reject_qty, published, created_at, production_lines(name), orders(order_no, companies(name), brands(name)), enterer:profiles!production_entries_entered_by_fkey(full_name)")
      .gte("entry_date", r.from)
      .lte("entry_date", r.to)
      .order("entry_date")
      .order("shift")
      .returns<{ entry_date: string; shift: string; produced_qty: number; reject_qty: number; published: boolean; created_at: string; production_lines: Named; orders: { order_no: string; companies: Named; brands: Named } | null; enterer: { full_name: string } | null }[]>();
    return [
      ["Date", "Shift", "Line", "Order", "Customer", "Brand", "Crowns produced", "Camera rejects", "Good crowns", "Published", "Entered by", "Entered at"],
      ...(data ?? []).map((e) => [
        e.entry_date,
        e.shift,
        e.production_lines?.name,
        e.orders?.order_no,
        e.orders?.companies?.name,
        e.orders?.brands?.name,
        Number(e.produced_qty),
        Number(e.reject_qty),
        Number(e.produced_qty) - Number(e.reject_qty),
        e.published ? "Yes" : "No",
        e.enterer?.full_name,
        local(e.created_at),
      ]),
    ];
  }

  if (kind === "sheets") {
    type Pass = { stage: string; material: string | null; oven_temp_c: number | null; started_at: string; finished_at: string | null; sheets_spoiled: number };
    const { data } = await db
      .from("print_runs")
      .select(
        "stillage_no, run_date, shift, printed, base_sheets, sheets_printed, sheets_spoiled, colours, coil_lot, notes, to_press_at, brands(name, companies(name)), press:machines!print_runs_press_id_fkey(name), stillage_passes(stage, material, oven_temp_c, started_at, finished_at, sheets_spoiled)",
      )
      .gte("run_date", r.from)
      .lte("run_date", r.to)
      .order("run_date")
      .returns<{ stillage_no: string | null; run_date: string; shift: string; printed: boolean; base_sheets: number | null; sheets_printed: number; sheets_spoiled: number; colours: string[]; coil_lot: string | null; notes: string | null; to_press_at: string | null; brands: { name: string; companies: Named } | null; press: Named; stillage_passes: Pass[] }[]>();
    const pass = (ps: Pass[], stage: string) => ps.find((p) => p.stage === stage);
    const passCols = (p?: Pass) => [p?.material, local(p?.started_at), local(p?.finished_at), p ? mins(p.started_at, p.finished_at) : null, p?.oven_temp_c == null ? null : Number(p.oven_temp_c), p ? Number(p.sheets_spoiled) : null];
    const stageHead = (s: string) => [`${s}: material`, `${s}: in`, `${s}: out`, `${s}: minutes`, `${s}: °C`, `${s}: sheets spoiled`];
    return [
      ["Stillage", "Brand", "Customer", "Date", "Shift", "Printed", "Base-coated sheets", ...stageHead("Base coat"), "Good sheets printed", "Spoiled on the print line", "Colours", ...stageHead("Varnish"), ...stageHead("Lacquer"), "To the press", "Press", "Coil / lot", "Notes"],
      ...(data ?? []).map((x) => [
        x.stillage_no,
        x.brands?.name,
        x.brands?.companies?.name,
        x.run_date,
        x.shift,
        x.printed ? "Yes" : "Not yet",
        x.base_sheets,
        ...passCols(pass(x.stillage_passes, "base_coat")),
        x.printed ? Number(x.sheets_printed) : null,
        x.printed ? Number(x.sheets_spoiled) : null,
        (x.colours ?? []).join(" | "),
        ...passCols(pass(x.stillage_passes, "varnish")),
        ...passCols(pass(x.stillage_passes, "lacquer")),
        local(x.to_press_at),
        x.press?.name,
        x.coil_lot,
        x.notes,
      ]),
    ];
  }

  if (kind === "quality") {
    const { data } = await db
      .from("qc_inspections")
      .select("batch_no, inspected_at, sample_size, reject_pct, result, customer_reason, internal_notes, published, measurements, orders(order_no, companies(name), brands(name)), qc_defects(defect_type, count)")
      .gte("inspected_at", r.start)
      .lt("inspected_at", r.end)
      .order("inspected_at")
      .returns<{ batch_no: string; inspected_at: string; sample_size: number; reject_pct: number; result: string | null; customer_reason: string | null; internal_notes: string | null; published: boolean; measurements: Record<string, unknown> | null; orders: { order_no: string; companies: Named; brands: Named } | null; qc_defects: { defect_type: string; count: number }[] }[]>();
    return [
      ["Batch", "Order", "Customer", "Brand", "Inspected", "Sample", "Reject %", "Result", "Published", ...MEASURES.map((m) => `${m.label} (${m.unit})`), "Defects", "Reason for the customer", "Internal notes"],
      ...(data ?? []).map((i) => [
        i.batch_no,
        i.orders?.order_no,
        i.orders?.companies?.name,
        i.orders?.brands?.name,
        local(i.inspected_at),
        i.sample_size,
        Number(i.reject_pct),
        i.result === "released" ? "Released" : i.result === "on_hold" ? "On hold" : "",
        i.published ? "Yes" : "No",
        ...MEASURES.map((m) => measureValue(i.measurements ?? {}, m.key)),
        i.qc_defects.filter((d) => d.count > 0).map((d) => `${d.defect_type} ${d.count}`).join(" | "),
        i.customer_reason,
        i.internal_notes,
      ]),
    ];
  }

  if (kind === "maintenance") {
    const { data } = await db
      .from("maintenance_logs")
      .select("kind, started_at, finished_at, stopped_machine, description, parts, done_by, notes, machines(name, category)")
      .gte("started_at", r.start)
      .lt("started_at", r.end)
      .order("started_at")
      .returns<{ kind: MaintenanceKind; started_at: string; finished_at: string | null; stopped_machine: boolean; description: string; parts: string | null; done_by: string | null; notes: string | null; machines: { name: string; category: string } | null }[]>();
    return [
      ["Started", "Finished", "Minutes", "Machine stopped", "Machine", "Section", "Job", "What", "Parts", "Done by", "Notes"],
      ...(data ?? []).map((l) => [
        local(l.started_at),
        l.finished_at ? local(l.finished_at) : "Going on",
        mins(l.started_at, l.finished_at),
        l.stopped_machine ? "Yes" : "No",
        l.machines?.name,
        MACHINE_SECTIONS.find((s) => s.category === l.machines?.category)?.title,
        MAINTENANCE_KINDS[l.kind]?.label ?? l.kind,
        l.description,
        l.parts,
        l.done_by,
        l.notes,
      ]),
    ];
  }

  if (kind === "orders") {
    const { data } = await db
      .from("orders")
      .select("order_no, po_number, quantity, status, requested_date, confirmed_due_date, revised_due_date, delivery_method, created_at, companies(name), brands(name)")
      .gte("created_at", r.start)
      .lt("created_at", r.end)
      .order("order_no")
      .returns<{ order_no: string; po_number: string; quantity: number; status: OrderStatus; requested_date: string | null; confirmed_due_date: string | null; revised_due_date: string | null; delivery_method: string; created_at: string; companies: Named; brands: Named }[]>();
    return [
      ["Order", "Customer", "Brand", "PO", "Quantity", "Status", "Placed", "Requested date", "Confirmed due", "Revised due", "Delivery"],
      ...(data ?? []).map((o) => [
        o.order_no,
        o.companies?.name,
        o.brands?.name,
        o.po_number,
        Number(o.quantity),
        ORDER_STATUS_LABELS[o.status] ?? o.status,
        local(o.created_at),
        o.requested_date,
        o.confirmed_due_date,
        o.revised_due_date,
        o.delivery_method,
      ]),
    ];
  }

  // materials
  const { data } = await db
    .from("raw_material_movements")
    .select("quantity, reason, source, created_at, raw_materials(name, unit), profiles(full_name)")
    .gte("created_at", r.start)
    .lt("created_at", r.end)
    .order("created_at")
    .returns<{ quantity: number; reason: string; source: string; created_at: string; raw_materials: { name: string; unit: string } | null; profiles: { full_name: string } | null }[]>();
  return [
    ["When", "Material", "Unit", "In", "Out", "Automatic", "Reason", "By"],
    ...(data ?? []).map((m) => [
      local(m.created_at),
      m.raw_materials?.name,
      m.raw_materials?.unit,
      Number(m.quantity) > 0 ? Number(m.quantity) : null,
      Number(m.quantity) < 0 ? -Number(m.quantity) : null,
      m.source === "auto" ? "Yes" : "No",
      m.reason,
      m.profiles?.full_name,
    ]),
  ];
}
