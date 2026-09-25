"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addisDateISO } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/order-status";
import { notifyMessageToCustomer, notifyOrderUpdate } from "@/lib/notify";

export type OrderActionState = { error?: string; ok?: string } | null;

/** Only admin and sales change orders (RLS enforces the same). */
const EDITORS = ["admin", "sales"] as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TEXT = 1000;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh(orderId?: string) {
  revalidatePath("/ops");
  revalidatePath("/ops/inbox");
  revalidatePath("/ops/orders");
  if (orderId) revalidatePath(`/ops/orders/${orderId}`);
}

/** Database errors in words staff can act on. */
function explain(message: string | undefined): string {
  const m = message ?? "";
  if (/customer_reason is required/.test(m)) return "Write the reason the customer will see.";
  if (/cannot go back|cannot be reopened|Only new or confirmed|Set a due date/.test(m)) return m;
  if (/row-level security|permission/i.test(m)) return "Your role can't change orders.";
  return "Something went wrong saving that. Please try again.";
}

export async function confirmOrder(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  const me = await requireStaff([...EDITORS]);
  const id = str(fd, "order_id");
  const due = str(fd, "due_date");
  if (!DATE.test(due)) return { error: "Set the due date the customer will see." };
  if (due < addisDateISO(new Date())) return { error: "The due date can't be in the past." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({
      status: "confirmed",
      confirmed_due_date: due,
      confirmed_by: me.user_id,
      confirmed_at: new Date().toISOString(),
      customer_reason: null,
    })
    .eq("id", id)
    .eq("status", "submitted")
    .select("id");
  if (error) return { error: explain(error.message) };
  if (!data?.length) return { error: "This order has already been handled." };

  refresh(id);
  notifyOrderUpdate(id);
  return { ok: "Order confirmed. The customer sees it as Confirmed with this due date." };
}

export async function rejectOrder(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  await requireStaff([...EDITORS]);
  const id = str(fd, "order_id");
  const reason = str(fd, "customer_reason");
  if (!reason) return { error: "Write the message the customer will see." };
  if (reason.length > MAX_TEXT) return { error: "Keep the message under 1,000 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "rejected", customer_reason: reason })
    .eq("id", id)
    .in("status", ["submitted", "confirmed"])
    .select("id");
  if (error) return { error: explain(error.message) };
  if (!data?.length) return { error: "Only new or confirmed orders can be rejected." };

  refresh(id);
  notifyOrderUpdate(id);
  return { ok: "Order rejected. The customer sees your message." };
}

/** Post a message to the customer on this order's conversation (starting one if needed). */
async function postToCustomer(orderId: string, body: string, authorId: string): Promise<string | null> {
  const res = await postToCustomerThread(orderId, body, authorId);
  if (typeof res === "string") return res;
  notifyMessageToCustomer(res.threadId, body);
  return null;
}

async function postToCustomerThread(orderId: string, body: string, authorId: string): Promise<string | { threadId: string }> {
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("company_id, order_no")
    .eq("id", orderId)
    .maybeSingle<{ company_id: string; order_no: string }>();
  if (!order) return "Order not found.";

  const { data: existing } = await supabase
    .from("message_threads")
    .select("id")
    .eq("order_id", orderId)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  let threadId = existing?.id;
  if (!threadId) {
    const { data: t, error } = await supabase
      .from("message_threads")
      .insert({
        company_id: order.company_id,
        order_id: orderId,
        subject: `Question about ${order.order_no}`,
        created_by: authorId,
        assigned_to: authorId,
      })
      .select("id")
      .single<{ id: string }>();
    if (error || !t) return "Could not start the conversation.";
    threadId = t.id;
  }

  const { error } = await supabase.from("messages").insert({ thread_id: threadId, author_id: authorId, body, read_by_staff: true });
  if (error) return "Could not send the message.";
  await supabase.from("message_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
  // Replying means the customer's messages have been seen.
  await supabase.from("messages").update({ read_by_staff: true }).eq("thread_id", threadId).eq("read_by_staff", false);
  return { threadId };
}

export async function askCustomer(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  const me = await requireStaff([...EDITORS]);
  const id = str(fd, "order_id");
  const body = str(fd, "body");
  if (!body) return { error: "Write your question for the customer." };
  if (body.length > 4000) return { error: "Keep the message under 4,000 characters." };

  const problem = await postToCustomer(id, body, me.user_id);
  if (problem) return { error: problem };
  refresh(id);
  return { ok: "Sent. The customer sees it on the order and can reply there." };
}

export async function setOrderStatus(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  await requireStaff([...EDITORS]);
  const id = str(fd, "order_id");
  const status = str(fd, "status") as OrderStatus;
  const reason = str(fd, "customer_reason");
  const newDue = str(fd, "due_date");
  if (!ORDER_STATUSES.includes(status) || status === "submitted") return { error: "Choose a status." };
  if (reason.length > MAX_TEXT) return { error: "Keep the customer message under 1,000 characters." };
  if (newDue && !DATE.test(newDue)) return { error: "Check the new due date." };

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("orders")
    .select("status, confirmed_due_date, revised_due_date")
    .eq("id", id)
    .maybeSingle<{ status: OrderStatus; confirmed_due_date: string | null; revised_due_date: string | null }>();
  if (!current) return { error: "Order not found." };
  if (current.status === "submitted") return { error: "Confirm or reject new orders in the Order inbox first." };

  const due = current.revised_due_date ?? current.confirmed_due_date;
  const dateChanged = Boolean(newDue) && newDue !== due;
  if (status === current.status && !dateChanged && !reason) return { error: "Nothing to change." };
  if ((status === "on_hold" || status === "rejected" || dateChanged) && !reason) {
    return { error: "Write the reason the customer will see." };
  }

  const patch: Record<string, unknown> = {
    status,
    // A reason belongs to this change only; an old hold reason must not
    // follow the order into its next status.
    customer_reason: reason || null,
  };
  if (dateChanged) patch.revised_due_date = newDue;

  const { error } = await supabase.from("orders").update(patch).eq("id", id);
  if (error) return { error: explain(error.message) };

  refresh(id);
  if (status !== current.status || dateChanged) notifyOrderUpdate(id, { dateChanged });
  return {
    ok:
      status === current.status
        ? "Saved. The customer sees the update on their order."
        : `Status set to ${ORDER_STATUS_LABELS[status]}.`,
  };
}

export async function saveInternalNotes(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  await requireStaff([...EDITORS]);
  const id = str(fd, "order_id");
  const notes = str(fd, "internal_notes");
  if (notes.length > 4000) return { error: "Keep internal notes under 4,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("orders").update({ internal_notes: notes || null }).eq("id", id);
  if (error) return { error: explain(error.message) };
  refresh(id);
  return { ok: "Saved. Never shown to the customer." };
}

export async function replyToCustomer(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  const me = await requireStaff([...EDITORS]);
  const id = str(fd, "order_id");
  const body = str(fd, "body");
  if (!body) return { error: "Write a reply first." };
  if (body.length > 4000) return { error: "Keep the message under 4,000 characters." };
  const problem = await postToCustomer(id, body, me.user_id);
  if (problem) return { error: problem };
  refresh(id);
  return { ok: "Sent to the customer." };
}
