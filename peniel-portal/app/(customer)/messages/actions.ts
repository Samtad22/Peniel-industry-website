"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { messageBody, parseMessageFiles } from "@/lib/message-files";
import { notifyMessageToStaff } from "@/lib/notify";

export type CustomerMessageState = { error?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Start a conversation with Peniel, or reply in one, with any files already
 * uploaded (customer_send_message checks the thread and files are yours).
 */
export async function sendToPeniel(_prev: CustomerMessageState, fd: FormData): Promise<CustomerMessageState> {
  const me = await requireCustomer();
  const threadId = String(fd.get("thread_id") ?? "");
  const subject = String(fd.get("subject") ?? "").trim();
  const orderId = String(fd.get("order_id") ?? "");
  const files = parseMessageFiles(fd.get("attachments"), me.company_id);
  if ("error" in files) return files;
  const body = messageBody(String(fd.get("body") ?? "").trim(), files);
  if (!body) return { error: "Write your message or attach a file." };
  if (body.length > 4000 || subject.length > 150) return { error: "That message is too long." };
  if (!threadId && !subject) return { error: "Add a subject." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_send_message", {
    p_body: body,
    p_thread_id: UUID.test(threadId) ? threadId : null,
    p_subject: subject || null,
    p_order_id: UUID.test(orderId) ? orderId : null,
    p_attachments: files,
  });
  if (error || !data) {
    console.error("customer_send_message failed", error?.code, error?.message);
    return { error: "We couldn't send your message. Please try again." };
  }
  revalidatePath("/messages");
  revalidatePath("/orders");
  notifyMessageToStaff(data as string, body, files.length);
  redirect(`/messages?t=${data}`);
}
