import type { Metadata } from "next";
import { notFound } from "next/navigation";
import InspectionForm, { type InspectionInitial } from "@/components/ops/InspectionForm";
import OpsHeader from "@/components/ops/OpsHeader";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatQty } from "@/lib/format";
import { loadPresets } from "@/lib/presets";
import { MEASURES, measureValue, VISUAL_SAMPLE } from "@/lib/qc";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inspection" };

type Inspection = {
  id: string;
  batch_no: string;
  order_id: string;
  inspected_at: string;
  sample_size: number;
  measurements: Record<string, unknown>;
  result: "released" | "on_hold" | null;
  customer_reason: string | null;
  internal_notes: string | null;
  published: boolean;
  qc_defects: { defect_type: string; count: number }[];
  orders: { order_no: string; companies: { name: string } | null; brands: { name: string } | null } | null;
};

/** `2026-09-20T14:30` in Addis Ababa time, for a datetime-local input. */
function addisLocal(iso: string | Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** Log a new inspection (`/ops/quality/new`) or open one (design 1j). */
export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  const me = await requireStaff(opsRolesFor("quality"));
  const { id } = await params;
  const { order } = await searchParams;
  const isNew = id === "new";
  if (!isNew && !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const [{ data: insp }, { data: orders }, { data: defectTypes }, presets] = await Promise.all([
    isNew
      ? Promise.resolve({ data: null })
      : supabase
          .from("qc_inspections")
          .select(
            "id, batch_no, order_id, inspected_at, sample_size, measurements, result, customer_reason, internal_notes, published, qc_defects(defect_type, count), orders(order_no, companies(name), brands(name))",
          )
          .eq("id", id)
          .maybeSingle<Inspection>(),
    supabase
      .from("orders")
      .select("id, order_no, quantity, status, companies(name), brands(name)")
      .in("status", ["scheduled", "in_production", "quality_check", "on_hold", "ready_for_pickup", "dispatched"])
      .order("order_no", { ascending: false })
      .returns<{ id: string; order_no: string; quantity: number; companies: { name: string } | null; brands: { name: string } | null }[]>(),
    supabase
      .from("defect_types")
      .select("code, customer_label")
      .eq("active", true)
      .order("sort_order")
      .order("customer_label")
      .returns<{ code: string; customer_label: string }[]>(),
    loadPresets(supabase),
  ]);
  if (!isNew && !insp) notFound();

  const orderOptions = (orders ?? []).map((o) => ({
    id: o.id,
    label: `${o.order_no} · ${o.companies?.name.split(" ")[0] ?? ""} · ${o.brands?.name ?? ""} · ${formatQty(o.quantity)}`,
  }));
  if (insp && !orderOptions.some((o) => o.id === insp.order_id)) {
    orderOptions.unshift({ id: insp.order_id, label: `${insp.orders?.order_no ?? "Order"} · ${insp.orders?.brands?.name ?? ""}` });
  }

  const initial: InspectionInitial = insp
    ? {
        id: insp.id,
        batch_no: insp.batch_no,
        order_id: insp.order_id,
        inspected_at: addisLocal(insp.inspected_at),
        sample_size: String(insp.sample_size),
        measurements: Object.fromEntries(
          MEASURES.map((m) => [m.key, measureValue(insp.measurements, m.key)?.toString() ?? ""]),
        ),
        defects: Object.fromEntries(insp.qc_defects.map((d) => [d.defect_type, String(d.count)])),
        result: insp.result ?? "",
        customer_reason: insp.customer_reason ?? "",
        internal_notes: insp.internal_notes ?? "",
        published: insp.published,
      }
    : {
        batch_no: "",
        order_id: orderOptions.some((o) => o.id === order) ? order! : "",
        inspected_at: addisLocal(new Date()),
        sample_size: String(VISUAL_SAMPLE),
        measurements: {},
        defects: {},
        result: "",
        customer_reason: "",
        internal_notes: "",
        published: false,
      };

  return (
    <>
      <OpsHeader
        crumb={{ label: "Quality control", href: "/ops/quality", current: isNew ? "Log inspection" : "Inspection" }}
        title={
          insp
            ? `Batch ${insp.batch_no} · ${insp.orders?.brands?.name ?? ""} · ${insp.orders?.order_no ?? ""}`
            : `New inspection · ${formatDate(new Date())}`
        }
      />
      <InspectionForm
        initial={initial}
        orders={orderOptions}
        defectTypes={defectTypes ?? []}
        presets={presets.hold}
        canEdit={me.role === "admin" || me.role === "quality"}
      />
    </>
  );
}
