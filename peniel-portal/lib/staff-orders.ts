import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { describeAudit, type AuditRow } from "@/lib/audit";
import type { AttachmentType } from "@/lib/files";
import type { OrderStatus } from "@/lib/order-status";
import { buildTimeline, type TimelineStep } from "@/lib/order-timeline";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type StaffAttachment = { id: string; file_name: string; type: AttachmentType; size_bytes: number; mime_type: string };

export type StaffMessage = { id: string; body: string; author: string; from_customer: boolean; created_at: string };

export type StaffOrder = {
  id: string;
  order_no: string;
  company_id: string;
  company: string;
  brand: string;
  brand_colours: string[];
  spec: string;
  liner: string;
  po_number: string;
  quantity: number;
  requested_date: string | null;
  confirmed_due_date: string | null;
  revised_due_date: string | null;
  due_date: string | null;
  delivery_method: "pickup" | "delivery";
  delivery_address: string | null;
  status: OrderStatus;
  customer_reason: string | null;
  internal_notes: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  attachments: StaffAttachment[];
  steps: TimelineStep[];
  messages: StaffMessage[];
  activity: { when: string; who: string; what: string; detail: string }[];
  production: { entries: number; produced: number; rejects: number; lines: string[]; batches: { batch_no: string; result: string | null }[] };
};

type OrderRow = Omit<
  StaffOrder,
  "company" | "brand" | "brand_colours" | "spec" | "liner" | "due_date" | "attachments" | "steps" | "messages" | "activity" | "production" | "submitted_by"
> & {
  companies: { name: string } | null;
  brands: { name: string; size: string; finish: string | null; liner: string; colours: string[] } | null;
  submitter: { full_name: string } | null;
};

/** Short line label for tables: "Line 1 — Press A" → "L1". */
export const shortLine = (name: string) => name.split(/\s+[—-]\s+/)[0].replace(/^Line\s*/i, "L");

/**
 * Everything the staff order page (design 1f) and the inbox (1c) show. Read
 * with the staff member's own client, so RLS applies.
 */
export async function loadStaffOrder(supabase: Supabase, id: string): Promise<StaffOrder | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { data: o } = await supabase
    .from("orders")
    .select(
      `id, order_no, company_id, po_number, quantity, requested_date, confirmed_due_date, revised_due_date,
       delivery_method, delivery_address, status, customer_reason, internal_notes, created_at, updated_at,
       companies(name), brands(name, size, finish, liner, colours),
       submitter:profiles!orders_submitted_by_fkey(full_name)`,
    )
    .eq("id", id)
    .maybeSingle<OrderRow>();
  if (!o) return null;

  const [files, events, threads, audit, attachAudit, entries, inspections] = await Promise.all([
    supabase
      .from("order_attachments")
      .select("id, file_name, type, size_bytes, mime_type")
      .eq("order_id", id)
      .order("created_at")
      .returns<StaffAttachment[]>(),
    supabase
      .from("order_status_events")
      .select("status, created_at, customer_reason")
      .eq("order_id", id)
      .order("created_at")
      .returns<{ status: OrderStatus; created_at: string; customer_reason: string | null }[]>(),
    supabase.from("message_threads").select("id").eq("order_id", id).returns<{ id: string }[]>(),
    supabase
      .from("audit_log")
      .select("actor, action, entity, before, after, created_at")
      .eq("entity", "orders")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(40)
      .returns<(AuditRow & { actor: string | null; created_at: string })[]>(),
    supabase
      .from("audit_log")
      .select("actor, action, entity, before, after, created_at")
      .eq("entity", "order_attachments")
      .eq("after->>order_id", id)
      .order("created_at", { ascending: false })
      .limit(20)
      .returns<(AuditRow & { actor: string | null; created_at: string })[]>(),
    supabase
      .from("production_entries")
      .select("produced_qty, reject_qty, production_lines(name)")
      .eq("order_id", id)
      .returns<{ produced_qty: number; reject_qty: number; production_lines: { name: string } | null }[]>(),
    supabase
      .from("qc_inspections")
      .select("batch_no, result")
      .eq("order_id", id)
      .order("inspected_at")
      .returns<{ batch_no: string; result: string | null }[]>(),
  ]);

  const threadIds = (threads.data ?? []).map((t) => t.id);
  const { data: msgs } = threadIds.length
    ? await supabase
        .from("messages")
        .select("id, body, created_at, profiles(full_name, role)")
        .in("thread_id", threadIds)
        .order("created_at")
        .returns<{ id: string; body: string; created_at: string; profiles: { full_name: string; role: string } | null }[]>()
    : { data: [] };

  const log = [...(audit.data ?? []), ...(attachAudit.data ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const actorIds = [...new Set(log.map((r) => r.actor).filter((x): x is string => Boolean(x)))];
  const { data: actors } = actorIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .in("user_id", actorIds)
        .returns<{ user_id: string; full_name: string; role: string }[]>()
    : { data: [] };
  const who = new Map((actors ?? []).map((p) => [p.user_id, p.role === "customer_user" ? `${p.full_name} (customer)` : p.full_name]));

  const e = entries.data ?? [];
  const due = o.revised_due_date ?? o.confirmed_due_date;

  return {
    ...o,
    quantity: Number(o.quantity),
    company: o.companies?.name ?? "—",
    brand: o.brands?.name ?? "—",
    brand_colours: o.brands?.colours ?? [],
    spec: [o.brands?.size, o.brands?.finish].filter(Boolean).join(" · "),
    liner: o.brands?.liner ?? "",
    submitted_by: o.submitter?.full_name ?? null,
    due_date: due,
    attachments: (files.data ?? []).map((f) => ({ ...f, size_bytes: Number(f.size_bytes) })),
    steps: buildTimeline({ status: o.status, delivery_method: o.delivery_method, due_date: due, events: events.data ?? [] }),
    messages: (msgs ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      author: m.profiles?.full_name ?? "—",
      from_customer: m.profiles?.role === "customer_user",
      created_at: m.created_at,
    })),
    activity: log.map((r) => ({
      when: r.created_at,
      who: (r.actor && who.get(r.actor)) || "System",
      ...describeAudit(r),
    })),
    production: {
      entries: e.length,
      produced: e.reduce((s, x) => s + Number(x.produced_qty), 0),
      rejects: e.reduce((s, x) => s + Number(x.reject_qty), 0),
      lines: [...new Set(e.map((x) => x.production_lines?.name).filter((x): x is string => Boolean(x)))],
      batches: inspections.data ?? [],
    },
  };
}

// ---------------------------------------------------------------------------
// All orders (design 1e)
// ---------------------------------------------------------------------------

export type OrderFilters = { q: string; customer: string; brand: string; status: string; due: string };

export const DUE_WINDOWS: Record<string, { label: string; days: number | null }> = {
  all: { label: "Any date", days: null },
  "7": { label: "Next 7 days", days: 7 },
  "30": { label: "Next 30 days", days: 30 },
  "90": { label: "Next 90 days", days: 90 },
  overdue: { label: "Overdue", days: 0 },
};

export function parseOrderFilters(sp: Record<string, string | undefined>): OrderFilters {
  return {
    q: (sp.q ?? "").trim().slice(0, 60),
    customer: /^[0-9a-f-]{36}$/i.test(sp.customer ?? "") ? sp.customer! : "",
    brand: /^[0-9a-f-]{36}$/i.test(sp.brand ?? "") ? sp.brand! : "",
    status: sp.status ?? "open",
    due: sp.due && sp.due in DUE_WINDOWS ? sp.due : "all",
  };
}

export type StaffOrderRow = {
  id: string;
  order_no: string;
  company: string;
  brand: string;
  po_number: string;
  product: string;
  quantity: number;
  requested_date: string | null;
  due_date: string | null;
  status: OrderStatus;
  lines: string[];
};

type ListRow = {
  id: string;
  order_no: string;
  po_number: string;
  quantity: number;
  requested_date: string | null;
  confirmed_due_date: string | null;
  revised_due_date: string | null;
  status: OrderStatus;
  companies: { name: string } | null;
  brands: { name: string; size: string; finish: string | null; liner: string } | null;
};

/** Orders across all customers, filtered, newest first (max 1,000). */
export async function listStaffOrders(supabase: Supabase, f: OrderFilters, today: string): Promise<StaffOrderRow[]> {
  let query = supabase
    .from("orders")
    .select(
      "id, order_no, po_number, quantity, requested_date, confirmed_due_date, revised_due_date, status, companies(name), brands(name, size, finish, liner)",
    )
    .order("created_at", { ascending: false })
    .limit(1000);
  if (f.customer) query = query.eq("company_id", f.customer);
  if (f.brand) query = query.eq("brand_id", f.brand);
  if (f.status === "open") query = query.not("status", "in", "(delivered,rejected)");
  else if (f.status !== "all") query = query.eq("status", f.status);

  const { data } = await query.returns<ListRow[]>();
  const q = f.q.toLowerCase();
  const window = DUE_WINDOWS[f.due];
  const rows = (data ?? [])
    .map((o) => ({
      id: o.id,
      order_no: o.order_no,
      company: o.companies?.name ?? "—",
      brand: o.brands?.name ?? "—",
      po_number: o.po_number,
      product: [o.brands?.size, o.brands?.finish, o.brands?.liner].filter(Boolean).join(" · "),
      quantity: Number(o.quantity),
      requested_date: o.requested_date,
      due_date: o.revised_due_date ?? o.confirmed_due_date,
      status: o.status,
      lines: [] as string[],
    }))
    .filter((o) => !q || [o.order_no, o.po_number, o.company, o.brand].some((v) => v.toLowerCase().includes(q)))
    .filter((o) => {
      if (window.days === null) return true;
      const due = o.due_date ?? o.requested_date;
      if (!due) return false;
      if (f.due === "overdue") return due < today && o.status !== "delivered";
      const end = new Date(`${today}T12:00:00Z`);
      end.setUTCDate(end.getUTCDate() + window.days);
      return due >= today && due <= end.toISOString().slice(0, 10);
    });

  // Which lines ran each order (internal; staff only).
  if (rows.length) {
    const { data: entries } = await supabase
      .from("production_entries")
      .select("order_id, production_lines(name)")
      .in("order_id", rows.map((r) => r.id).slice(0, 300))
      .returns<{ order_id: string; production_lines: { name: string } | null }[]>();
    const byOrder = new Map<string, Set<string>>();
    for (const e of entries ?? []) {
      if (!e.production_lines) continue;
      if (!byOrder.has(e.order_id)) byOrder.set(e.order_id, new Set());
      byOrder.get(e.order_id)!.add(shortLine(e.production_lines.name));
    }
    for (const r of rows) r.lines = [...(byOrder.get(r.id) ?? [])].sort();
  }
  return rows;
}
