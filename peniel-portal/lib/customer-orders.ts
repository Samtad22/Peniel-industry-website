import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/order-status";
import type { AttachmentType } from "@/lib/files";
import { buildTimeline, type TimelineStep } from "@/lib/order-timeline";
import { rejectPctAfterSorting } from "@/lib/sorting";
import type { CustomerProof } from "@/components/customer/ProofCard";
import { crownSrc } from "@/components/ui/Crown";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CustomerBrand = {
  id: string;
  name: string;
  size: string;
  liner: string;
  finish: string | null;
  colours: string[];
  crown_image_path: string | null;
  active: boolean;
};

/** `26mm · Gloss` — the brand's crown, without its liner. */
export const brandSpec = (b: Pick<CustomerBrand, "size" | "finish">) => [b.size, b.finish].filter(Boolean).join(" · ");

export type CustomerMessage = {
  id: string;
  body: string;
  from_peniel: boolean;
  author_name: string;
  created_at: string;
};

export type CustomerOrderDetailData = {
  id: string;
  order_no: string;
  po_number: string;
  brand_id: string;
  brand_name: string;
  spec: string;
  liner: string;
  /** Crown image URL (null: none on file) and the brand's print colours. */
  crown: string | null;
  colours: string[];
  size: string;
  quantity: number;
  completed_qty: number;
  /** Final rejects after Peniel's sorting over the crowns produced; null until reported. */
  reject_pct: number | null;
  due_date: string | null;
  requested_date: string | null;
  status: OrderStatus;
  customer_reason: string | null;
  delivery_method: "pickup" | "delivery";
  delivery_address: string | null;
  updated_at: string;
  steps: TimelineStep[];
  attachments: { id: string; file_name: string; type: AttachmentType; size_bytes: number }[];
  /** Proofs sent for this order that are waiting for the customer's answer. */
  proofs: CustomerProof[];
  /** Conversation with Peniel about this order; replies go to `threadId`. */
  threadId: string | null;
  messages: CustomerMessage[];
};

/**
 * One order as its customer sees it. Reads only customer_* views, so another
 * company's order ID simply returns null (CLAUDE.md rule 1).
 */
export async function loadCustomerOrder(supabase: Supabase, id: string): Promise<CustomerOrderDetailData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { data: o } = await supabase
    .from("customer_orders")
    .select(
      "id, order_no, po_number, brand_id, brand_name, quantity, completed_qty, reject_pct, due_date, requested_date, status, customer_reason, delivery_method, delivery_address, updated_at",
    )
    .eq("id", id)
    .maybeSingle<Omit<CustomerOrderDetailData, "spec" | "liner" | "crown" | "colours" | "size" | "steps" | "attachments" | "proofs" | "threadId" | "messages">>();
  if (!o) return null;

  const [{ data: brand }, { data: events }, { data: files }, { data: threads }, { data: proofs }] = await Promise.all([
    supabase.from("customer_brands").select("id, size, finish, liner, colours, crown_image_path").eq("id", o.brand_id).maybeSingle<CustomerBrand>(),
    supabase
      .from("customer_order_timeline")
      .select("status, created_at, customer_reason")
      .eq("order_id", id)
      .order("created_at")
      .returns<{ status: OrderStatus; created_at: string; customer_reason: string | null }[]>(),
    supabase
      .from("customer_order_attachments")
      .select("id, file_name, type, size_bytes")
      .eq("order_id", id)
      .order("created_at")
      .returns<CustomerOrderDetailData["attachments"]>(),
    supabase
      .from("customer_message_threads")
      .select("id")
      .eq("order_id", id)
      .order("last_message_at", { ascending: false })
      .returns<{ id: string }[]>(),
    supabase
      .from("customer_proofs")
      .select("id, version, brand_name, order_no, status, note, approve_by, created_at, file_name, mime_type, physical_delivery, courier, tracking_number")
      .eq("order_id", id)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .returns<CustomerProof[]>(),
  ]);

  const threadIds = (threads ?? []).map((t) => t.id);
  const { data: messages } = threadIds.length
    ? await supabase
        .from("customer_messages")
        .select("id, body, from_peniel, author_name, created_at")
        .in("thread_id", threadIds)
        .order("created_at")
        .returns<CustomerMessage[]>()
    : { data: [] as CustomerMessage[] };

  return {
    ...o,
    quantity: Number(o.quantity),
    completed_qty: Number(o.completed_qty),
    reject_pct: o.reject_pct == null ? null : Number(o.reject_pct),
    spec: brand ? brandSpec(brand) : "",
    liner: brand?.liner ?? "",
    crown: brand ? crownSrc(brand) : null,
    colours: brand?.colours ?? [],
    size: brand?.size ?? "",
    steps: buildTimeline({
      status: o.status,
      delivery_method: o.delivery_method,
      due_date: o.due_date,
      events: events ?? [],
    }),
    attachments: (files ?? []).map((f) => ({ ...f, size_bytes: Number(f.size_bytes) })),
    proofs: proofs ?? [],
    threadId: threadIds[0] ?? null,
    messages: messages ?? [],
  };
}

/**
 * "Preview as customer" for staff: the same order in the customer's shape,
 * built from the staff tables with the staff member's own client (RLS still
 * applies). Only the columns the customer_* views expose are selected, and
 * the same filters are applied: published production only, no internal
 * messages, proofs still waiting for an answer.
 */
export async function loadCustomerOrderPreview(supabase: Supabase, id: string): Promise<CustomerOrderDetailData | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const { data: o } = await supabase
    .from("orders")
    .select(
      "id, order_no, po_number, brand_id, quantity, requested_date, confirmed_due_date, revised_due_date, status, customer_reason, delivery_method, delivery_address, updated_at, brands(id, name, size, finish, liner, colours, crown_image_path)",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      order_no: string;
      po_number: string;
      brand_id: string;
      quantity: number;
      requested_date: string | null;
      confirmed_due_date: string | null;
      revised_due_date: string | null;
      status: OrderStatus;
      customer_reason: string | null;
      delivery_method: "pickup" | "delivery";
      delivery_address: string | null;
      updated_at: string;
      brands: { id: string; name: string; size: string; finish: string | null; liner: string; colours: string[]; crown_image_path: string | null } | null;
    }>();
  if (!o) return null;

  const [{ data: output }, { data: events }, { data: files }, { data: threads }, { data: proofs }, { data: sorted }] = await Promise.all([
    supabase.from("production_entries").select("produced_qty, reject_qty").eq("order_id", id).eq("published", true),
    supabase
      .from("order_status_events")
      .select("status, created_at, customer_reason")
      .eq("order_id", id)
      .order("created_at")
      .returns<{ status: OrderStatus; created_at: string; customer_reason: string | null }[]>(),
    supabase
      .from("order_attachments")
      .select("id, file_name, type, size_bytes")
      .eq("order_id", id)
      .order("created_at")
      .returns<CustomerOrderDetailData["attachments"]>(),
    supabase.from("message_threads").select("id").eq("order_id", id).order("last_message_at", { ascending: false }).returns<{ id: string }[]>(),
    supabase
      .from("proofs")
      .select("id, version, status, note, approve_by, created_at, file_name, mime_type, physical_delivery, courier, tracking_number")
      .eq("order_id", id)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .returns<Omit<CustomerProof, "brand_name" | "order_no">[]>(),
    supabase.from("sorting_records").select("waste_cartons").eq("order_id", id).returns<{ waste_cartons: number }[]>(),
  ]);

  const threadIds = (threads ?? []).map((t) => t.id);
  const { data: messages } = threadIds.length
    ? await supabase
        .from("messages")
        .select("id, body, created_at, author:profiles!messages_author_id_fkey(full_name, role)")
        .in("thread_id", threadIds)
        .eq("internal", false)
        .order("created_at")
        .returns<{ id: string; body: string; created_at: string; author: { full_name: string; role: string } | null }[]>()
    : { data: [] };

  const due = o.revised_due_date ?? o.confirmed_due_date;
  const brandName = o.brands?.name ?? "";
  return {
    id: o.id,
    order_no: o.order_no,
    po_number: o.po_number,
    brand_id: o.brand_id,
    brand_name: brandName,
    spec: o.brands ? brandSpec(o.brands) : "",
    liner: o.brands?.liner ?? "",
    crown: o.brands ? crownSrc(o.brands) : null,
    colours: o.brands?.colours ?? [],
    size: o.brands?.size ?? "",
    quantity: Number(o.quantity),
    completed_qty: (output ?? []).reduce((s, e) => s + Number(e.produced_qty) - Number(e.reject_qty), 0),
    // As customer_orders.reject_pct: waste after sorting over the crowns produced.
    reject_pct: sorted?.length
      ? rejectPctAfterSorting(
          (output ?? []).reduce((s, e) => s + Number(e.produced_qty), 0),
          sorted.reduce((s, r) => s + Number(r.waste_cartons), 0),
        )
      : null,
    due_date: due,
    requested_date: o.requested_date,
    status: o.status,
    customer_reason: o.customer_reason,
    delivery_method: o.delivery_method,
    delivery_address: o.delivery_address,
    updated_at: o.updated_at,
    steps: buildTimeline({ status: o.status, delivery_method: o.delivery_method, due_date: due, events: events ?? [] }),
    attachments: (files ?? []).map((f) => ({ ...f, size_bytes: Number(f.size_bytes) })),
    proofs: (proofs ?? []).map((p) => ({ ...p, brand_name: brandName, order_no: o.order_no })),
    threadId: threadIds[0] ?? null,
    messages: (messages ?? []).map((m) => ({
      id: m.id,
      body: m.body,
      from_peniel: m.author?.role !== "customer_user",
      author_name: m.author?.full_name ?? "",
      created_at: m.created_at,
    })),
  };
}
