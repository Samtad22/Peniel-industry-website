import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/order-status";
import type { AttachmentType } from "@/lib/files";
import { buildTimeline, type TimelineStep } from "@/lib/order-timeline";
import type { CustomerProof } from "@/components/customer/ProofCard";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CustomerBrand = {
  id: string;
  name: string;
  size: string;
  liner: string;
  finish: string | null;
  colours: string[];
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
  quantity: number;
  completed_qty: number;
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
      "id, order_no, po_number, brand_id, brand_name, quantity, completed_qty, due_date, requested_date, status, customer_reason, delivery_method, delivery_address, updated_at",
    )
    .eq("id", id)
    .maybeSingle<Omit<CustomerOrderDetailData, "spec" | "liner" | "steps" | "attachments" | "proofs" | "threadId" | "messages">>();
  if (!o) return null;

  const [{ data: brand }, { data: events }, { data: files }, { data: threads }, { data: proofs }] = await Promise.all([
    supabase.from("customer_brands").select("size, finish, liner").eq("id", o.brand_id).maybeSingle<CustomerBrand>(),
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
      .select("id, version, brand_name, order_no, status, note, approve_by, created_at, file_name, mime_type")
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
    spec: brand ? brandSpec(brand) : "",
    liner: brand?.liner ?? "",
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
