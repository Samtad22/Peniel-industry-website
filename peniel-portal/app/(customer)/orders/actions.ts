"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fileProblem, mimeFor, type AttachmentType } from "@/lib/files";
import { notifyMessageToStaff, notifyOrderSubmitted } from "@/lib/notify";

export type SubmitOrderInput = {
  brandId: string;
  poNumber: string;
  quantity: number;
  requestedDate: string | null;
  deliveryMethod: "pickup" | "delivery";
  deliveryAddress: string;
  attachments: { path: string; name: string; size: number; type: AttachmentType }[];
};

export type ActionState = { error?: string; ok?: string } | null;

const TYPES: AttachmentType[] = ["purchase_order", "specification", "other"];

/** Messages from customer_submit_order that are safe to show as they are. */
const KNOWN = /PO number is required|Quantity must be|requested date is in the past|delivery address is required|Attach your purchase order|Attach up to 10 files/;

/**
 * Places the order and records its (already uploaded) files in one
 * database call, so an order never exists without its PO.
 */
export async function submitOrder(input: SubmitOrderInput): Promise<ActionState> {
  await requireCustomer();

  const quantity = Math.round(Number(input.quantity));
  if (!input.brandId) return { error: "Choose a brand." };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Enter the number of crowns." };
  if (!input.poNumber.trim()) return { error: "Enter your PO number." };
  if (input.requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.requestedDate)) return { error: "Check the requested date." };
  if (!Array.isArray(input.attachments) || input.attachments.length > 10) return { error: "Attach up to 10 files." };
  for (const a of input.attachments) {
    const problem = fileProblem(a);
    if (problem || !TYPES.includes(a.type)) return { error: `${a.name}: ${problem ?? "choose a file type"}` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("customer_submit_order", {
      p_brand_id: input.brandId,
      p_po_number: input.poNumber,
      p_quantity: quantity,
      p_requested_date: input.requestedDate || null,
      p_delivery_method: input.deliveryMethod === "delivery" ? "delivery" : "pickup",
      p_delivery_address: input.deliveryAddress,
      p_attachments: input.attachments.map((a) => ({
        path: a.path,
        name: a.name,
        size: a.size,
        mime: mimeFor(a.name),
        type: a.type,
      })),
    })
    .single<{ id: string; order_no: string }>();

  if (error || !data) {
    console.error("customer_submit_order failed", error?.code, error?.message);
    return {
      error: KNOWN.test(error?.message ?? "")
        ? error!.message
        : "We couldn't submit the order. Your details are still here, so please try again.",
    };
  }

  revalidatePath("/orders");
  notifyOrderSubmitted(data.id);
  redirect(`/orders?submitted=${data.id}`);
}

/** Reply to Peniel on an order's conversation. */
export async function replyOnOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireCustomer();
  const threadId = String(formData.get("thread_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a reply first." };
  if (body.length > 4000) return { error: "Please keep replies under 4,000 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_send_message", { p_body: body, p_thread_id: threadId });
  if (error) return { error: "We couldn't send your reply. Please try again." };
  notifyMessageToStaff(threadId, body);

  revalidatePath("/orders");
  return { ok: "Sent. Peniel will reply here." };
}
