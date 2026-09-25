"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { opsRolesFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { messageBody, parseMessageFiles, type MessageFile } from "@/lib/message-files";
import { notifyMessageToCustomer } from "@/lib/notify";

export type MessageState = { error?: string; ok?: string } | null;

const UUID = /^[0-9a-f-]{36}$/i;
const MAX = 4000;

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Insert a staff message and its files. Returns false if either fails. */
async function insertMessage(
  supabase: Supabase,
  m: { thread_id: string; author_id: string; body: string; internal?: boolean },
  files: MessageFile[],
): Promise<boolean> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ ...m, internal: m.internal ?? false, read_by_staff: true })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return false;
  if (!files.length) return true;
  const { error: fe } = await supabase.from("message_attachments").insert(
    files.map((f) => ({ message_id: data.id, file_path: f.path, file_name: f.name, size_bytes: f.size, mime_type: f.mime })),
  );
  if (fe) {
    console.error("message_attachments insert failed", fe.code, fe.message);
    // Don't leave a message saying "see attached" without its files.
    await supabase.from("messages").delete().eq("id", data.id);
    return false;
  }
  return true;
}

function refresh() {
  revalidatePath("/ops/messages");
  revalidatePath("/ops", "layout");
}

/** Reply to the customer, or leave an internal note the customer never sees. */
export async function sendStaffMessage(_prev: MessageState, fd: FormData): Promise<MessageState> {
  const me = await requireStaff(opsRolesFor("messages"));
  const threadId = String(fd.get("thread_id") ?? "");
  const internal = fd.get("kind") === "internal";
  if (!UUID.test(threadId)) return { error: "Choose a conversation." };

  const supabase = await createClient();
  const { data: t } = await supabase.from("message_threads").select("company_id").eq("id", threadId).maybeSingle<{ company_id: string }>();
  if (!t) return { error: "Choose a conversation." };
  const files = parseMessageFiles(fd.get("attachments"), t.company_id);
  if ("error" in files) return files;
  const body = messageBody(String(fd.get("body") ?? "").trim(), files);
  if (!body) return { error: "Write a message or attach a file." };
  if (body.length > MAX) return { error: "Keep messages under 4,000 characters." };

  if (!(await insertMessage(supabase, { thread_id: threadId, author_id: me.user_id, body, internal }, files))) {
    return { error: "Couldn't send. Please try again." };
  }
  if (!internal) {
    await supabase.from("message_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
    notifyMessageToCustomer(threadId, body, files.length);
  }
  await supabase.from("messages").update({ read_by_staff: true }).eq("thread_id", threadId).eq("read_by_staff", false);
  refresh();
  return { ok: internal ? "Internal note added. The customer can't see it." : "Sent to the customer." };
}

export async function assignThread(fd: FormData): Promise<void> {
  await requireStaff(opsRolesFor("messages"));
  const threadId = String(fd.get("thread_id") ?? "");
  const userId = String(fd.get("assigned_to") ?? "");
  if (!UUID.test(threadId)) return;
  const supabase = await createClient();
  await supabase.from("message_threads").update({ assigned_to: UUID.test(userId) ? userId : null }).eq("id", threadId);
  refresh();
}

/** Staff start a conversation with a customer, optionally about one order. */
export async function startThread(_prev: MessageState, fd: FormData): Promise<MessageState> {
  const me = await requireStaff(opsRolesFor("messages"));
  const companyId = String(fd.get("company_id") ?? "");
  const orderId = String(fd.get("order_id") ?? "");
  const subject = String(fd.get("subject") ?? "").trim();
  if (!UUID.test(companyId)) return { error: "Choose the customer." };
  const files = parseMessageFiles(fd.get("attachments"), companyId);
  if ("error" in files) return files;
  const body = messageBody(String(fd.get("body") ?? "").trim(), files);
  if (!subject) return { error: "Add a subject." };
  if (!body) return { error: "Write a message or attach a file." };
  if (subject.length > 150 || body.length > MAX) return { error: "That message is too long." };

  const supabase = await createClient();
  if (UUID.test(orderId)) {
    const { data: o } = await supabase.from("orders").select("company_id").eq("id", orderId).maybeSingle<{ company_id: string }>();
    if (o?.company_id !== companyId) return { error: "That order belongs to a different customer." };
  }
  const { data: t, error } = await supabase
    .from("message_threads")
    .insert({
      company_id: companyId,
      order_id: UUID.test(orderId) ? orderId : null,
      subject,
      created_by: me.user_id,
      assigned_to: me.user_id,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !t) return { error: "Couldn't start the conversation." };
  if (!(await insertMessage(supabase, { thread_id: t.id, author_id: me.user_id, body }, files))) {
    await supabase.from("message_threads").delete().eq("id", t.id);
    return { error: "Couldn't send. Please try again." };
  }
  notifyMessageToCustomer(t.id, body, files.length);
  refresh();
  redirect(`/ops/messages?t=${t.id}`);
}
